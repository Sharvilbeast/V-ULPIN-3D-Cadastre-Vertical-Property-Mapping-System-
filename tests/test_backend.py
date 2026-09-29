"""Tests for V-ULPIN spatial engine and FastAPI endpoints."""

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.spatial_engine import (
    generate_v_ulpin,
    extrude_floor_unit,
    check_spatial_collision,
    VULPIN_PATTERN,
)
from backend.store import BUILDINGS, UNITS


def test_generate_v_ulpin_valid():
    vulpin = generate_v_ulpin("12345678901234", "TA", 3, "U04", "RES")
    assert vulpin == "12345678901234-TA-3-U04-RES"
    assert VULPIN_PATTERN.fullmatch(vulpin) is not None


def test_generate_v_ulpin_basement():
    vulpin = generate_v_ulpin("12345678901234", "TA", -2, "P05", "PRK")
    assert vulpin == "12345678901234-TA--2-P05-PRK"
    assert VULPIN_PATTERN.fullmatch(vulpin) is not None


def test_generate_v_ulpin_invalid():
    with pytest.raises(ValueError):
        generate_v_ulpin("invalid-base", "TA", 1, "U01", "RES")

    with pytest.raises(ValueError):
        generate_v_ulpin("12345678901234", "TA", 1, "U01", "INVALID_TYPE")


def test_extrude_floor_unit():
    poly_wkt = "POLYGON ((73.8078 18.5605, 73.8079 18.5605, 73.8079 18.5606, 73.8078 18.5606, 73.8078 18.5605))"
    solid_wkt = extrude_floor_unit(poly_wkt, 560.0, 563.0, srid=4326)
    assert solid_wkt.startswith("POLYHEDRALSURFACE Z (")
    assert solid_wkt.endswith(")")


def test_api_health():
    with TestClient(app) as client:
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"


def test_api_building_geojson():
    with TestClient(app) as client:
        response = client.get("/api/buildings/tower-a/geojson-3d")
        assert response.status_code == 200
        data = response.json()
        assert data["type"] == "FeatureCollection"
        assert len(data["features"]) > 0
        first = data["features"][0]
        assert "properties" in first
        assert "v_ulpin" in first["properties"]
        assert first["properties"]["building_id"] == "tower-a"


def test_api_tileset_metadata():
    with TestClient(app) as client:
        response = client.get("/api/buildings/tower-a/tileset-metadata")
        assert response.status_code == 200
        data = response.json()
        assert data["building_id"] == "tower-a"
        assert "levels" in data
        assert -2 in data["levels"]
        assert 10 in data["levels"]


def test_api_topology_audit_clean():
    with TestClient(app) as client:
        response = client.post("/api/topology/audit", json={"building_id": "tower-a"})
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "pass"
        assert data["clash_count"] == 0


def test_api_topology_audit_clash():
    # Pick an existing unit's boundary and test clash detection
    with TestClient(app) as client:
        units_resp = client.get("/api/buildings/tower-a/geojson-3d")
        sample_feature = units_resp.json()["features"][0]
        coords = sample_feature["geometry"]["coordinates"]

        response = client.post(
            "/api/topology/audit",
            json={
                "building_id": "tower-a",
                "candidate": {"type": "Polygon", "coordinates": coords},
                "floor_index": sample_feature["properties"]["level"],
                "ceiling_height_m": 2.8,
                "ground_elevation_m": 560.0,
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "fail"
        assert data["clash_count"] >= 1
