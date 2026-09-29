export type UnitType = "RES" | "COM" | "PRK" | "UTL";

export type UnitProperties = {
  v_ulpin: string;
  building_id: string;
  tower_id: string;
  level: number;
  unit_no: string;
  type: UnitType;
  area_sqm: number;
  volume_m3: number;
  z_min_m: number;
  z_max_m: number;
  owner_name: string;
  status: string;
  rera_compliant: boolean;
  source_status: string;
};

export type PolygonGeometry = {
  type: "Polygon";
  coordinates: number[][][];
};

export type UnitFeature = {
  type: "Feature";
  id: string;
  geometry: PolygonGeometry;
  properties: UnitProperties;
};

export type DemoRecord = {
  feature: UnitFeature;
  metricBounds: [number, number, number, number];
};

export const DEMO_BUILDINGS = {
  "tower-a": {
    building_id: "tower-a",
    name: "Aundh Heights / Tower A",
    tower_id: "TA",
    base_ulpin: "12345678901234",
    longitude: 73.8078,
    latitude: 18.5605,
    ground_elevation_m: 560,
    floors_above_ground: 10,
    floors_below_ground: 2,
    height_m: 41,
    rera_ref: "P521000-demo-A",
  },
  "tower-b": {
    building_id: "tower-b",
    name: "Aundh Heights / Tower B",
    tower_id: "TB",
    base_ulpin: "12345678901235",
    longitude: 73.8087,
    latitude: 18.5608,
    ground_elevation_m: 560,
    floors_above_ground: 6,
    floors_below_ground: 1,
    height_m: 25,
    rera_ref: "P521000-demo-B",
  },
} as const;

const METERS_PER_LAT_DEGREE = 111_320;
const floorHeight = (level: number) => level < 0 ? 3.4 : 3.25;

function ringForBounds(bounds: [number, number, number, number]): number[][][] {
  const [west, south, east, north] = bounds;
  return [[[west, south], [east, south], [east, north], [west, north], [west, south]]];
}

function makeRecord(
  buildingId: keyof typeof DEMO_BUILDINGS,
  level: number,
  unitNo: string,
  type: UnitType,
  x: number,
  y: number,
  width: number,
  depth: number,
  owner: string,
): DemoRecord {
  const building = DEMO_BUILDINGS[buildingId];
  const metersPerLonDegree = METERS_PER_LAT_DEGREE * Math.cos(building.latitude * Math.PI / 180);
  const originX = building.longitude * metersPerLonDegree;
  const originY = building.latitude * METERS_PER_LAT_DEGREE;
  const metricBounds: [number, number, number, number] = [originX + x, originY + y, originX + x + width, originY + y + depth];
  const geoBounds: [number, number, number, number] = [
    metricBounds[0] / metersPerLonDegree,
    metricBounds[1] / METERS_PER_LAT_DEGREE,
    metricBounds[2] / metersPerLonDegree,
    metricBounds[3] / METERS_PER_LAT_DEGREE,
  ];
  const zMin = building.ground_elevation_m + level * floorHeight(level);
  const zMax = zMin + (type === "PRK" ? 2.7 : 2.95);
  const vUlpIn = `${building.base_ulpin}-${building.tower_id}-${level}-${unitNo}-${type}`;
  const area = width * depth;
  return {
    metricBounds,
    feature: {
      type: "Feature",
      id: vUlpIn,
      geometry: { type: "Polygon", coordinates: ringForBounds(geoBounds) },
      properties: {
        v_ulpin: vUlpIn,
        building_id: buildingId,
        tower_id: building.tower_id,
        level,
        unit_no: unitNo,
        type,
        area_sqm: Math.round(area * 100) / 100,
        volume_m3: Math.round(area * (zMax - zMin) * 100) / 100,
        z_min_m: zMin,
        z_max_m: zMax,
        owner_name: owner,
        status: "Registered (demo)",
        rera_compliant: type === "RES" || type === "COM",
        source_status: "surveyed",
      },
    },
  };
}

function generateBuilding(buildingId: keyof typeof DEMO_BUILDINGS): DemoRecord[] {
  const towerA = buildingId === "tower-a";
  const rows = towerA ? 3 : 2;
  const count = towerA ? 20 : 14;
  const basements = towerA ? [-2, -1] : [-1];
  const floors = towerA ? 10 : 6;
  const records: DemoRecord[] = [];

  for (let level = 1; level <= floors; level += 1) {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < 4; column += 1) {
        records.push(makeRecord(buildingId, level, `U${String(row * 4 + column + 1).padStart(2, "0")}`, "RES", 0.5 + column * 7.1, 0.5 + row * 5.5, 6.8, 5.2, `Sample Owner ${String(records.length + 1).padStart(3, "0")}`));
      }
    }
  }

  const shops = towerA ? 6 : 4;
  for (let index = 0; index < shops; index += 1) {
    records.push(makeRecord(buildingId, 0, `C${String(index + 1).padStart(2, "0")}`, "COM", 0.5 + (index % 3) * 9.2, 0.5 + Math.floor(index / 3) * 7.2, 8.8, 6.8, "Demo commercial unit"));
  }

  for (const level of basements) {
    for (let index = 0; index < count; index += 1) {
      records.push(makeRecord(buildingId, level, `P${String(index + 1).padStart(2, "0")}`, "PRK", 0.5 + (index % 5) * 5.4, 0.5 + Math.floor(index / 5) * 5.4, 2.5, 5, "Unassigned parking inventory"));
    }
    records.push(makeRecord(buildingId, level, "CORRIDOR", "UTL", 0.5, 23, towerA ? 28.2 : 25.8, 1, "Common utility space"));
  }
  return records;
}

const demoState = globalThis as typeof globalThis & { __vulpinDemoRecords?: DemoRecord[] };
export const DEMO_RECORDS = demoState.__vulpinDemoRecords ??= [
  ...generateBuilding("tower-a"),
  ...generateBuilding("tower-b"),
];

export const DEMO_UNITS = new Map(DEMO_RECORDS.map((record) => [record.feature.id, record]));

export function featuresForBuilding(buildingId: string): UnitFeature[] {
  return DEMO_RECORDS.filter((record) => record.feature.properties.building_id === buildingId).map((record) => record.feature);
}

export function overlapForBounds(
  a: [number, number, number, number],
  b: [number, number, number, number],
): { bounds: [number, number, number, number]; area: number } | null {
  const bounds: [number, number, number, number] = [
    Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3]),
  ];
  if (bounds[2] <= bounds[0] || bounds[3] <= bounds[1]) return null;
  return { bounds, area: (bounds[2] - bounds[0]) * (bounds[3] - bounds[1]) };
}