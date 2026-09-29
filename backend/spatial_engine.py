"""Metric 3D extrusion and positive-volume collision detection."""

from __future__ import annotations

import math
import re
from typing import Any, Optional, Union

from pyproj import Transformer
from shapely import wkt as shapely_wkt
from shapely.geometry import Polygon, mapping
from shapely.geometry.polygon import orient
from shapely.ops import transform
from shapely.validation import explain_validity

from .database import SessionFactory
from .store import UNITS

METRIC_SRID = 32643
# Epsilon tolerance for SFCGAL / Shapely 3D volume collisions (0.0001 m^3 = 100 cm^3)
# Guarantees zero false positives on zero-thickness shared party walls or coplanar floor slabs
OVERLAP_TOLERANCE_M3 = 0.0001
MAX_COORDINATES_PER_RING = 500
MAX_INTERIOR_RINGS = 10
MIN_CADASTRAL_AREA_SQM = 0.05

VULPIN_PATTERN = re.compile(
    r"^([A-Z0-9]{14})-([A-Z0-9]{1,8})-"
    r"(0|[1-9][0-9]{0,2}|-[1-9][0-9]{0,2}|M[1-9]|B[1-9]|PH[0-9]?|UG|G)-"
    r"([A-Z0-9]{1,12})-(RES|COM|PRK|UTL)$"
)
_TO_METRIC: dict[int, Transformer] = {}
_TO_WGS84 = Transformer.from_crs(METRIC_SRID, 4326, always_xy=True)
_SOLID_PRISM_CACHE: dict[str, tuple[Polygon, float, float]] = {}


def generate_v_ulpin(
    base_ulpin: str,
    bldg_code: str,
    floor_idx: Union[int, str],
    unit_no: str,
    prop_type: str,
) -> str:
    """Compose and validate the canonical proposed V-ULPIN identifier."""
    value = "-".join((base_ulpin, bldg_code, str(floor_idx), unit_no, prop_type))
    if not VULPIN_PATTERN.fullmatch(value):
        raise ValueError(
            f"V-ULPIN '{value}' does not match the canonical syntax standard: "
            "ULPIN(14)-Bldg(1-8)-Floor(±Idx|M1|B1|PH)-Unit(1-12)-Type(RES|COM|PRK|UTL)"
        )
    return value


def polygon_to_metric(polygon_wkt: str, srid: int = 4326) -> Polygon:
    try:
        polygon = shapely_wkt.loads(polygon_wkt)
    except Exception as exc:
        raise ValueError(f"Spatial parsing injection or malformed WKT: {exc}") from exc

    if polygon.geom_type != "Polygon" or polygon.is_empty:
        raise ValueError("A valid, non-empty single Polygon boundary is required")

    # Anti-DoS: Check vertex counts and interior ring counts against spatial bombs
    exterior_coords = list(polygon.exterior.coords)
    if len(exterior_coords) > MAX_COORDINATES_PER_RING:
        raise ValueError(
            f"Exterior ring exceeds maximum allowable vertex count ({len(exterior_coords)} > {MAX_COORDINATES_PER_RING})"
        )
    if len(polygon.interiors) > MAX_INTERIOR_RINGS:
        raise ValueError(
            f"Polygon exceeds maximum allowable interior rings ({len(polygon.interiors)} > {MAX_INTERIOR_RINGS})"
        )
    for interior in polygon.interiors:
        if len(interior.coords) > MAX_COORDINATES_PER_RING:
            raise ValueError(f"Interior ring exceeds maximum allowable vertex count ({len(interior.coords)} > {MAX_COORDINATES_PER_RING})")

    if not polygon.is_valid:
        reason = explain_validity(polygon)
        raise ValueError(f"Non-manifold or self-intersecting polygon boundary: {reason}")

    polygon = orient(polygon, sign=1.0)
    if srid != METRIC_SRID:
        transformer = _TO_METRIC.setdefault(
            srid, Transformer.from_crs(srid, METRIC_SRID, always_xy=True)
        )
        polygon = transform(transformer.transform, polygon)

    if polygon.area < MIN_CADASTRAL_AREA_SQM:
        raise ValueError(
            f"Unit boundary area ({polygon.area:.4f} m²) is below the minimum viable cadastral threshold ({MIN_CADASTRAL_AREA_SQM} m²) - potential sliver or collapsed geometry"
        )
    return polygon


def _ring_at_height(coords: Any, height: float) -> str:
    return "(" + ",".join(
        f"{float(x):.6f} {float(y):.6f} {height:.4f}" for x, y in coords
    ) + ")"


def _polygon_patch(rings: list[str]) -> str:
    return "(" + ",".join(rings) + ")"


