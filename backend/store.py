"""In-memory demo repository used when DATABASE_URL is unset."""

from __future__ import annotations

from typing import Any

UNITS: dict[str, dict[str, Any]] = {}
BUILDINGS: dict[str, dict[str, Any]] = {}


def replace_demo_data(buildings: dict[str, dict[str, Any]], units: list[dict[str, Any]]) -> None:
    BUILDINGS.clear()
    BUILDINGS.update(buildings)
    UNITS.clear()
    UNITS.update({unit["properties"]["v_ulpin"]: unit for unit in units})