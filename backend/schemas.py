"""Strict Pydantic v2 request and response contracts."""

import re
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

PropertyType = Literal["RES", "COM", "PRK", "UTL"]
UserRole = Literal["public", "surveyor", "registrar", "owner"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class GeoJSONPolygon(StrictModel):
    type: Literal["Polygon"]
    coordinates: list[list[tuple[float, float]]]

    @field_validator("coordinates")
    @classmethod
    def validate_rings(cls, rings: list[list[tuple[float, float]]]) -> list[list[tuple[float, float]]]:
        if not rings:
            raise ValueError("Polygon requires an exterior ring")
        if len(rings) > 11:
            raise ValueError("Polygon exceeds maximum allowable interior rings (10)")
        for ring in rings:
            if len(ring) < 4 or ring[0] != ring[-1]:
                raise ValueError("Each polygon ring must have at least four positions and be closed")
            if len(ring) > 500:
                raise ValueError(f"Polygon ring vertex count ({len(ring)}) exceeds DoS security limit (500)")
            for longitude, latitude in ring:
                if not -180 <= longitude <= 180 or not -90 <= latitude <= 90:
                    raise ValueError("Boundary coordinates must be valid geodetic longitude/latitude")
        return rings


class ExtrudeRequest(StrictModel):
    building_id: str = Field(min_length=1, max_length=64)
    base_ulpin: str = Field(pattern=r"^[A-Z0-9]{14}$")
    tower_id: str = Field(pattern=r"^[A-Z0-9]{1,8}$")
    floor_index: int = Field(ge=-999, le=999)
    unit_no: str = Field(pattern=r"^[A-Z0-9]{1,12}$")
    unit_type: PropertyType
    boundary: GeoJSONPolygon
    ceiling_height_m: float = Field(gt=0, le=15)
    ground_elevation_m: float = Field(default=560.0, ge=-500, le=9000)
    floor_to_floor_m: float = Field(default=3.2, gt=0, le=20)
    owner_name: str = Field(default="Unassigned", max_length=128)
    source_status: Literal["derived", "surveyed", "as_built", "approved"] = "derived"

    @field_validator("owner_name")
    @classmethod
    def sanitize_owner(cls, value: str) -> str:
        # Strip potential HTML/script injection tokens
        sanitized = re.sub(r"[<>{}\\\"]", "", value).strip()
        return sanitized or "Unassigned"


class UnitProperties(StrictModel):
    v_ulpin: str
    building_id: str
    tower_id: str
    level: int
    unit_no: str
    type: PropertyType
    area_sqm: float
    volume_m3: float
    z_min_m: float
    z_max_m: float
    owner_name: str
    status: str
    rera_compliant: bool
    source_status: str

    def for_role(self, role: str) -> "UnitProperties":
        """Sanitize personal data according to Cadastral Privacy Safeguards."""
        if role == "public":
            # Mask owner identity for public cadastre viewers
            parts = self.owner_name.split()
            masked_name = " ".join(f"{p[0]}***" for p in parts if p) if parts else "Protected"
            return self.model_copy(update={
                "owner_name": f"{masked_name} [RERA Protected]",
            })
        return self


class GeoJSONFeature(StrictModel):
    type: Literal["Feature"] = "Feature"
    id: str
    geometry: GeoJSONPolygon
    properties: UnitProperties


class FeatureCollection(StrictModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[GeoJSONFeature]


class TilesetMetadata(StrictModel):
    building_id: str
    bounds: list[float]
    levels: list[int]
    inventory: dict[str, int]
    units: int


class AuditRequest(StrictModel):
    building_id: str
    candidate: Optional[GeoJSONPolygon] = None
    floor_index: Optional[int] = Field(default=None, ge=-999, le=999)
    ceiling_height_m: Optional[float] = Field(default=None, gt=0, le=15)
    ground_elevation_m: float = 560.0


class Clash(StrictModel):
    unit_v_ulpin: str
    overlap_volume_m3: float
    overlap_geometry: GeoJSONPolygon
    level: int
    z_min_m: float
    z_max_m: float


class AuditResponse(StrictModel):
    building_id: str
    status: Literal["pass", "warning", "fail"]
    checked_units: int
    clash_count: int
    tolerance_m3: float
    violations: list[Clash]
    heatmap: list[dict[str, Any]]


class ExtrudeResponse(StrictModel):
    accepted: bool
    v_ulpin: str
    feature: GeoJSONFeature
    collision_check: AuditResponse