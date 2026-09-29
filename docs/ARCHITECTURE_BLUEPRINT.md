# V-ULPIN: 3D ULPIN Generation & Vertical Property Mapping System
## Architectural Blueprint & Technical Specification (SIH26011)

---

### Executive Summary & Problem Context
In dense urban developments across India, land parcels are divided into vertical stratifications—multi-story residential towers, commercial complexes, and multi-tier underground basements and utility tunnels. The traditional 2D 14-character Bhu-Aadhaar (Unique Land Parcel Identification Number or **ULPIN**) operates strictly on 2D cadastral surface polygons. As a consequence, high-rise apartments, basement parking bays, and underground infrastructure share a single 2D identifier, obscuring vertical property rights, causing collateral disputes, and hindering automated property valuation, taxation, and municipal planning.

**V-ULPIN** (Vertical ULPIN) extends India's 2D land administration system into an ISO 19152 LADM-compliant 3D digital twin cadastre, establishing an unambiguous, volumetric spatial unit for every apartment, office, parking bay, and shared utility space above and below ground.

---

## 1. System Scope & Cadastre Specification

### 1.1 Cadastral Standard Integration
The V-ULPIN system adheres to international and national geospatial standards:
1. **ISO 19152 Land Administration Domain Model (LADM) Part 3 (3D Spatial Unit)**:
   - Represents cadastral parcels as `LA_SpatialUnit` with 3D specialization `LA_LegalSpaceBuildingUnit`.
   - Utilizes `LA_BoundaryFaceString` for vertical boundaries (shared walls, exterior facades) and `LA_BoundaryFace` for horizontal diaphragms (slabs, ceilings, floor surfaces).
   - Preserves legal rights, restrictions, and responsibilities (RRR) linked directly to the volumetric parcel envelope.
2. **OGC CityGML 3.0 (Building Module - LOD3 & LOD4)**:
   - **LOD3**: Detailed structural exterior envelopes, true floor heights, roof shapes, openings, and subterranean structures.
   - **LOD4**: Interior architecture representation (rooms, hallways, utility shafts, interior boundary surfaces) delineated down to individual property boundary units.
3. **OGC 3D Tiles 1.1 & glTF 2.0**:
   - Hierarchical spatial data streaming via Batched 3D Models (`b3dm`) or glTF primitives with `EXT_structural_metadata` / Batch Table properties.
   - Enables real-time rendering in CesiumJS with per-unit hover, selection, filtering, and attribute inspection without loading bloated geometries client-side.

---

### 1.2 V-ULPIN Syntax Standard & Formal Specification
The canonical V-ULPIN identifier uniquely indexes any 3D spatial unit in India using a 5-tuple hierarchical string:

$$\text{V-ULPIN} = \langle\text{Base ULPIN}\rangle\text{-}\langle\text{TowerID}\rangle\text{-}\langle\text{FloorID}\rangle\text{-}\langle\text{UnitID}\rangle\text{-}\langle\text{PropertyType}\rangle$$

#### Components
1. **Base ULPIN** (`^[A-Z0-9]{14}$`): 14-character alphanumeric identifier generated from coordinates of the 2D cadastral parcel under India's Digital India Land Records Modernization Programme (DILRMP).
2. **Tower / Building Code** (`^[A-Z0-9]{1,8}$`): Identifies the building or wing on the parcel (e.g., `TA`, `TB`, `W1`, `TOWER01`).
3. **Floor Index** (`^(0|[1-9][0-9]{0,2}|-[1-9][0-9]{0,2})$`):
   - `0`: Ground Floor (GF).
   - Positive integers (`1` to `999`): Levels above ground.
   - Negative integers (`-1` to `-999`): Subterranean basement levels (e.g., `-1` for Basement 1, `-2` for Basement 2).
4. **Unit Number** (`^[A-Z0-9]{1,12}$`): Local unit identifier (e.g., `U101`, `P24`, `OFFICE02`, `CORRIDOR`).
5. **Property Type Code** (`^(RES|COM|PRK|UTL)$`):
   - `RES`: Residential apartment / dwelling unit.
   - `COM`: Commercial office / retail store / showroom.
   - `PRK`: Dedicated or stilt / basement parking bay.
   - `UTL`: Common utility space, fire refuge corridor, substation, or HVAC plant room.

#### Canonical Regular Expression
```regex
^([A-Z0-9]{14})-([A-Z0-9]{1,8})-(0|[1-9][0-9]{0,2}|-[1-9][0-9]{0,2})-([A-Z0-9]{1,12})-(RES|COM|PRK|UTL)$
```

