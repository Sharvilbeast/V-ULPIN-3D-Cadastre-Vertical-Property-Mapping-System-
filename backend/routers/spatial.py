"""3D GeoJSON, tileset metadata, and topology audit endpoints."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Header, HTTPException, Query
from shapely import wkt

from ..schemas import AuditRequest, AuditResponse, Clash, FeatureCollection, GeoJSONFeature
from ..spatial_engine import (
    OVERLAP_TOLERANCE_M3,
    check_spatial_collision,
    extrude_floor_unit,
    geojson_to_metric_polygon,
    metric_polygon_to_geojson,
)
from ..store import BUILDINGS, UNITS

router = APIRouter(prefix="/api", tags=["spatial"])


def _features_for_building(building_id: str) -> list[dict[str, Any]]:
    return [
        feature for feature in UNITS.values()
        if feature["properties"]["building_id"] == building_id
    ]


@router.get("/buildings/{building_id}/geojson-3d", response_model=FeatureCollection)
async def building_geojson(
    building_id: str,
    x_user_role: str = Header("public", alias="X-User-Role"),
    role: Optional[str] = Query(None),
) -> FeatureCollection:
    if building_id not in BUILDINGS:
        raise HTTPException(status_code=404, detail="Building not found")
    effective_role = role or x_user_role or "public"
    features = []
    for raw in _features_for_building(building_id):
        item = GeoJSONFeature.model_validate({
            k: v for k, v in raw.items() if k not in ("metric_footprint_wkt", "solid_wkt")
        })
        features.append(GeoJSONFeature(
            type=item.type,
            id=item.id,
            geometry=item.geometry,
            properties=item.properties.for_role(effective_role),
        ))
    return FeatureCollection(features=features)


@router.get("/buildings/{building_id}/tileset-metadata")
async def tileset_metadata(building_id: str) -> dict[str, Any]:
    building = BUILDINGS.get(building_id)
    if building is None:
        raise HTTPException(status_code=404, detail="Building not found")
    features = _features_for_building(building_id)
    levels = sorted({feature["properties"]["level"] for feature in features})
    inventory: dict[str, int] = {}
    for feature in features:
        unit_type = feature["properties"]["type"]
        inventory[unit_type] = inventory.get(unit_type, 0) + 1
    return {
        "building_id": building_id,
        "name": building["name"],
        "center": [building["longitude"], building["latitude"]],
        "bounds": [
            building["longitude"] - 0.00025,
            building["latitude"] - 0.00018,
            building["longitude"] + 0.00025,
            building["latitude"] + 0.00018,
            building["ground_elevation_m"] - building["floors_below_ground"] * 3.4,
            building["ground_elevation_m"] + building["height_m"],
        ],
        "levels": levels,
        "inventory": inventory,
        "units": len(features),
        "floors_above_ground": building["floors_above_ground"],
        "floors_below_ground": building["floors_below_ground"],
        "rera_ref": building["rera_ref"],
        "tileset_version": "demo-1.0.0",
    }


@router.post("/topology/audit", response_model=AuditResponse)
async def topology_audit(payload: AuditRequest) -> AuditResponse:
    if payload.building_id not in BUILDINGS:
        raise HTTPException(status_code=404, detail="Building not found")
    features = _features_for_building(payload.building_id)
    violations: list[Clash] = []

    if payload.candidate is not None:
        if payload.floor_index is None or payload.ceiling_height_m is None:
            raise HTTPException(status_code=422, detail="candidate requires floor_index and ceiling_height_m")
        polygon = geojson_to_metric_polygon(payload.candidate.model_dump())
        ground_elevation = payload.ground_elevation_m
        z_min = ground_elevation + payload.floor_index * 3.25
        solid_wkt = extrude_floor_unit(polygon.wkt, z_min, z_min + payload.ceiling_height_m, 32643)
        collisions = await check_spatial_collision(solid_wkt, payload.building_id)
        violations.extend(Clash.model_validate(item) for item in collisions)
    else:
        for index, first in enumerate(features):
            first_polygon = wkt.loads(first["metric_footprint_wkt"])
            first_props = first["properties"]
            for second in features[index + 1:]:
                second_props = second["properties"]
                z_bottom = max(first_props["z_min_m"], second_props["z_min_m"])
                z_top = min(first_props["z_max_m"], second_props["z_max_m"])
                if z_top <= z_bottom:
                    continue
                second_polygon = wkt.loads(second["metric_footprint_wkt"])
                overlap = first_polygon.intersection(second_polygon)
                volume = overlap.area * (z_top - z_bottom)
                if overlap.is_empty or volume <= OVERLAP_TOLERANCE_M3:
                    continue
                violations.append(Clash(
                    unit_v_ulpin=first_props["v_ulpin"],
                    overlap_volume_m3=round(volume, 4),
                    overlap_geometry=metric_polygon_to_geojson(overlap),
                    level=first_props["level"],
                    z_min_m=z_bottom,
                    z_max_m=z_top,
                ))

    return AuditResponse(
        building_id=payload.building_id,
        status="fail" if violations else "pass",
        checked_units=len(features),
        clash_count=len(violations),
        tolerance_m3=OVERLAP_TOLERANCE_M3,
        violations=violations,
        heatmap=[{
            "v_ulpin": clash.unit_v_ulpin,
            "level": clash.level,
            "intensity": min(1.0, clash.overlap_volume_m3),
            "overlap_volume_m3": clash.overlap_volume_m3,
        } for clash in violations],
    )