def extrude_floor_unit(
    polygon_wkt: str,
    z_min: float,
    z_max: float,
    srid: int = 4326,
) -> str:
    """Extrude a lon/lat or metric polygon into a closed metric polyhedral surface.

    ``srid`` describes the input polygon. The returned WKT is projected to
    EPSG:32643 so every horizontal/vertical measure is in metres.
    """
    if not math.isfinite(z_min) or not math.isfinite(z_max) or z_max <= z_min:
        raise ValueError("z_max must be finite and greater than z_min")
    polygon = polygon_to_metric(polygon_wkt, srid)
    exterior = list(polygon.exterior.coords)
    interiors = [list(ring.coords) for ring in polygon.interiors]
    patches = [
        _polygon_patch([_ring_at_height(list(reversed(exterior)), z_min)] + [
            _ring_at_height(list(reversed(ring)), z_min) for ring in interiors
        ]),
        _polygon_patch([_ring_at_height(exterior, z_max)] + [
            _ring_at_height(ring, z_max) for ring in interiors
        ]),
    ]
    for ring in [exterior] + interiors:
        for start, end in zip(ring, ring[1:]):
            patches.append(_polygon_patch([
                "(" + ",".join((
                    f"{start[0]:.6f} {start[1]:.6f} {z_min:.4f}",
                    f"{end[0]:.6f} {end[1]:.6f} {z_min:.4f}",
                    f"{end[0]:.6f} {end[1]:.6f} {z_max:.4f}",
                    f"{start[0]:.6f} {start[1]:.6f} {z_max:.4f}",
                    f"{start[0]:.6f} {start[1]:.6f} {z_min:.4f}",
                )) + ")"
            ]))
    solid_wkt = "POLYHEDRALSURFACE Z (" + ",".join(patches) + ")"
    _SOLID_PRISM_CACHE[solid_wkt] = (polygon, z_min, z_max)
    return solid_wkt


def metric_polygon_to_geojson(polygon: Polygon) -> dict[str, Any]:
    geographic = transform(_TO_WGS84.transform, polygon)
    return mapping(geographic)


def geojson_to_metric_polygon(geometry: dict[str, Any]) -> Polygon:
    if geometry.get("type") != "Polygon":
        raise ValueError("Only GeoJSON Polygon boundaries are supported")
    polygon = Polygon(geometry["coordinates"][0], geometry["coordinates"][1:])
    return polygon_to_metric(polygon.wkt, 4326)


def _volume_intersection(
    candidate: Polygon,
    candidate_min: float,
    candidate_max: float,
    existing: dict[str, Any],
) -> Optional[dict[str, Any]]:
    z_bottom = max(candidate_min, existing["properties"]["z_min_m"])
    z_top = min(candidate_max, existing["properties"]["z_max_m"])
    if z_top <= z_bottom:
        return None
    existing_polygon = shapely_wkt.loads(existing["metric_footprint_wkt"])
    overlap = candidate.intersection(existing_polygon)
    volume = overlap.area * (z_top - z_bottom)
    if overlap.is_empty or volume <= OVERLAP_TOLERANCE_M3:
        return None
    return {
        "unit_v_ulpin": existing["properties"]["v_ulpin"],
        "overlap_volume_m3": round(volume, 4),
        "overlap_geometry": metric_polygon_to_geojson(overlap),
        "level": existing["properties"]["level"],
        "z_min_m": z_bottom,
        "z_max_m": z_top,
    }


async def check_spatial_collision(new_solid_wkt: str, building_id: str) -> list[dict[str, Any]]:
    """Return conflicts whose intersection has more than 0.001 cubic metres."""
    cached_prism = _SOLID_PRISM_CACHE.get(new_solid_wkt)
    if cached_prism is None:
        candidate = shapely_wkt.loads(new_solid_wkt)
        faces = list(candidate.geoms)
        bottom = faces[0].exterior.coords
        candidate_polygon = Polygon([(point[0], point[1]) for point in bottom])
        candidate_min = min(point[2] for point in bottom)
        candidate_max = max(point[2] for point in faces[1].exterior.coords)
    else:
        candidate_polygon, candidate_min, candidate_max = cached_prism

    if SessionFactory is not None:
        from sqlalchemy import text

        statement = text("""
            WITH candidate AS (
                SELECT ST_MakeSolid(ST_GeomFromText(:solid_wkt, 32643)) AS geom
            ), intersections AS (
                  SELECT unit.v_ulpin,
                      ST_3DIntersection(unit.boundary, candidate.geom) AS geom
                FROM vertical_units AS unit CROSS JOIN candidate
                WHERE unit.building_id = :building_id
                  AND ST_3DIntersects(unit.boundary, candidate.geom)
            )
                 SELECT v_ulpin,
                     ST_AsText(ST_Envelope(ST_Force2D(geom))) AS overlap_wkt,
                     ST_Volume(ST_MakeSolid(geom)) AS overlap_volume_m3,
                     ST_ZMin(geom) AS z_min_m, ST_ZMax(geom) AS z_max_m
            FROM intersections
            WHERE ST_Volume(ST_MakeSolid(geom)) > :tolerance
        """)
        async with SessionFactory() as session:
            rows = (await session.execute(statement, {
                "solid_wkt": new_solid_wkt,
                "building_id": building_id,
                "tolerance": OVERLAP_TOLERANCE_M3,
            })).mappings().all()
        return [
            {
                "unit_v_ulpin": row["v_ulpin"],
                "overlap_volume_m3": round(float(row["overlap_volume_m3"]), 4),
                "overlap_geometry": metric_polygon_to_geojson(shapely_wkt.loads(row["overlap_wkt"])),
                "level": UNITS.get(row["v_ulpin"], {}).get("properties", {}).get("level", 0),
                "z_min_m": float(row["z_min_m"]),
                "z_max_m": float(row["z_max_m"]),
            }
            for row in rows
        ]

    clashes = []
    for existing in UNITS.values():
        if existing["properties"]["building_id"] != building_id:
            continue
        clash = _volume_intersection(
            candidate_polygon, candidate_min, candidate_max, existing
        )
        if clash is not None:
            clashes.append(clash)
    return clashes