*Example Valid Identifiers:*
- `12345678901234-TA-7-U02-RES` (Tower A, 7th floor, Unit 02, Residential)
- `12345678901234-TA--2-P15-PRK` (Tower A, Basement -2, Bay P15, Parking)
- `12345678901235-TB-0-C01-COM` (Tower B, Ground Floor, Shop 01, Commercial)
- `12345678901234-TA--1-CORRIDOR-UTL` (Tower A, Basement -1, Utility Corridor)

---

### 1.3 Legal & Regulatory Compliance Framework
1. **Real Estate (Regulation and Development) Act (RERA) 2016**:
   - Delineates **Carpet Area** as the net usable floor area of an apartment, excluding the area covered by the external walls, areas under services shafts, exclusive balcony or verandah area and exclusive open terrace area, but including the area covered by internal partition walls.
   - Section 2(n) definitions for **Common Areas**: Staircases, lifts, lobbies, fire escapes, basements, terraces, and water tanks are delineated as `UTL` units held jointly by the association of allottees.
2. **Maharashtra Apartment Ownership Act (MAOA) 1970**:
   - Defines horizontal and vertical apartment boundary planes: The boundary plane passes through the interior finished surface of perimeter walls, ceilings, and floors, separating exclusive ownership from common structural elements.
   - V-ULPIN enforces geometric boundary validation aligned with registered sanction plans and municipal occupancy certificates.

---

## 2. System Architecture & Tech Stack

```
+-----------------------------------------------------------------------------------------+
|                                    PRESENTATION LAYER                                   |
|   Next.js 14+ (App Router, TypeScript, TailwindCSS v4, Lucide Icons, Shadcn UI Tokens)   |
|   +---------------------------------------------------------------------------------+   |
|   | CesiumJS 3D WebGL Digital Twin Engine                                            |   |
|   |  - Custom glTF & Polyhedral shaders (Cyan/Violet/Amber/Rose)                     |   |
|   |  - Globe Translucency (Sub-surface Basement & Tunnel Inspection)                |   |
|   |  - Dynamic Level Explosion & Single-Floor Slice Filtering                       |   |
|   |  - Raycast Picking & High-Frequency Clash Pulse Animation                       |   |
|   +---------------------------------------------------------------------------------+   |
|   | HUD Controls & Modals: VUlpinInspector | LayerControls | CollisionAlertModal     |   |
+-----------------------------------------------------------------------------------------+
                                             |
                         REST / WebSocket (JSON / 3D GeoJSON)
                                             v
+-----------------------------------------------------------------------------------------+
|                                APPLICATION & COMPUTE LAYER                              |
|   FastAPI (Python 3.11+ Async Service, Pydantic v2 Strict Contracts, Uvicorn)           |
|   +--------------------------+----------------------------+-------------------------+   |
|   | Extrusion & CRS Engine   | 3D Clash Detection Engine  | Identifier Allocator    |   |
|   | (Shapely + PyProj 32643) | (SFCGAL ST_3DIntersection) | (Canonical Syntax RegEx)|   |
|   +--------------------------+----------------------------+-------------------------+   |
+-----------------------------------------------------------------------------------------+
                                             |
                                  AsyncPG / SQLAlchemy 2.0
                                             v
+-----------------------------------------------------------------------------------------+
|                                  SPATIAL PERSISTENCE LAYER                              |
|   PostgreSQL 16 + PostGIS 3.4 + SFCGAL 3D Solids Extension                              |
|   - POLYHEDRALSURFACEZ & TIN Primitives                                                 |
|   - 3D GiST Spatial Indexing (R-Tree bounding boxes in EPSG:32643)                      |
|   - Tables: parcels, buildings, vertical_units, spatial_validations, unit_lifecycle    |
|   - Redis: Spatial Cache for Tileset Bounding Boxes & Transient Sessions                |
+-----------------------------------------------------------------------------------------+
```

### Technology Matrix
| Component | Technology | Rationale |
|---|---|---|
| **Frontend Framework** | Next.js 16 (App Router, React 19) | Fast server-side routing, static generation, edge caching, zero-config API routes |
| **Geospatial Engine** | CesiumJS (WebGL / WebGPU) | High-precision WGS84 ellipsoid rendering, camera orbital controls, globe translucency |
| **Styling** | Vanilla CSS + TailwindCSS | Dark cyberpunk / high-tech HUD aesthetic (`#06b6d4`, `#a78bfa`, `#f59e0b`, `#fb7185`) |
| **Backend Framework** | FastAPI (Python 3.11+) | Asynchronous execution, native Pydantic v2 parsing, OpenAPI 3.1 generation |
| **Database** | PostgreSQL 16 + PostGIS 3.4 + SFCGAL | True 3D solid operations (`ST_3DIntersects`, `ST_3DIntersection`, `ST_MakeSolid`, `ST_Volume`) |
| **Geometry Math** | Shapely 2.0, PyProj 3.6 | Metric projection (EPSG:32643 UTM 43N) and 2D planar polygon validation |

