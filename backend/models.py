"""SQLAlchemy 2 async-compatible PostGIS cadastral models."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from geoalchemy2 import Geometry
from sqlalchemy import DateTime, Float, ForeignKey, Integer, JSON, String, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Parcel(Base):
    __tablename__ = "parcels"

    base_ulpin: Mapped[str] = mapped_column(String(14), primary_key=True)
    footprint: Mapped[Any] = mapped_column(Geometry("POLYGON", srid=32643), nullable=False)
    footprint_wgs84: Mapped[Any] = mapped_column(Geometry("POLYGON", srid=4326))
    vertical_datum: Mapped[str] = mapped_column(String(128), nullable=False)
    elevation_datum_m: Mapped[float] = mapped_column(Float, nullable=False)
    cors_station_id: Mapped[Optional[str]] = mapped_column(String(64))
    cors_solution_id: Mapped[Optional[str]] = mapped_column(String(128))
    survey_epoch: Mapped[Optional[str]] = mapped_column(String(32))
    registration_ref: Mapped[Optional[str]] = mapped_column(String(128))
    source_metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class Building(Base):
    __tablename__ = "buildings"

    building_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    base_ulpin: Mapped[str] = mapped_column(ForeignKey("parcels.base_ulpin"), nullable=False)
    building_code: Mapped[str] = mapped_column(String(8), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    envelope: Mapped[Optional[Any]] = mapped_column(Geometry("POLYHEDRALSURFACEZ", srid=32643))
    ground_elevation_m: Mapped[float] = mapped_column(Float, nullable=False)
    vertical_datum: Mapped[str] = mapped_column(String(128), nullable=False)
    floors_above_ground: Mapped[int] = mapped_column(Integer, nullable=False)
    floors_below_ground: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="draft", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class VerticalUnit(Base):
    __tablename__ = "vertical_units"

    v_ulpin: Mapped[str] = mapped_column(String(64), primary_key=True)
    building_id: Mapped[str] = mapped_column(ForeignKey("buildings.building_id"), nullable=False)
    floor_index: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_no: Mapped[str] = mapped_column(String(12), nullable=False)
    unit_type: Mapped[str] = mapped_column(String(3), nullable=False)
    boundary: Mapped[Any] = mapped_column(
        Geometry("POLYHEDRALSURFACEZ", srid=32643, spatial_index=True), nullable=False
    )
    footprint: Mapped[Any] = mapped_column(Geometry("POLYGON", srid=32643), nullable=False)
    z_min_m: Mapped[float] = mapped_column(Float, nullable=False)
    z_max_m: Mapped[float] = mapped_column(Float, nullable=False)
    area_sqm: Mapped[float] = mapped_column(Float, nullable=False)
    volume_m3: Mapped[float] = mapped_column(Float, nullable=False)
    owner_name: Mapped[str] = mapped_column(String(128), nullable=False)
    ownership_status: Mapped[str] = mapped_column(String(32), nullable=False)
    rera_compliant: Mapped[bool] = mapped_column(default=False, nullable=False)
    source_status: Mapped[str] = mapped_column(String(24), default="derived", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SpatialValidation(Base):
    __tablename__ = "spatial_validations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    building_id: Mapped[str] = mapped_column(String(64), nullable=False)
    v_ulpin: Mapped[Optional[str]] = mapped_column(String(64))
    validation_type: Mapped[str] = mapped_column(String(48), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    engine_version: Mapped[str] = mapped_column(String(32), nullable=False)
    tolerance_m3: Mapped[float] = mapped_column(Float, nullable=False)
    metrics: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    findings: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UnitLifecycle(Base):
    __tablename__ = "unit_lifecycle"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_type: Mapped[str] = mapped_column(String(24), nullable=False)
    prior_v_ulpins: Mapped[list[str]] = mapped_column(JSON, default=list)
    resulting_v_ulpins: Mapped[list[str]] = mapped_column(JSON, default=list)
    effective_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    actor_id: Mapped[str] = mapped_column(String(128), nullable=False)
    source_document_ref: Mapped[Optional[str]] = mapped_column(String(256))
    provenance: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)