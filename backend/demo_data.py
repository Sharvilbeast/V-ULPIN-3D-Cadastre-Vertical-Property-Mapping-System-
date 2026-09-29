"""Deterministic Aundh-Bopodi demo data for two Pune towers."""

from __future__ import annotations

from typing import Any

from pyproj import Transformer
from shapely.geometry import box

from .schemas import GeoJSONFeature, UnitProperties
from .spatial_engine import METRIC_SRID, extrude_floor_unit, generate_v_ulpin, metric_polygon_to_geojson

_TO_METRIC = Transformer.from_crs(4326, METRIC_SRID, always_xy=True)


def _feature(
    *, building_id: str, base_ulpin: str, tower_id: str, floor: int,
    unit_no: str, unit_type: str, x: float, y: float, width: float,
    depth: float, ground_elevation: float, owner: str,
) -> dict[str, Any]:
    footprint = box(x, y, x + width, y + depth)
    floor_height = 3.25 if floor >= 0 else 3.4
    z_min = ground_elevation + floor * floor_height
    z_max = z_min + (2.7 if unit_type == "PRK" else 2.95)
    identifier = generate_v_ulpin(base_ulpin, tower_id, floor, unit_no, unit_type)
    properties = UnitProperties(
        v_ulpin=identifier,
        building_id=building_id,
        tower_id=tower_id,
        level=floor,
        unit_no=unit_no,
        type=unit_type,
        area_sqm=round(footprint.area, 2),
        volume_m3=round(footprint.area * (z_max - z_min), 2),
        z_min_m=round(z_min, 3),
        z_max_m=round(z_max, 3),
        owner_name=owner,
        status="Registered (demo)",
        rera_compliant=unit_type in ("RES", "COM"),
        source_status="surveyed",
    )
    feature = GeoJSONFeature(
        id=identifier,
        geometry=metric_polygon_to_geojson(footprint),
        properties=properties,
    ).model_dump(mode="json")
    feature["metric_footprint_wkt"] = footprint.wkt
    feature["solid_wkt"] = extrude_floor_unit(footprint.wkt, z_min, z_max, METRIC_SRID)
    return feature


def build_demo_data() -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]]]:
    buildings = {
        "tower-a": {
            "building_id": "tower-a", "name": "Aundh Heights · Tower A",
            "tower_id": "TA", "base_ulpin": "12345678901234",
            "ground_elevation_m": 560.0, "floors_above_ground": 10,
            "floors_below_ground": 2, "longitude": 73.8078, "latitude": 18.5605,
            "height_m": 41.0, "rera_ref": "P521000-demo-A",
        },
        "tower-b": {
            "building_id": "tower-b", "name": "Aundh Heights · Tower B",
            "tower_id": "TB", "base_ulpin": "12345678901235",
            "ground_elevation_m": 560.0, "floors_above_ground": 6,
            "floors_below_ground": 1, "longitude": 73.8087, "latitude": 18.5608,
            "height_m": 25.0, "rera_ref": "P521000-demo-B",
        },
    }
    units: list[dict[str, Any]] = []
    owner_index = 1
    for building_id, building in buildings.items():
        origin_x, origin_y = _TO_METRIC.transform(building["longitude"], building["latitude"])
        tower_id = building["tower_id"]
        base = building["base_ulpin"]
        ground = building["ground_elevation_m"]
        if tower_id == "TA":
            above_floors = range(1, 11)
            residential_columns, residential_rows = 4, 3
            parking_bays = 20
            basement_levels = [-2, -1]
            building_width = 29.2
        else:
            above_floors = range(1, 7)
            residential_columns, residential_rows = 4, 2
            parking_bays = 14
            basement_levels = [-1]
            building_width = 26.8

        # Apartment and office footprints occupy a non-overlapping regular grid.
        for floor in above_floors:
            for row in range(residential_rows):
                for column in range(residential_columns):
                    unit_type = "RES"
                    unit_no = "U%02d" % (row * residential_columns + column + 1)
                    units.append(_feature(
                        building_id=building_id, base_ulpin=base, tower_id=tower_id,
                        floor=floor, unit_no=unit_no, unit_type=unit_type,
                        x=origin_x + 0.5 + column * 7.1,
                        y=origin_y + 0.5 + row * 5.5,
                        width=6.8, depth=5.2, ground_elevation=ground,
                        owner="Sample Owner %03d" % owner_index,
                    ))
                    owner_index += 1

        commercial_count = 6 if tower_id == "TA" else 4
        for index in range(commercial_count):
            column = index % 3
            row = index // 3
            units.append(_feature(
                building_id=building_id, base_ulpin=base, tower_id=tower_id,
                floor=0, unit_no="C%02d" % (index + 1), unit_type="COM",
                x=origin_x + 0.5 + column * 9.2,
                y=origin_y + 0.5 + row * 7.2,
                width=8.8, depth=6.8, ground_elevation=ground,
                owner="Demo commercial unit",
            ))

        for floor in basement_levels:
            for index in range(parking_bays):
                column = index % 5
                row = index // 5
                units.append(_feature(
                    building_id=building_id, base_ulpin=base, tower_id=tower_id,
                    floor=floor, unit_no="P%02d" % (index + 1), unit_type="PRK",
                    x=origin_x + 0.5 + column * 5.4,
                    y=origin_y + 0.5 + row * 5.4,
                    width=2.5, depth=5.0, ground_elevation=ground,
                    owner="Unassigned parking inventory",
                ))
            units.append(_feature(
                building_id=building_id, base_ulpin=base, tower_id=tower_id,
                floor=floor, unit_no="CORRIDOR", unit_type="UTL",
                x=origin_x + 0.5, y=origin_y + 23.0,
                width=building_width - 1.0, depth=1.0,
                ground_elevation=ground, owner="Common utility space",
            ))

    return buildings, units