---

## 3. Data Model & Database Schema (DDL)

```sql
-- Enable PostGIS and 3D SFCGAL extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_sfcgal;

-- 1. Base Cadastral Parcels
CREATE TABLE parcels (
    base_ulpin VARCHAR(14) PRIMARY KEY,
    footprint GEOMETRY(Polygon, 32643) NOT NULL,
    footprint_wgs84 GEOMETRY(Polygon, 4326),
    vertical_datum VARCHAR(128) NOT NULL DEFAULT 'WGS84_ELLIPSOIDAL',
    elevation_datum_m DOUBLE PRECISION NOT NULL,
    cors_station_id VARCHAR(64),
    cors_solution_id VARCHAR(128),
    survey_epoch VARCHAR(32),
    registration_ref VARCHAR(128),
    source_metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_parcels_footprint ON parcels USING GIST (footprint);

-- 2. Buildings / Superstructures
CREATE TABLE buildings (
    building_id VARCHAR(64) PRIMARY KEY,
    base_ulpin VARCHAR(14) NOT NULL REFERENCES parcels(base_ulpin) ON DELETE CASCADE,
    building_code VARCHAR(8) NOT NULL,
    name VARCHAR(128) NOT NULL,
    envelope GEOMETRY(PolyhedralSurfaceZ, 32643),
    ground_elevation_m DOUBLE PRECISION NOT NULL,
    vertical_datum VARCHAR(128) NOT NULL,
    floors_above_ground INTEGER NOT NULL CHECK (floors_above_ground >= 0),
    floors_below_ground INTEGER NOT NULL CHECK (floors_below_ground >= 0),
    status VARCHAR(24) NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_buildings_envelope ON buildings USING GIST (envelope);

-- 3. Vertical Units (V-ULPIN 3D Solids)
CREATE TABLE vertical_units (
    v_ulpin VARCHAR(64) PRIMARY KEY,
    building_id VARCHAR(64) NOT NULL REFERENCES buildings(building_id) ON DELETE CASCADE,
    floor_index INTEGER NOT NULL,
    unit_no VARCHAR(12) NOT NULL,
    unit_type VARCHAR(3) NOT NULL CHECK (unit_type IN ('RES', 'COM', 'PRK', 'UTL')),
    boundary GEOMETRY(PolyhedralSurfaceZ, 32643) NOT NULL,
    footprint GEOMETRY(Polygon, 32643) NOT NULL,
    z_min_m DOUBLE PRECISION NOT NULL,
    z_max_m DOUBLE PRECISION NOT NULL,
    area_sqm DOUBLE PRECISION NOT NULL,
    volume_m3 DOUBLE PRECISION NOT NULL,
    owner_name VARCHAR(128) NOT NULL,
    ownership_status VARCHAR(32) NOT NULL,
    rera_compliant BOOLEAN NOT NULL DEFAULT FALSE,
    source_status VARCHAR(24) NOT NULL DEFAULT 'derived',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_z_order CHECK (z_max_m > z_min_m)
);

CREATE INDEX idx_vertical_units_boundary ON vertical_units USING GIST (boundary);
CREATE INDEX idx_vertical_units_footprint ON vertical_units USING GIST (footprint);
CREATE INDEX idx_vertical_units_floor ON vertical_units (building_id, floor_index);

-- 4. Spatial Audit and Clash Validations
CREATE TABLE spatial_validations (
    id SERIAL PRIMARY KEY,
    building_id VARCHAR(64) NOT NULL REFERENCES buildings(building_id) ON DELETE CASCADE,
    v_ulpin VARCHAR(64) REFERENCES vertical_units(v_ulpin) ON DELETE SET NULL,
    validation_type VARCHAR(48) NOT NULL,
    status VARCHAR(16) NOT NULL CHECK (status IN ('pass', 'warning', 'fail')),
    engine_version VARCHAR(32) NOT NULL,
    tolerance_m3 DOUBLE PRECISION NOT NULL DEFAULT 0.001,
    metrics JSONB DEFAULT '{}'::jsonb,
    findings JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Unit Lifecycle & Mutation Ledger (Subdivision, Merger, Reclassification)
CREATE TABLE unit_lifecycle (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(24) NOT NULL CHECK (event_type IN ('created', 'split', 'merged', 'reclassified', 'cancelled')),
    prior_v_ulpins JSONB DEFAULT '[]'::jsonb,
    resulting_v_ulpins JSONB DEFAULT '[]'::jsonb,
    effective_at TIMESTAMPTZ NOT NULL,
    actor_id VARCHAR(128) NOT NULL,
    source_document_ref VARCHAR(256),
    provenance JSONB DEFAULT '{}'::jsonb
);
```

