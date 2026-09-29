"""FastAPI entry point for the V-ULPIN pilot API."""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from shapely import wkt
from sqlalchemy import func, select

from .database import DATABASE_URL, SessionFactory, close_database, initialize_postgis
from .demo_data import build_demo_data
from .models import Building, VerticalUnit
from .routers.spatial import router as spatial_router
from .routers.vulpin import router as vulpin_router
from .schemas import GeoJSONFeature, UnitProperties
from .spatial_engine import metric_polygon_to_geojson
from .store import BUILDINGS, UNITS, replace_demo_data


async def hydrate_postgis() -> None:
    if SessionFactory is None:
        return
    async with SessionFactory() as session:
        building_rows = (await session.scalars(select(Building))).all()
        unit_rows = (await session.execute(select(
            VerticalUnit,
            func.ST_AsText(VerticalUnit.footprint),
            func.ST_AsText(VerticalUnit.boundary),
        ))).all()

    for building in building_rows:
        current = BUILDINGS.get(building.building_id, {})
        BUILDINGS[building.building_id] = {
            **current,
            "building_id": building.building_id,
            "name": building.name,
            "tower_id": building.building_code,
            "base_ulpin": building.base_ulpin,
            "ground_elevation_m": building.ground_elevation_m,
            "floors_above_ground": building.floors_above_ground,
            "floors_below_ground": building.floors_below_ground,
        }

    for unit, footprint_wkt, solid_wkt in unit_rows:
        metric_polygon = wkt.loads(footprint_wkt)
        feature = GeoJSONFeature(
            id=unit.v_ulpin,
            geometry=metric_polygon_to_geojson(metric_polygon),
            properties=UnitProperties(
                v_ulpin=unit.v_ulpin,
                building_id=unit.building_id,
                tower_id=BUILDINGS.get(unit.building_id, {}).get("tower_id", "T0"),
                level=unit.floor_index,
                unit_no=unit.unit_no,
                type=unit.unit_type,
                area_sqm=unit.area_sqm,
                volume_m3=unit.volume_m3,
                z_min_m=unit.z_min_m,
                z_max_m=unit.z_max_m,
                owner_name=unit.owner_name,
                status=unit.ownership_status,
                rera_compliant=unit.rera_compliant,
                source_status=unit.source_status,
            ),
        ).model_dump(mode="json")
        feature["metric_footprint_wkt"] = footprint_wkt
        feature["solid_wkt"] = solid_wkt
        UNITS[unit.v_ulpin] = feature


@asynccontextmanager
async def lifespan(_: FastAPI):
    await initialize_postgis()
    replace_demo_data(*build_demo_data())
    await hydrate_postgis()
    yield
    await close_database()


app = FastAPI(
    title="V-ULPIN 3D Cadastre API",
    version="1.0.0",
    description="Demo API for vertical unit identifiers, 3D footprints, and topology audits.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
)
app.include_router(vulpin_router)
app.include_router(spatial_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "mode": "postgis" if DATABASE_URL else "demo"}


@app.get("/health/liveness")
async def liveness() -> dict[str, Any]:
    return {
        "status": "alive",
        "service": "v-ulpin-api",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/health/readiness")
async def readiness() -> dict[str, Any]:
    import time
    start_time = time.perf_counter()
    db_status = "unconfigured_demo_fallback"
    db_latency_ms = None

    if SessionFactory is not None:
        try:
            from sqlalchemy import text
            async with SessionFactory() as session:
                # Benchmark spatial query latency: ST_Volume on a test 1m^3 cube
                await session.execute(text("SELECT ST_Volume(ST_MakeSolid(ST_GeomFromText('POLYHEDRALSURFACE Z (((0 0 0, 0 1 0, 1 1 0, 1 0 0, 0 0 0)), ((0 0 1, 1 0 1, 1 1 1, 0 1 1, 0 0 1)), ((0 0 0, 1 0 0, 1 0 1, 0 0 1, 0 0 0)), ((1 0 0, 1 1 0, 1 1 1, 1 0 1, 1 0 0)), ((1 1 0, 0 1 0, 0 1 1, 1 1 1, 1 1 0)), ((0 1 0, 0 0 0, 0 0 1, 0 1 1, 0 1 0)))', 32643)))"))
                db_status = "connected_sfcgal_ready"
        except Exception as error:
            db_status = f"error: {error}"
    else:
        # In-memory spatial engine benchmark
        from shapely.geometry import box
        b = box(0, 0, 10, 10)
        _ = b.intersection(box(5, 5, 15, 15)).area

    latency_ms = round((time.perf_counter() - start_time) * 1000, 3)
    return {
        "status": "ready" if "error" not in db_status else "degraded",
        "mode": "postgis" if DATABASE_URL else "demo",
        "database": db_status,
        "spatial_query_latency_ms": latency_ms,
        "loaded_buildings": len(BUILDINGS),
        "loaded_units": len(UNITS),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }