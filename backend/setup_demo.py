"""Validate and report the deterministic Aundh-Bopodi demo seed.

Run with ``python -m backend.setup_demo``. API startup loads the same data into
the no-database demo repository; set DATABASE_URL to initialize PostGIS tables.
"""

from __future__ import annotations

import asyncio

from geoalchemy2.shape import WKTElement, from_shape
from shapely import wkt
from shapely.ops import unary_union
from sqlalchemy import select

from .database import DATABASE_URL, SessionFactory, initialize_postgis
from .demo_data import build_demo_data
from .models import Building, Parcel, VerticalUnit
from .spatial_engine import VULPIN_PATTERN


async def persist_seed(buildings: dict, units: list[dict]) -> None:
    if SessionFactory is None:
        return
    async with SessionFactory() as session:
        existing_parcels = set((await session.scalars(select(Parcel.base_ulpin))).all())
        existing_buildings = set((await session.scalars(select(Building.building_id))).all())
        existing_units = set((await session.scalars(select(VerticalUnit.v_ulpin))).all())

        for building_id, building in buildings.items():
            building_units = [
                unit for unit in units
                if unit["properties"]["building_id"] == building_id
            ]
            footprint = unary_union([
                wkt.loads(unit["metric_footprint_wkt"]) for unit in building_units
            ]).convex_hull
            if building["base_ulpin"] not in existing_parcels:
                session.add(Parcel(
                    base_ulpin=building["base_ulpin"],
                    footprint=from_shape(footprint, srid=32643),
                    vertical_datum="demo local orthometric datum",
                    elevation_datum_m=building["ground_elevation_m"],
                    cors_station_id="PUNE-CORS-DEMO",
                    cors_solution_id="WARD08-SIMULATED-SOLUTION",
                    survey_epoch="2026.74",
                    registration_ref=building["rera_ref"],
                    source_metadata={"pilot": "SIH26011", "simulated": True},
                ))
            if building_id not in existing_buildings:
                session.add(Building(
                    building_id=building_id,
                    base_ulpin=building["base_ulpin"],
                    building_code=building["tower_id"],
                    name=building["name"],
                    ground_elevation_m=building["ground_elevation_m"],
                    vertical_datum="demo local orthometric datum",
                    floors_above_ground=building["floors_above_ground"],
                    floors_below_ground=building["floors_below_ground"],
                    status="approved",
                ))
        await session.flush()

        for unit in units:
            properties = unit["properties"]
            if properties["v_ulpin"] in existing_units:
                continue
            footprint = wkt.loads(unit["metric_footprint_wkt"])
            session.add(VerticalUnit(
                v_ulpin=properties["v_ulpin"],
                building_id=properties["building_id"],
                floor_index=properties["level"],
                unit_no=properties["unit_no"],
                unit_type=properties["type"],
                boundary=WKTElement(unit["solid_wkt"], srid=32643),
                footprint=from_shape(footprint, srid=32643),
                z_min_m=properties["z_min_m"],
                z_max_m=properties["z_max_m"],
                area_sqm=properties["area_sqm"],
                volume_m3=properties["volume_m3"],
                owner_name=properties["owner_name"],
                ownership_status=properties["status"],
                rera_compliant=properties["rera_compliant"],
                source_status=properties["source_status"],
            ))
        await session.commit()


async def main() -> None:
    buildings, units = build_demo_data()
    invalid = [
        unit["properties"]["v_ulpin"]
        for unit in units
        if not VULPIN_PATTERN.fullmatch(unit["properties"]["v_ulpin"])
    ]
    if invalid:
        raise RuntimeError("Seed produced invalid V-ULPIN identifiers: " + ", ".join(invalid[:5]))
    await initialize_postgis()
    await persist_seed(buildings, units)
    print("V-ULPIN Pune Ward 8 demo seed validated")
    print("Buildings: %d | units: %d" % (len(buildings), len(units)))
    for building in buildings.values():
        count = sum(unit["properties"]["building_id"] == building["building_id"] for unit in units)
        print("%s: %d above-ground floors, %d basements, %d units" % (
            building["name"], building["floors_above_ground"],
            building["floors_below_ground"], count,
        ))
    if not DATABASE_URL:
        print("DATABASE_URL unset: API uses its seeded in-memory demo repository.")
    else:
        print("PostGIS seed persisted to the configured database.")


if __name__ == "__main__":
    asyncio.run(main())