---

## 4. Pipeline Architecture & Extrusion Engine

### 4.1 Extrusion Algorithm: 2D Footprint to 3D Polyhedral Solid
The conversion of planar surveyed coordinates into a closed metric 3D solid consists of the following steps:
1. **Coordinate Projection**: Project input WGS84 geographic vertices $(\lambda, \phi)$ to Universal Transverse Mercator (UTM Zone 43N, EPSG:32643) $(X, Y)$ in metric units.
2. **Elevation Assignment**:
   $$\begin{aligned}
   Z_{min} &= Z_{ground} + (\text{floor\_index} \times H_{floor}) \\
   Z_{max} &= Z_{min} + H_{clearance}
   \end{aligned}$$
3. **Polyhedral Face Generation**:
   - **Bottom Face**: Reverse order of ring vertices (clockwise) at $Z_{min}$ for downward surface normal.
   - **Top Face**: Original order of ring vertices (counter-clockwise) at $Z_{max}$ for upward surface normal.
   - **Vertical Walls (Side Patches)**: For each edge $P_i \to P_{i+1}$, construct a 4-vertex quad:
     $$(X_i, Y_i, Z_{min}) \to (X_{i+1}, Y_{i+1}, Z_{min}) \to (X_{i+1}, Y_{i+1}, Z_{max}) \to (X_i, Y_i, Z_{max}) \to (X_i, Y_i, Z_{min})$$
4. **Solid Closure Validation**: Check `ST_IsSolid(ST_MakeSolid(boundary))` to guarantee water-tightness with zero non-manifold edges.

### 4.2 3D Topological Validation (Zero Positive Overlap Guarantee)
To enforce strict boundary integrity, candidate solids are validated against all existing units on the parcel:
```sql
SELECT unit.v_ulpin,
       ST_Volume(ST_MakeSolid(ST_3DIntersection(unit.boundary, candidate.geom))) AS overlap_volume_m3
FROM vertical_units AS unit,
     (SELECT ST_MakeSolid(ST_GeomFromText(:candidate_wkt, 32643)) AS geom) AS candidate
WHERE unit.building_id = :building_id
  AND ST_3DIntersects(unit.boundary, candidate.geom)
  AND ST_Volume(ST_MakeSolid(ST_3DIntersection(unit.boundary, candidate.geom))) > 0.001;
```
- **Tolerance threshold**: $\epsilon = 0.001\text{ m}^3$ (1 liter of volume).
- **Shared Walls**: Shared boundaries have area $> 0$ but volume $= 0$, and are therefore permitted without false positives.
- **Positive-Volume Clashes**: Any intersection resulting in volume $> 0.001\text{ m}^3$ triggers immediate rejection with violation coordinates returned.

---

## 5. API Contracts & OpenAPI Specification

### Endpoints Overview
| HTTP Method | Route | Description |
|---|---|---|
| `POST` | `/api/v-ulpin/extrude` | Ingests 2D boundary, floor index, and metadata; runs clash check; generates V-ULPIN; persists solid. |
| `GET` | `/api/buildings/{id}/geojson-3d` | Returns 3D GeoJSON FeatureCollection with volumetric properties for all units in a building. |
| `GET` | `/api/buildings/{id}/tileset-metadata` | Returns spatial bounds, floor levels, unit inventory, and RERA registration refs. |
| `POST` | `/api/topology/audit` | Executes comprehensive spatial collision scans across all building units or candidate geometry. |
| `GET` | `/health` | Healthcheck returning engine mode (`postgis` or in-memory `demo`). |

---

## 6. SIH26011 Pune Ward 8 Pilot Specification
- **Pilot Area**: Ward No. 8 (Aundh - Bopodi), Pune Municipal Corporation (PMC), Maharashtra.
- **Reference Coordinates**: $18.5605^\circ\text{ N}, 73.8078^\circ\text{ E}$.
- **Ground Datum**: $+560.0\text{ m}$ above Mean Sea Level (MSL).
- **Towers**:
  - **Tower A (Aundh Heights - Tower A)**: G+10 residential/commercial tower with 2 basements (168 units total: 120 RES, 6 COM, 40 PRK, 2 UTL).
  - **Tower B (Aundh Heights - Tower B)**: G+6 residential tower with 1 basement (67 units total: 48 RES, 4 COM, 14 PRK, 1 UTL).
- **Total Validated Units**: 235 units with zero topological volume violations.
