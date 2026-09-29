import { NextResponse } from "next/server";
import { DEMO_BUILDINGS, DEMO_RECORDS, overlapForBounds, type UnitFeature, type UnitType } from "@/lib/demo-data";

type ExtrudeBody = {
  building_id: string;
  base_ulpin: string;
  tower_id: string;
  floor_index: number;
  unit_no: string;
  unit_type: UnitType;
  boundary: { type: "Polygon"; coordinates: number[][][] };
  ceiling_height_m: number;
  ground_elevation_m?: number;
  owner_name?: string;
};

export async function POST(request: Request) {
  const body = await request.json() as ExtrudeBody;
  if (!(body.building_id in DEMO_BUILDINGS) || !/^[A-Z0-9]{14}$/.test(body.base_ulpin)) {
    return NextResponse.json({ detail: "Invalid building or base ULPIN" }, { status: 422 });
  }
  if (!Number.isInteger(body.floor_index) || Math.abs(body.floor_index) > 999 || body.ceiling_height_m <= 0) {
    return NextResponse.json({ detail: "Invalid floor or ceiling height" }, { status: 422 });
  }
  const vUlpIn = `${body.base_ulpin}-${body.tower_id}-${body.floor_index}-${body.unit_no}-${body.unit_type}`;
  if (!/^[A-Z0-9]{14}-[A-Z0-9]{1,8}-(0|[1-9][0-9]{0,2}|-[1-9][0-9]{0,2})-[A-Z0-9]{1,12}-(RES|COM|PRK|UTL)$/.test(vUlpIn)) {
    return NextResponse.json({ detail: "V-ULPIN does not match canonical syntax" }, { status: 422 });
  }
  if (DEMO_RECORDS.some((record) => record.feature.id === vUlpIn)) {
    return NextResponse.json({ detail: "V-ULPIN already exists" }, { status: 409 });
  }
  const ring = body.boundary.coordinates[0];
  if (!ring || ring.length < 4 || ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
    return NextResponse.json({ detail: "Polygon ring must be closed" }, { status: 422 });
  }
  const points = ring.map(([longitude, latitude]) => [longitude, latitude]);
  const longitudeScale = 111_320 * Math.cos(DEMO_BUILDINGS[body.building_id as keyof typeof DEMO_BUILDINGS].latitude * Math.PI / 180);
  const metricPoints = points.map(([longitude, latitude]) => [longitude * longitudeScale, latitude * 111_320]);
  const candidateBounds: [number, number, number, number] = [Math.min(...metricPoints.map((p) => p[0])), Math.min(...metricPoints.map((p) => p[1])), Math.max(...metricPoints.map((p) => p[0])), Math.max(...metricPoints.map((p) => p[1]))];
  const ground = body.ground_elevation_m ?? 560;
  const zMin = ground + body.floor_index * (body.floor_index < 0 ? 3.4 : 3.25);
  const zMax = zMin + body.ceiling_height_m;
  const collisions = DEMO_RECORDS.filter((record) => record.feature.properties.building_id === body.building_id).flatMap((record) => {
    const low = Math.max(zMin, record.feature.properties.z_min_m);
    const high = Math.min(zMax, record.feature.properties.z_max_m);
    if (high <= low) return [];
    const overlap = overlapForBounds(candidateBounds, record.metricBounds);
    const volume = (overlap?.area ?? 0) * (high - low);
    return overlap && volume > 0.001 ? [{ unit_v_ulpin: record.feature.id, overlap_volume_m3: Math.round(volume * 1000) / 1000 }] : [];
  });
  if (collisions.length) return NextResponse.json({ detail: "Positive-volume clash", collisions }, { status: 409 });

  const area = Math.abs(metricPoints.slice(0, -1).reduce((sum, point, index) => {
    const next = metricPoints[index + 1];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0)) / 2;
  const feature: UnitFeature = {
    type: "Feature",
    id: vUlpIn,
    geometry: body.boundary,
    properties: {
      v_ulpin: vUlpIn, building_id: body.building_id, tower_id: body.tower_id,
      level: body.floor_index, unit_no: body.unit_no, type: body.unit_type,
      area_sqm: area, volume_m3: area * (zMax - zMin), z_min_m: zMin, z_max_m: zMax,
      owner_name: body.owner_name ?? "Unassigned", status: "Pending review",
      rera_compliant: body.unit_type === "RES" || body.unit_type === "COM", source_status: "derived",
    },
  };
  DEMO_RECORDS.push({ feature, metricBounds: candidateBounds });
  return NextResponse.json({ accepted: true, v_ulpin: vUlpIn, feature, collision_check: { status: "pass", tolerance_m3: 0.001, violations: [] } }, { status: 201 });
}