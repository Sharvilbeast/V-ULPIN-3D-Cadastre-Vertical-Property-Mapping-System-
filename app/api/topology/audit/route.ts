import { NextResponse } from "next/server";
import { DEMO_BUILDINGS, DEMO_RECORDS, overlapForBounds, type UnitFeature } from "@/lib/demo-data";

type AuditBody = {
  building_id: string;
  candidate?: UnitFeature["geometry"];
  floor_index?: number;
  ceiling_height_m?: number;
  ground_elevation_m?: number;
};

function featureBounds(feature: UnitFeature): [number, number, number, number] {
  const points = feature.geometry.coordinates[0];
  return [
    Math.min(...points.map((point) => point[0])),
    Math.min(...points.map((point) => point[1])),
    Math.max(...points.map((point) => point[0])),
    Math.max(...points.map((point) => point[1])),
  ];
}

export async function POST(request: Request) {
  const body = await request.json() as AuditBody;
  if (!(body.building_id in DEMO_BUILDINGS)) {
    return NextResponse.json({ detail: "Building not found" }, { status: 404 });
  }
  const units = DEMO_RECORDS.filter((record) => record.feature.properties.building_id === body.building_id);
  const violations: Array<{ unit_v_ulpin: string; overlap_volume_m3: number; overlap_geometry: UnitFeature["geometry"]; level: number; z_min_m: number; z_max_m: number }> = [];

  if (body.candidate) {
    if (body.floor_index === undefined || body.ceiling_height_m === undefined) {
      return NextResponse.json({ detail: "candidate requires floor_index and ceiling_height_m" }, { status: 422 });
    }
    const candidateGeoBounds = featureBounds({ type: "Feature", id: "candidate", geometry: body.candidate, properties: units[0]?.feature.properties ?? DEMO_RECORDS[0].feature.properties });
    const building = DEMO_BUILDINGS[body.building_id as keyof typeof DEMO_BUILDINGS];
    const metersPerLongitudeDegree = 111_320 * Math.cos(building.latitude * Math.PI / 180);
    const candidateBounds: [number, number, number, number] = [
      candidateGeoBounds[0] * metersPerLongitudeDegree,
      candidateGeoBounds[1] * 111_320,
      candidateGeoBounds[2] * metersPerLongitudeDegree,
      candidateGeoBounds[3] * 111_320,
    ];
    const bottom = (body.ground_elevation_m ?? 560) + body.floor_index * (body.floor_index < 0 ? 3.4 : 3.25);
    const top = bottom + body.ceiling_height_m;
    for (const unit of units) {
      const levelBottom = Math.max(bottom, unit.feature.properties.z_min_m);
      const levelTop = Math.min(top, unit.feature.properties.z_max_m);
      if (levelTop <= levelBottom) continue;
      const overlap = overlapForBounds(candidateBounds, unit.metricBounds);
      const volume = (overlap?.area ?? 0) * (levelTop - levelBottom);
      if (!overlap || volume <= 0.001) continue;
      const scaleX = metersPerLongitudeDegree;
      const scaleY = 1 / 111_320;
      const a = overlap.bounds;
      const ring = [[a[0] / scaleX, a[1] * scaleY], [a[2] / scaleX, a[1] * scaleY], [a[2] / scaleX, a[3] * scaleY], [a[0] / scaleX, a[3] * scaleY], [a[0] / scaleX, a[1] * scaleY]];
      violations.push({
        unit_v_ulpin: unit.feature.id,
        overlap_volume_m3: Math.round(volume * 1000) / 1000,
        overlap_geometry: { type: "Polygon", coordinates: [ring] },
        level: unit.feature.properties.level,
        z_min_m: levelBottom,
        z_max_m: levelTop,
      });
    }
  } else {
    for (let first = 0; first < units.length; first += 1) {
      const a = units[first];
      for (let second = first + 1; second < units.length; second += 1) {
        const b = units[second];
        const zMin = Math.max(a.feature.properties.z_min_m, b.feature.properties.z_min_m);
        const zMax = Math.min(a.feature.properties.z_max_m, b.feature.properties.z_max_m);
        if (zMax <= zMin) continue;
        const overlap = overlapForBounds(a.metricBounds, b.metricBounds);
        const volume = (overlap?.area ?? 0) * (zMax - zMin);
        if (!overlap || volume <= 0.001) continue;
        violations.push({
          unit_v_ulpin: a.feature.id,
          overlap_volume_m3: Math.round(volume * 1000) / 1000,
          overlap_geometry: a.feature.geometry,
          level: a.feature.properties.level,
          z_min_m: zMin,
          z_max_m: zMax,
        });
      }
    }
  }

  return NextResponse.json({
    building_id: body.building_id,
    status: violations.length ? "fail" : "pass",
    checked_units: units.length,
    clash_count: violations.length,
    tolerance_m3: 0.001,
    violations,
    heatmap: violations.map((clash) => ({ v_ulpin: clash.unit_v_ulpin, level: clash.level, intensity: Math.min(1, clash.overlap_volume_m3), overlap_volume_m3: clash.overlap_volume_m3 })),
  });
}