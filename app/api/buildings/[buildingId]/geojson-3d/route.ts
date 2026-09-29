import { NextResponse } from "next/server";
import { featuresForBuilding, DEMO_BUILDINGS } from "@/lib/demo-data";

export async function GET(_request: Request, context: { params: Promise<{ buildingId: string }> }) {
  const { buildingId } = await context.params;
  if (!(buildingId in DEMO_BUILDINGS)) {
    return NextResponse.json({ detail: "Building not found" }, { status: 404 });
  }
  return NextResponse.json({ type: "FeatureCollection", features: featuresForBuilding(buildingId) });
}