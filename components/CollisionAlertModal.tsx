"use client";

import { useState } from "react";
import { AlertTriangle, FileUp, X } from "lucide-react";
import type { UnitFeature } from "@/lib/demo-data";
import type { ViewerClash } from "@/components/CesiumViewer";

type Props = {
  buildingId: string;
  selected: UnitFeature | null;
  onClose: () => void;
  onClashes: (clashes: ViewerClash[]) => void;
};

export default function CollisionAlertModal({ buildingId, selected, onClose, onClashes }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const sampleGeometry = (): UnitFeature["geometry"] => {
    if (selected) {
      const ring = selected.geometry.coordinates[0];
      const shifted = ring.map(([longitude, latitude]) => [longitude + 0.000008, latitude] as number[]);
      return { type: "Polygon", coordinates: [shifted] };
    }
    const [longitude, latitude] = [73.8078, 18.5605];
    return { type: "Polygon", coordinates: [[[longitude, latitude], [longitude + 0.00003, latitude], [longitude + 0.00003, latitude + 0.00003], [longitude, latitude + 0.00003], [longitude, latitude]]] };
  };

  const runAudit = async (geometry: UnitFeature["geometry"]) => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/topology/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          building_id: buildingId,
          candidate: geometry,
          floor_index: selected?.properties.level ?? 1,
          ceiling_height_m: 2.8,
          ground_elevation_m: 560,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail ?? "Topology audit failed");
      onClashes(result.violations ?? []);
      setMessage(result.clash_count ? `${result.clash_count} volumetric overlap(s) detected. The red geometry is now shown in the scene.` : "No positive-volume overlap detected.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not run topology audit.");
    } finally {
      setBusy(false);
    }
  };

  const upload = async () => {
    if (!file) {
      await runAudit(sampleGeometry());
      return;
    }
    try {
      const source = JSON.parse(await file.text()) as { type?: string; geometry?: UnitFeature["geometry"]; coordinates?: number[][][] };
      const geometry = source.type === "Feature" ? source.geometry : source as UnitFeature["geometry"];
      if (!geometry || geometry.type !== "Polygon") throw new Error("Upload a GeoJSON Polygon or Feature.");
      await runAudit(geometry);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not read the GeoJSON file.");
    }
  };

  return (
    <div className="modal-scrim" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="collision-modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="collision-title">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="alert-icon"><AlertTriangle size={19} /></div>
            <div><p className="eyebrow text-rose-300">Survey validation</p><h2 id="collision-title" className="mt-1 text-lg font-semibold text-white">Check boundary overlap</h2></div>
          </div>
          <button className="icon-button" aria-label="Close clash audit" onClick={onClose}><X size={16} /></button>
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-400">Upload a GeoJSON boundary to compare it against existing vertical units. The audit rejects only positive-volume intersections above 0.001 m³; shared walls are allowed.</p>
        <label className="upload-zone mt-5">
          <FileUp size={21} className="text-cyan-300" />
          <span className="text-sm font-medium text-slate-200">{file?.name ?? "Choose a GeoJSON boundary"}</span>
          <span className="text-xs text-slate-500">Polygon or Feature · .geojson / .json</span>
          <input type="file" accept=".geojson,.json,application/geo+json,application/json" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        </label>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="mono text-[10px] text-slate-500">Building {buildingId} · 3D intersection scan</span>
          <button className="button-alert" onClick={upload} disabled={busy}>{busy ? "Checking…" : "Run overlap scan"}</button>
        </div>
        {message && <p className={`mt-4 rounded border p-3 text-sm ${message.includes("detected") && !message.startsWith("No") ? "audit-fail" : "audit-pass"}`}>{message}</p>}
        <p className="mt-4 text-[10px] leading-5 text-slate-600">Pilot geometries are simulated. An approved survey and legal declaration remain authoritative.</p>
      </section>
    </div>
  );
}