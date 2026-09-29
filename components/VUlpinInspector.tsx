"use client";

import { useState } from "react";
import { BadgeCheck, Box, FileDown, ScanSearch, ShieldAlert, ShieldCheck, SquareArrowOutUpRight } from "lucide-react";
import type { UnitFeature } from "@/lib/demo-data";

type Props = {
  feature: UnitFeature | null;
  auditStatus: "pass" | "warning" | "fail" | null;
  onVerify: () => Promise<void>;
  onIsolate: () => void;
};

function formatFloor(level: number) {
  if (level === 0) return "Ground";
  return level < 0 ? `Basement ${Math.abs(level)}` : `Floor ${level}`;
}

function identifierSegments(feature: UnitFeature) {
  const { properties, id } = feature;
  const tower = properties.tower_id.startsWith("T")
    ? `T-${properties.tower_id.slice(1)}`
    : `T-${properties.tower_id}`;
  const floor = properties.level < 0
    ? `B${Math.abs(properties.level)}`
    : properties.level === 0 ? "GF" : `F${properties.level}`;
  return [id.slice(0, 14), tower, floor, properties.unit_no, properties.type];
}

function safe(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

export default function VUlpinInspector({ feature, auditStatus, onVerify, onIsolate }: Props) {
  const [verifying, setVerifying] = useState(false);
  if (!feature) {
    return (
      <aside className="glass-panel flex h-full flex-col p-4" aria-label="Unit inspector">
        <div className="flex items-center gap-2 border-b border-white/8 pb-3">
          <div className="icon-square"><Box size={16} /></div>
          <div><p className="eyebrow">Property inspector</p><p className="text-xs text-slate-400">No unit selected</p></div>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center px-3 text-center">
          <div className="selection-crosshair mb-4"><span /></div>
          <p className="text-sm font-medium text-slate-200">Select a 3D unit</p>
          <p className="mt-1 max-w-[220px] text-xs leading-5 text-slate-500">Click a footprint in the scene to inspect its vertical parcel record.</p>
        </div>
        <div className="rounded border border-white/8 bg-white/[0.025] p-3">
          <p className="eyebrow">Registry connection</p>
          <p className="mt-1 text-xs text-slate-400">Demo ledger · read-only ownership labels</p>
        </div>
      </aside>
    );
  }

  const { properties } = feature;
  const formattedId = identifierSegments(feature);
  const handleVerify = async () => {
    setVerifying(true);
    try { await onVerify(); } finally { setVerifying(false); }
  };
  const exportCertificate = () => {
    const printable = window.open("", "_blank", "width=800,height=900");
    if (!printable) return;
    printable.document.write(`<!doctype html><html><head><title>V-ULPIN land certificate</title><style>body{font:14px system-ui;color:#17242a;padding:48px}h1{font-size:25px}table{width:100%;border-collapse:collapse;margin:26px 0}td{padding:12px;border-bottom:1px solid #d5dde0}.label{color:#5b6a70;width:38%}.stamp{margin-top:44px;border:1px solid #94a3a8;padding:15px;color:#56636a}</style></head><body><h1>Vertical Property Record</h1><p>V-ULPIN pilot · Pune Ward 8 · simulated data</p><table><tr><td class="label">V-ULPIN</td><td>${safe(properties.v_ulpin)}</td></tr><tr><td class="label">Level / Unit</td><td>${safe(formatFloor(properties.level))} / ${safe(properties.unit_no)}</td></tr><tr><td class="label">Property type</td><td>${safe(properties.type)}</td></tr><tr><td class="label">Carpet area (model)</td><td>${properties.area_sqm.toFixed(2)} sq.m</td></tr><tr><td class="label">Model volume</td><td>${properties.volume_m3.toFixed(2)} m³</td></tr><tr><td class="label">Record status</td><td>${safe(properties.status)}</td></tr></table><div class="stamp">Prototype certificate preview. Not a title instrument or government-issued land certificate.</div><script>window.print()</script></body></html>`);
    printable.document.close();
  };

  return (
    <aside className="glass-panel flex h-full flex-col p-4" aria-label="Unit inspector">
      <div className="flex items-center justify-between border-b border-white/8 pb-3">
        <div className="flex items-center gap-2">
          <div className="icon-square"><Box size={16} /></div>
          <div><p className="eyebrow">Property inspector</p><p className="text-xs text-slate-400">Selected unit</p></div>
        </div>
        <button className="icon-button" title="Isolate unit in 3D" aria-label="Isolate unit in 3D" onClick={onIsolate}>
          <SquareArrowOutUpRight size={15} />
        </button>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-2">
          <span className={`type-pill type-${properties.type.toLowerCase()}`}>{properties.type}</span>
          <span className="status-led"><i /> {properties.status}</span>
        </div>
        <div className="vul-pin-tag mt-3" title={properties.v_ulpin} aria-label={`V-ULPIN ${formattedId.join(" - ")}`}>
          {formattedId.map((part, index) => <span key={`${part}-${index}`}>[{part}]</span>)}
        </div>
        <p className="mt-1 text-xs text-slate-500">Base ULPIN + tower + level + unit + type</p>
      </div>

      <div className="metric-grid mt-5">
        <Metric label="Vertical level" value={formatFloor(properties.level)} />
        <Metric label="Unit number" value={properties.unit_no} />
        <Metric label="Carpet area · model" value={`${properties.area_sqm.toFixed(2)} m²`} />
        <Metric label="Enclosed volume" value={`${properties.volume_m3.toFixed(2)} m³`} />
      </div>

      <div className="mt-4 space-y-2 rounded border border-white/8 bg-black/20 p-3">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-slate-500">Ownership ledger</span>
          <span className="max-w-[150px] truncate text-slate-200" title={properties.owner_name}>{properties.owner_name}</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-slate-500">RERA project check</span>
          <span className={properties.rera_compliant ? "compliance-good" : "compliance-pending"}>
            {properties.rera_compliant ? <><BadgeCheck size={13} /> Linked</> : <><ShieldAlert size={13} /> Review</>}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-slate-500">Geometry provenance</span>
          <span className="text-slate-300">{properties.source_status}</span>
        </div>
      </div>

      {auditStatus && (
        <div className={`mt-3 flex items-center gap-2 rounded border px-3 py-2 text-xs ${auditStatus === "pass" ? "audit-pass" : "audit-fail"}`}>
          {auditStatus === "pass" ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
          Topology audit: {auditStatus.toUpperCase()}
        </div>
      )}

      <div className="mt-auto grid grid-cols-2 gap-2 pt-5">
        <button className="button-secondary col-span-2" onClick={handleVerify} disabled={verifying}>
          <ScanSearch size={15} /> {verifying ? "Scanning geometry…" : "Verify spatial topology"}
        </button>
        <button className="button-secondary" onClick={exportCertificate}>
          <FileDown size={15} /> Land certificate
        </button>
        <button className="button-primary" onClick={onIsolate}>
          <SquareArrowOutUpRight size={14} /> Isolate unit
        </button>
      </div>
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric-cell"><span>{label}</span><strong>{value}</strong></div>;
}