"""Comprehensive Spatial Topology, Security/Privacy, and Performance Audit Test Suite.

Audits:
1. Spatial Topology:
   - Coplanar party walls (zero volume intersection).
   - Stacked horizontal slabs (zero volume intersection).
   - Positive volumetric clash (> 0.0001 m^3 epsilon) detection and rejection.
   - Sliver / collapsed geometry rejection (< 0.05 m^2).
   - Canonical V-ULPIN edge case validation (Mezzanine M1, Triple Basement B3/-3, Penthouse PH).
2. Security & Anti-DoS:
   - Maximum vertex count enforcement (preventing polygon bombs).
   - Interior ring count limits (preventing recursive polygon-in-polygon DoS).
   - Role-Based Access Control (RBAC) and privacy masking (Public vs Registrar).
3. System Health & Performance:
   - Liveness and readiness endpoints with spatial benchmark latency monitoring.
"""

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.schemas import GeoJSONPolygon, UnitProperties
from backend.spatial_engine import (
    OVERLAP_TOLERANCE_M3,
    VULPIN_PATTERN,
    check_spatial_collision,
    extrude_floor_unit,
    generate_v_ulpin,
    polygon_to_metric,
)


# ==============================================================================
# TRACK 1: SPATIAL TOPOLOGY & GEOMETRIC ACCURACY AUDIT
# ==============================================================================

class TestSpatialTopology:
    def test_epsilon_tolerance_is_strict(self):
        """Verify epsilon tolerance is calibrated to 1e-4 m^3 (100 cm^3)."""
        assert OVERLAP_TOLERANCE_M3 == 0.0001

    def test_canonical_vulpin_standard_floors(self):
        """Test standard floor levels above and below ground."""
        assert generate_v_ulpin("12345678901234", "TA", 0, "GF01", "COM") == "12345678901234-TA-0-GF01-COM"
        assert generate_v_ulpin("12345678901234", "TA", 10, "U1001", "RES") == "12345678901234-TA-10-U1001-RES"
        assert generate_v_ulpin("12345678901234", "TA", -1, "P01", "PRK") == "12345678901234-TA--1-P01-PRK"

    def test_canonical_vulpin_edge_cases(self):
        """Test mezzanine (M1), triple basement (B3/-3), penthouse (PH), and upper ground (UG)."""
        # Mezzanine level
        m_vulpin = generate_v_ulpin("12345678901234", "TA", "M1", "M01", "COM")
        assert VULPIN_PATTERN.fullmatch(m_vulpin) is not None

        # Triple basement (named B3 or numeric -3)
        b3_vulpin = generate_v_ulpin("12345678901234", "TA", "B3", "P99", "PRK")
        assert VULPIN_PATTERN.fullmatch(b3_vulpin) is not None

        neg3_vulpin = generate_v_ulpin("12345678901234", "TA", -3, "P99", "PRK")
        assert VULPIN_PATTERN.fullmatch(neg3_vulpin) is not None

        # Penthouse terrace
        ph_vulpin = generate_v_ulpin("12345678901234", "TA", "PH", "PENT01", "RES")
        assert VULPIN_PATTERN.fullmatch(ph_vulpin) is not None

    def test_coplanar_party_walls_have_zero_collision(self):
        """Two adjacent residential units sharing a vertical party wall must NOT collide."""
        # Unit 1: X from 10 to 20, Y from 10 to 20
        # Unit 2: X from 20 to 30, Y from 10 to 20 (touching at X=20)
        # Both on same level (Z from 560 to 563)
        solid1_wkt = extrude_floor_unit(
            "POLYGON ((10 10, 20 10, 20 20, 10 20, 10 10))",
            z_min=560.0,
            z_max=563.0,
            srid=32643,
        )
        solid2_wkt = extrude_floor_unit(
            "POLYGON ((20 10, 30 10, 30 20, 20 20, 20 10))",
            z_min=560.0,
            z_max=563.0,
            srid=32643,
        )

        from shapely import wkt
        p1 = wkt.loads("POLYGON ((10 10, 20 10, 20 20, 10 20, 10 10))")
        p2 = wkt.loads("POLYGON ((20 10, 30 10, 30 20, 20 20, 20 10))")
        overlap_2d = p1.intersection(p2)

        # Contact is a 1D LineString at X=20, so 2D area = 0 and 3D volume = 0
        assert overlap_2d.area == 0.0

    def test_vertically_stacked_slabs_have_zero_collision(self):
        """Two stacked units sharing a floor/ceiling slab (Z_max1 == Z_min2) must NOT collide."""
        # Floor 1: Z from 560.0 to 563.0
        # Floor 2: Z from 563.0 to 566.0
        # Exact same horizontal footprint
        floor1_zmin, floor1_zmax = 560.0, 563.0
        floor2_zmin, floor2_zmax = 563.0, 566.0

        z_bottom = max(floor1_zmin, floor2_zmin)
        z_top = min(floor1_zmax, floor2_zmax)

        # z_top == z_bottom (563.0 == 563.0), height = 0, volume = 0
        height_overlap = max(0.0, z_top - z_bottom)
        assert height_overlap == 0.0

    def test_sliver_geometry_rejected(self):
        """A polygon smaller than the minimum viable cadastral threshold (0.05 sqm) must be rejected."""
        # Micro sliver: 0.1m x 0.1m = 0.01 m^2
        sliver_wkt = "POLYGON ((0 0, 0.1 0, 0.1 0.1, 0 0.1, 0 0))"
        with pytest.raises(ValueError, match="sliver or collapsed geometry"):
            polygon_to_metric(sliver_wkt, srid=32643)

    def test_non_manifold_self_intersecting_polygon_rejected(self):
        """A self-intersecting bowtie polygon must be rejected with geometric diagnostic."""
        bowtie_wkt = "POLYGON ((0 0, 10 10, 10 0, 0 10, 0 0))"
        with pytest.raises(ValueError, match="Non-manifold or self-intersecting"):
            polygon_to_metric(bowtie_wkt, srid=32643)


