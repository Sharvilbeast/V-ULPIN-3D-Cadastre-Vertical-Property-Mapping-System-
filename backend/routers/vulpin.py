"""V-ULPIN allocation and unit extrusion endpoints."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from geoalchemy2.shape import WKTElement, from_shape
from shapely.geometry import Polygon
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session
from ..models import Building, Parcel, UnitLifecycle, VerticalUnit
from ..schemas import ExtrudeRequest, ExtrudeResponse, GeoJSONFeature, UnitProperties
from ..spatial_engine import (
    METRIC_SRID,
    check_spatial_collision,
    extrude_floor_unit,
    generate_v_ulpin,
    geojson_to_metric_polygon,
    metric_polygon_to_geojson,
)
from ..store import BUILDINGS, UNITS

router = APIRouter(prefix="/api/v-ulpin", tags=["v-ulpin"])


@router.post("/extrude", response_model=ExtrudeResponse, status_code=201)
async def extrude_unit(
    payload: ExtrudeRequest,
    session: Optional[AsyncSession] = Depends(get_session),
) -> ExtrudeResponse:
    building = BUILDINGS.get(payload.building_id)
    if building is None and session is None:
        raise HTTPException(status_code=404, detail="Building not found in demo inventory")
    if building is not None and building["base_ulpin"] != payload.base_ulpin:
        raise HTTPException(status_code=422, detail="Base ULPIN does not match this building")

    try:
        identifier = generate_v_ulpin(
            payload.base_ulpin, payload.tower_id, payload.floor_index,
            payload.unit_no, payload.unit_type,
        )
        metric_polygon = geojson_to_metric_polygon(payload.boundary.model_dump())
        z_min = payload.ground_elevation_m + payload.floor_index * payload.floor_to_floor_m
        z_max = z_min + payload.ceiling_height_m
        solid_wkt = extrude_floor_unit(metric_polygon.wkt, z_min, z_max, METRIC_SRID)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    if identifier in UNITS:
        raise HTTPException(status_code=409, detail="V-ULPIN already exists and cannot be reused")
    collisions = await check_spatial_collision(solid_wkt, payload.building_id)
    audit = _audit_response(payload.building_id, collisions, len(UNITS))
    if collisions:
        raise HTTPException(status_code=409, detail={
            "message": "Unit rejected because its 3D volume overlaps existing units",
            "collisions": collisions,
        })

    area = metric_polygon.area
    properties = UnitProperties(
        v_ulpin=identifier,
        building_id=payload.building_id,
        tower_id=payload.tower_id,
        level=payload.floor_index,
        unit_no=payload.unit_no,
        type=payload.unit_type,
        area_sqm=round(area, 3),
        volume_m3=round(area * (z_max - z_min), 3),
        z_min_m=round(z_min, 3),
        z_max_m=round(z_max, 3),
        owner_name=payload.owner_name,
        status="Pending review",
        rera_compliant=payload.unit_type in ("RES", "COM"),
        source_status=payload.source_status,
    )
    feature = GeoJSONFeature(
        id=identifier,
        geometry=metric_polygon_to_geojson(metric_polygon),
        properties=properties,
    )
    stored = feature.model_dump(mode="json")
    stored["metric_footprint_wkt"] = metric_polygon.wkt
    stored["solid_wkt"] = solid_wkt
    UNITS[identifier] = stored

    if session is not None:
        parcel = await session.get(Parcel, payload.base_ulpin)
        if parcel is None:
            parcel = Parcel(
                base_ulpin=payload.base_ulpin,
                footprint=from_shape(metric_polygon, srid=METRIC_SRID),
                footprint_wgs84=from_shape(Polygon(payload.boundary.coordinates[0]), srid=4326),
                vertical_datum="demo local orthometric datum",
                elevation_datum_m=payload.ground_elevation_m,
                source_metadata={"ingest": "V-ULPIN extrude API"},
            )
            session.add(parcel)
        db_building = await session.get(Building, payload.building_id)
        if db_building is None:
            db_building = Building(
                building_id=payload.building_id,
                base_ulpin=payload.base_ulpin,
                building_code=payload.tower_id,
                name=payload.building_id,
                ground_elevation_m=payload.ground_elevation_m,
                vertical_datum="demo local orthometric datum",
                floors_above_ground=0,
                floors_below_ground=0,
                status="review",
            )
            session.add(db_building)
        session.add(VerticalUnit(
            v_ulpin=identifier,
            building_id=payload.building_id,
            floor_index=payload.floor_index,
            unit_no=payload.unit_no,
            unit_type=payload.unit_type,
            boundary=WKTElement(solid_wkt, srid=METRIC_SRID),
            footprint=from_shape(metric_polygon, srid=METRIC_SRID),
            z_min_m=z_min,
            z_max_m=z_max,
            area_sqm=area,
            volume_m3=area * (z_max - z_min),
            owner_name=payload.owner_name,
            ownership_status="Pending review",
            rera_compliant=properties.rera_compliant,
            source_status=payload.source_status,
        ))
        session.add(UnitLifecycle(
            event_type="created",
            prior_v_ulpins=[],
            resulting_v_ulpins=[identifier],
            effective_at=datetime.now(timezone.utc),
            actor_id="demo-surveyor",
            provenance={"source_status": payload.source_status},
        ))
        await session.commit()

    return ExtrudeResponse(accepted=True, v_ulpin=identifier, feature=feature, collision_check=audit)


def _audit_response(building_id: str, collisions: list[dict], checked: int):
    from ..schemas import AuditResponse, Clash

    clashes = [Clash.model_validate(item) for item in collisions]
    return AuditResponse(
        building_id=building_id,
        status="fail" if clashes else "pass",
        checked_units=checked,
        clash_count=len(clashes),
        tolerance_m3=0.001,
        violations=clashes,
        heatmap=[{
            "v_ulpin": clash.unit_v_ulpin,
            "level": clash.level,
            "intensity": min(1.0, clash.overlap_volume_m3 / 1.0),
            "overlap_volume_m3": clash.overlap_volume_m3,
        } for clash in clashes],
    )