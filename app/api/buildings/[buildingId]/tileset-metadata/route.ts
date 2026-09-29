import { NextResponse } from "next/server";
import { DEMO_BUILDINGS, featuresForBuilding } from "@/lib/demo-data";

export async function GET(_request: Request, context: { params: Promise<{ buildingId: string }> }) {
  const { buildingId } = await context.params;
  const building = DEMO_BUILDINGS[buildingId as keyof typeof DEMO_BUILDINGS];
  if (!building) return NextResponse.json({ detail: "Building not found" }, { status: 404 });
  const features = featuresForBuilding(buildingId);
  const levels = [...new Set(features.map((feature) => feature.properties.level))].sort((a, b) => a - b);
  const inventory = features.reduce<Record<string, number>>((result, feature) => {
    result[feature.properties.type] = (result[feature.properties.type] ?? 0) + 1;
    return result;
  }, {});
  return NextResponse.json({
    building_id: buildingId,
    name: building.name,
    center: [building.longitude, building.latitude],
    bounds: [building.longitude - 0.00025, building.latitude - 0.0002, building.longitude + 0.00025, building.latitude + 0.0002, building.ground_elevation_m - building.floors_below_ground * 3.4, building.ground_elevation_m + building.height_m],
    levels,
    inventory,
    units: features.length,
    floors_above_ground: building.floors_above_ground,
    floors_below_ground: building.floors_below_ground,
    rera_ref: building.rera_ref,
    tileset_version: "demo-1.0.0",
  });
}