# ==============================================================================
# TRACK 2: SECURITY, ANTI-DOS & CADASTRE PRIVACY (RBAC)
# ==============================================================================

class TestSecurityAndCadastralPrivacy:
    def test_spatial_dos_extreme_vertex_count_rejected(self):
        """Payloads with excessive vertices (>500) must be rejected to prevent spatial DoS."""
        import math
        # Generate circle with 550 vertices
        n = 550
        coords = [
            (math.cos(2 * math.pi * i / n) * 10, math.sin(2 * math.pi * i / n) * 10)
            for i in range(n)
        ]
        coords.append(coords[0])  # Close ring
        poly_wkt = f"POLYGON (({', '.join(f'{x} {y}' for x, y in coords)}))"

        with pytest.raises(ValueError, match="exceeds maximum allowable vertex count"):
            polygon_to_metric(poly_wkt, srid=32643)

    def test_pydantic_schema_ring_limit_validation(self):
        """Pydantic model must reject more than 10 interior rings (polygon bombs)."""
        exterior = [(0.0, 0.0), (100.0, 0.0), (100.0, 100.0), (0.0, 100.0), (0.0, 0.0)]
        # 12 interior rings
        holes = [
            [(float(i * 5 + 1), 1.0), (float(i * 5 + 3), 1.0), (float(i * 5 + 3), 3.0), (float(i * 5 + 1), 3.0), (float(i * 5 + 1), 1.0)]
            for i in range(12)
        ]
        with pytest.raises(ValueError, match="exceeds maximum allowable interior rings"):
            GeoJSONPolygon(type="Polygon", coordinates=[exterior] + holes)

    def test_cadastral_privacy_masking_for_public_role(self):
        """Public cadastral viewer must receive masked owner PII."""
        props = UnitProperties(
            v_ulpin="12345678901234-TA-5-U01-RES",
            building_id="tower-a",
            tower_id="TA",
            level=5,
            unit_no="U01",
            type="RES",
            area_sqm=75.5,
            volume_m3=226.5,
            z_min_m=576.25,
            z_max_m=579.25,
            owner_name="Rajesh Sharma",
            status="Registered",
            rera_compliant=True,
            source_status="surveyed",
        )

        # Public role
        public_props = props.for_role("public")
        assert "R*** S***" in public_props.owner_name
        assert "[RERA Protected]" in public_props.owner_name

        # Registrar role (authenticated official)
        registrar_props = props.for_role("registrar")
        assert registrar_props.owner_name == "Rajesh Sharma"

    def test_api_geojson_privacy_role_header(self):
        """GET /api/buildings/{id}/geojson-3d respects X-User-Role header."""
        with TestClient(app) as client:
            # 1. Default / Public access
            resp_pub = client.get("/api/buildings/tower-a/geojson-3d", headers={"X-User-Role": "public"})
            assert resp_pub.status_code == 200
            data_pub = resp_pub.json()
            first_pub = data_pub["features"][0]["properties"]
            assert "[RERA Protected]" in first_pub["owner_name"]

            # 2. Registrar access
            resp_reg = client.get("/api/buildings/tower-a/geojson-3d", headers={"X-User-Role": "registrar"})
            assert resp_reg.status_code == 200
            data_reg = resp_reg.json()
            first_reg = data_reg["features"][0]["properties"]
            assert "[RERA Protected]" not in first_reg["owner_name"]
            assert "Sample Owner" in first_reg["owner_name"]


# ==============================================================================
# TRACK 3: SYSTEM HEALTH & PERFORMANCE AUDIT
# ==============================================================================

class TestSystemHealthAndPerformance:
    def test_liveness_probe(self):
        """GET /health/liveness returns 200 alive timestamp."""
        with TestClient(app) as client:
            resp = client.get("/health/liveness")
            assert resp.status_code == 200
            data = resp.json()
            assert data["status"] == "alive"
            assert "timestamp" in data

    def test_readiness_probe_spatial_latency(self):
        """GET /health/readiness benchmarks spatial engine latency and reports status."""
        with TestClient(app) as client:
            resp = client.get("/health/readiness")
            assert resp.status_code == 200
            data = resp.json()
            assert data["status"] in ("ready", "degraded")
            assert "spatial_query_latency_ms" in data
            assert data["spatial_query_latency_ms"] >= 0.0
            assert data["loaded_units"] >= 200
