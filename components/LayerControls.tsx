"use client";

import { Layers3, ScanLine, SlidersHorizontal } from "lucide-react";
import type { CameraPreset } from "@/components/CesiumViewer";
import type { UnitType } from "@/lib/demo-data";

type Props = {
  levels: number[];
  floor: number | "all";
  onFloorChange: (floor: number | "all") => void;
  visibleTypes: UnitType[];
  onVisibleTypesChange: (types: UnitType[]) => void;
  explode: number;
  onExplodeChange: (factor: number) => void;
  underground: boolean;
  onUndergroundChange: (enabled: boolean) => void;
  cameraPreset: CameraPreset;
  onCameraPresetChange: (preset: CameraPreset) => void;
  showClashes: boolean;
  onShowClashesChange: (enabled: boolean) => void;
};

const typeItems: Array<{ type: UnitType; label: string; color: string }> = [
  { type: "RES", label: "Residential", color: "#06b6d4" },
  { type: "COM", label: "Commercial", color: "#a78bfa" },
  { type: "PRK", label: "Parking", color: "#f59e0b" },
  { type: "UTL", label: "Utilities", color: "#34d399" },
];

function floorLabel(level: number) {
  if (level === 0) return "Ground floor";
  return level < 0 ? `Basement ${level}` : `Floor ${level}`;
}

export default function LayerControls(props: Props) {
  const toggleType = (type: UnitType) => {
    props.onVisibleTypesChange(
      props.visibleTypes.includes(type)
        ? props.visibleTypes.filter((item) => item !== type)
        : [...props.visibleTypes, type],
    );
  };

  return (
    <aside className="glass-panel flex h-full flex-col gap-5 p-4" aria-label="3D layer controls">
      <div className="flex items-center gap-2 border-b border-white/8 pb-3">
        <div className="icon-square"><Layers3 size={16} /></div>
        <div>
          <p className="eyebrow">Scene layers</p>
          <p className="text-xs text-slate-400">Vertical unit inventory</p>
        </div>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-label">Property type</h2>
          <span className="eyebrow text-cyan-300">{props.visibleTypes.length} / 4</span>
        </div>
        <div className="space-y-2">
          {typeItems.map((item) => (
            <label key={item.type} className="layer-row">
              <span className="flex items-center gap-2.5">
                <span className="layer-swatch" style={{ backgroundColor: item.color }} />
                <span>{item.label}</span>
              </span>
              <input
                type="checkbox"
                checked={props.visibleTypes.includes(item.type)}
                onChange={() => toggleType(item.type)}
                aria-label={`Show ${item.label}`}
              />
            </label>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center gap-2">
          <ScanLine size={14} className="text-cyan-300" />
          <h2 className="section-label">Vertical section</h2>
        </div>
        <select
          value={props.floor === "all" ? "all" : String(props.floor)}
          onChange={(event) => props.onFloorChange(event.target.value === "all" ? "all" : Number(event.target.value))}
          className="hud-select"
          aria-label="Filter floor"
        >
          <option value="all">All levels</option>
          {props.levels.map((level) => <option key={level} value={level}>{floorLabel(level)}</option>)}
        </select>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={14} className="text-cyan-300" />
            <h2 className="section-label">Exploded view</h2>
          </div>
          <span className="mono text-[11px] text-cyan-200">{props.explode.toFixed(1)}×</span>
        </div>
        <input
          className="hud-range"
          type="range"
          min="1"
          max="3"
          step="0.1"
          value={props.explode}
          onChange={(event) => props.onExplodeChange(Number(event.target.value))}
          aria-label="Explode building floors"
        />
        <div className="mt-1 flex justify-between text-[10px] text-slate-500"><span>Stacked</span><span>Exploded</span></div>
      </section>

      <section className="space-y-2 border-t border-white/8 pt-4">
        <label className="layer-row">
          <span>Sub-surface view</span>
          <input type="checkbox" checked={props.underground} onChange={(event) => props.onUndergroundChange(event.target.checked)} />
        </label>
        <label className="layer-row">
          <span>Clash overlay</span>
          <input type="checkbox" checked={props.showClashes} onChange={(event) => props.onShowClashesChange(event.target.checked)} />
        </label>
      </section>

      <section className="mt-auto">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="section-label">Camera Angle</h2>
          <span className="eyebrow text-cyan-400">Right-drag: 360° orbit</span>
        </div>
        <div className="grid grid-cols-3 gap-1 rounded border border-white/10 bg-black/25 p-1 mb-1.5">
          {([
            ["front", "Front"],
            ["back", "Back (Rear)"],
            ["isometric", "3D Iso"],
          ] as const).map(([preset, label]) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                props.onCameraPresetChange(preset);
              }}
              className={`camera-preset ${props.cameraPreset === preset ? "camera-preset-active" : ""}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-1 rounded border border-white/10 bg-black/25 p-1">
          {([
            ["aerial", "Aerial"],
            ["street", "Street"],
            ["underground", "Below"],
          ] as const).map(([preset, label]) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                props.onCameraPresetChange(preset);
                if (preset === "underground") props.onUndergroundChange(true);
              }}
              className={`camera-preset ${props.cameraPreset === preset ? "camera-preset-active" : ""}`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
}