"use client";

import { useMemo, useState } from "react";
import { Boxes, Check, LoaderCircle, X } from "lucide-react";
import type { UnitFeature, UnitType } from "@/lib/demo-data";

export type BuildingOption = {
  building_id: string;
  name: string;
  tower_id: string;
  base_ulpin: string;
  longitude: number;
  latitude: number;
  floors_above_ground: number;
  floors_below_ground: number;
};

type Props = {
  building: BuildingOption;
  onClose: () => void;
  onCreated: (feature: UnitFeature) => void;
};

export default function UnitCreationModal({ building, onClose, onCreated }: Props) {
  const [floor, setFloor] = useState("1");
  const [unitNo, setUnitNo] = useState("NEW01");
  const [unitType, setUnitType] = useState<UnitType>("RES");
  const [owner, setOwner] = useState("Unassigned");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const vUlpIn = useMemo(() => `${building.base_ulpin}-${building.tower_id}-${floor}-${unitNo.toUpperCase()}-${unitType}`, [building, floor, unitNo, unitType]);

  const submit = async () => {
    setError("");
    setSubmitting(true);
    const metersPerLongitudeDegree = 111_320 * Math.cos(building.latitude * Math.PI / 180);
    const longitude = building.longitude + 0.000225;
    const latitude = building.latitude + 0.000178;
    const halfWidth = 2.1 / metersPerLongitudeDegree;
    const halfDepth = 2.1 / 111_320;
    const boundary = {
      type: "Polygon" as const,
      coordinates: [[
        [longitude - halfWidth, latitude - halfDepth],
        [longitude + halfWidth, latitude - halfDepth],
        [longitude + halfWidth, latitude + halfDepth],
        [longitude - halfWidth, latitude + halfDepth],
        [longitude - halfWidth, latitude - halfDepth],
      ]],
    };
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_VULPIN_API_URL ?? ""}/api/v-ulpin/extrude`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          building_id: building.building_id,
          base_ulpin: building.base_ulpin,
          tower_id: building.tower_id,
          floor_index: Number(floor),
          unit_no: unitNo.toUpperCase(),
          unit_type: unitType,
          boundary,
          ceiling_height_m: 2.8,
          ground_elevation_m: 560,
          owner_name: owner,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        const collisionCount = result.collisions?.length;
        throw new Error(collisionCount ? `Allocation blocked: ${collisionCount} spatial conflict(s) found.` : result.detail ?? "Could not create the vertical unit.");
      }
      onCreated(result.feature as UnitFeature);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-scrim" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="unit-modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="new-unit-title">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="icon-square"><Boxes size={16} /></div>
            <div><p className="eyebrow">Identifier allocator</p><h2 id="new-unit-title" className="mt-1 text-lg font-semibold text-white">Create vertical unit</h2></div>
          </div>
          <button className="icon-button" aria-label="Close new unit form" onClick={onClose}><X size={16} /></button>
        </div>
        <p className="mt-4 text-xs text-slate-400">{building.name} · geometry is topology-checked before allocation.</p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <label className="form-field"><span>Floor index</span><input value={floor} onChange={(event) => setFloor(event.target.value)} type="number" min="-999" max="999" /></label>
          <label className="form-field"><span>Unit number</span><input value={unitNo} onChange={(event) => setUnitNo(event.target.value.toUpperCase())} maxLength={12} /></label>
          <label className="form-field"><span>Property type</span><select value={unitType} onChange={(event) => setUnitType(event.target.value as UnitType)}><option value="RES">Residential</option><option value="COM">Commercial</option><option value="PRK">Parking</option><option value="UTL">Utility</option></select></label>
          <label className="form-field"><span>Owner label</span><input value={owner} onChange={(event) => setOwner(event.target.value)} maxLength={128} /></label>
        </div>

        <div className="identifier-preview mt-4">
          <span className="eyebrow">Generated V-ULPIN</span>
          <code>{vUlpIn}</code>
        </div>
        <p className="mt-2 text-[10px] leading-5 text-slate-500">The demo creates a sample 4.2 × 4.2 m boundary near the selected tower. Replace it with a surveyed GeoJSON boundary in a real registration workflow.</p>
        {error && <p role="alert" className="mt-3 rounded border border-rose-400/30 bg-rose-400/10 p-3 text-xs text-rose-200">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button className="button-secondary" onClick={onClose}>Cancel</button>
          <button className="button-primary" disabled={submitting || !unitNo.trim()} onClick={submit}>
            {submitting ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />}
            {submitting ? "Checking topology…" : "Validate & allocate"}
          </button>
        </div>
      </section>
    </div>
  );
}