"use client";

import dynamic from "next/dynamic";
import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, ArrowUpRight, Building2, ChevronDown,
  CircleHelp, Crosshair, Database, Focus, Menu, Plus, RotateCcw,
  ScanSearch, ShieldCheck, Waypoints,
} from "lucide-react";
import CollisionAlertModal from "@/components/CollisionAlertModal";
import LayerControls from "@/components/LayerControls";
import UnitCreationModal, { type BuildingOption } from "@/components/UnitCreationModal";
import VUlpinInspector from "@/components/VUlpinInspector";
import type { CameraPreset, ViewerClash } from "@/components/CesiumViewer";
import type { UnitFeature, UnitType } from "@/lib/demo-data";

const CesiumViewer = dynamic(() => import("@/components/CesiumViewer"), {
  ssr: false,
  loading: () => <div className="viewer-loading"><div className="loading-radar" /><span>Synchronizing geospatial scene</span></div>,
});

const BUILDINGS: BuildingOption[] = [
  { building_id: "tower-a", name: "Aundh Heights / Tower A", tower_id: "TA", base_ulpin: "12345678901234", longitude: 73.8078, latitude: 18.5605, floors_above_ground: 10, floors_below_ground: 2 },
  { building_id: "tower-b", name: "Aundh Heights / Tower B", tower_id: "TB", base_ulpin: "12345678901235", longitude: 73.8087, latitude: 18.5608, floors_above_ground: 6, floors_below_ground: 1 },
];

type AuditResult = { status: "pass" | "warning" | "fail"; clash_count: number; violations: ViewerClash[] };
const API_ROOT = process.env.NEXT_PUBLIC_VULPIN_API_URL ?? "";

async function fetchBuildingData(id: string) {
  const [featureResponse, metadataResponse] = await Promise.all([
    fetch(`${API_ROOT}/api/buildings/${id}/geojson-3d`, { cache: "no-store" }),
    fetch(`${API_ROOT}/api/buildings/${id}/tileset-metadata`, { cache: "no-store" }),
  ]);
  if (!featureResponse.ok || !metadataResponse.ok) throw new Error("Pilot building data could not be loaded.");
  const collection = await featureResponse.json() as { features: UnitFeature[] };
  const metadata = await metadataResponse.json() as { levels: number[] };
  return { features: collection.features, levels: metadata.levels };
}

export default function Home() {
  const [buildingId, setBuildingId] = useState("tower-a");
  const [features, setFeatures] = useState<UnitFeature[]>([]);
  const [levels, setLevels] = useState<number[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isolatedId, setIsolatedId] = useState<string | null>(null);
  const [visibleTypes, setVisibleTypes] = useState<UnitType[]>(["RES", "COM", "PRK", "UTL"]);
  const [floorFilter, setFloorFilter] = useState<number | "all">("all");
  const [explodeFactor, setExplodeFactor] = useState(1);
  const [underground, setUnderground] = useState(false);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>("aerial");
  const [showClashes, setShowClashes] = useState(true);
  const [clashes, setClashes] = useState<ViewerClash[]>([]);
  const [auditStatus, setAuditStatus] = useState<AuditResult["status"] | null>(null);
  const [auditBusy, setAuditBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState("");
  const [showCollisionModal, setShowCollisionModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);

  const activeBuilding = BUILDINGS.find((building) => building.building_id === buildingId) ?? BUILDINGS[0];
  const selectedFeature = features.find((feature) => feature.id === selectedId) ?? null;
  const visibleClashes = showClashes ? clashes : [];
  const unitCounts = useMemo(() => features.reduce<Record<UnitType, number>>((counts, feature) => {
    counts[feature.properties.type] += 1;
    return counts;
  }, { RES: 0, COM: 0, PRK: 0, UTL: 0 }), [features]);

  const loadBuilding = useCallback(async (id: string) => {
    try {
      const data = await fetchBuildingData(id);
      startTransition(() => {
        setFeatures(data.features);
        setLevels(data.levels);
        setSelectedId(null);
        setIsolatedId(null);
        setClashes([]);
        setAuditStatus(null);
      });
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "API unavailable");
      setFeatures([]);
      setLevels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetchBuildingData(buildingId)
      .then((data) => {
        if (!active) return;
        startTransition(() => {
          setFeatures(data.features);
          setLevels(data.levels);
          setSelectedId(null);
          setIsolatedId(null);
          setClashes([]);
          setAuditStatus(null);
        });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setApiError(error instanceof Error ? error.message : "API unavailable");
        setFeatures([]);
        setLevels([]);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [buildingId]);

  const runAudit = useCallback(async () => {
    setAuditBusy(true);
    try {
      const response = await fetch(`${API_ROOT}/api/topology/audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ building_id: buildingId }),
      });
      if (!response.ok) throw new Error("Building topology audit failed.");
      const result = await response.json() as AuditResult;
      setClashes(result.violations ?? []);
      setAuditStatus(result.status);
      setShowClashes(true);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Topology audit unavailable");
    } finally {
      setAuditBusy(false);
    }
  }, [buildingId]);

  const handleUnitCreated = (feature: UnitFeature) => {
    setFeatures((current) => [...current, feature]);
    setSelectedId(feature.id);
    setFloorFilter("all");
    setAuditStatus("pass");
  };

  const dateLabel = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date());

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><Waypoints size={19} strokeWidth={1.8} /></div>
          <div><div className="brand-title">V<span>·</span>ULPIN</div><div className="brand-subtitle">VERTICAL PROPERTY INTELLIGENCE</div></div>
        </div>
        <div className="topbar-context">
          <span className="context-square"><Building2 size={14} /></span>
          <span>MAHARASHTRA <i>/</i> PUNE <i>/</i> WARD 08</span>
          <span className="context-date">{dateLabel}</span>
        </div>
        <div className="topbar-actions">
          <span className="live-chip"><i /> DEMO LIVE</span>
          <button className="icon-button help-button" title="About the pilot" aria-label="About the pilot"><CircleHelp size={16} /></button>
          <button className="mobile-menu icon-button" title="Toggle layer controls" aria-label="Toggle layer controls" onClick={() => setMobileControlsOpen((open) => !open)}><Menu size={17} /></button>
        </div>
      </header>

      <div className="workspace-heading">
        <div><p className="eyebrow">3D cadastral operations <span className="heading-line" /></p><h1>Vertical property map</h1></div>
        <div className="heading-actions">
          <label className="building-select-wrap">
            <span className="eyebrow">Pilot structure</span>
            <span className="building-select-icon"><Building2 size={14} /></span>
            <select value={buildingId} onChange={(event) => { setLoading(true); setApiError(""); setBuildingId(event.target.value); }} aria-label="Choose pilot tower">
              {BUILDINGS.map((building) => <option key={building.building_id} value={building.building_id}>{building.name}</option>)}
            </select>
            <ChevronDown size={14} className="building-chevron" />
          </label>
          <button className="button-secondary audit-trigger" onClick={() => void runAudit()} disabled={auditBusy || loading}>
            {auditBusy ? <Activity size={15} className="animate-pulse" /> : <ScanSearch size={15} />}<span>{auditBusy ? "Auditing" : "Run topology audit"}</span>
          </button>
          <button className="button-primary" onClick={() => setShowCreateModal(true)} disabled={loading}><Plus size={16} /><span>New unit</span></button>
        </div>
      </div>

      <section className="stat-strip" aria-label="Pilot inventory summary">
        <Summary icon={<Database size={14} />} label="Vertical units" value={String(features.length).padStart(3, "0")} tone="cyan" />
        <Summary icon={<Building2 size={14} />} label="Floors / subsurface" value={`${activeBuilding.floors_above_ground} / ${activeBuilding.floors_below_ground}`} tone="violet" />
        <Summary icon={<ShieldCheck size={14} />} label="Topology status" value={auditStatus ? auditStatus.toUpperCase() : "READY"} tone={auditStatus === "fail" ? "rose" : "green"} />
        <div className="inventory-inline"><span><i className="dot-cyan" /> {unitCounts.RES} RES</span><span><i className="dot-violet" /> {unitCounts.COM} COM</span><span><i className="dot-amber" /> {unitCounts.PRK} PRK</span><span><i className="dot-green" /> {unitCounts.UTL} UTL</span></div>
      </section>

      {apiError && <div className="api-warning" role="status"><AlertTriangle size={15} />{apiError}<button onClick={() => { setLoading(true); setApiError(""); void loadBuilding(buildingId); }}>Retry</button></div>}

      <section className={`workspace-grid ${mobileControlsOpen ? "mobile-controls-open" : ""}`}>
        <div className="layer-column"><LayerControls
          levels={levels} floor={floorFilter} onFloorChange={setFloorFilter}
          visibleTypes={visibleTypes} onVisibleTypesChange={setVisibleTypes}
          explode={explodeFactor} onExplodeChange={setExplodeFactor}
          underground={underground} onUndergroundChange={setUnderground}
          cameraPreset={cameraPreset} onCameraPresetChange={setCameraPreset}
          showClashes={showClashes} onShowClashesChange={setShowClashes}
        /></div>

        <div className="scene-column">
          <div className="scene-toolbar">
            <div className="scene-state"><span className="scene-state-dot" /><span>{loading ? "LOADING PILOT" : "SCENE SYNCHRONIZED"}</span><span className="scene-separator">·</span><span>{activeBuilding.building_id.toUpperCase()}</span></div>
            <div className="scene-tools">
              <button
                className="scene-tool-button"
                title="Rotate to opposite facade (Back / Front)"
                onClick={() => setCameraPreset((p) => p === "back" ? "front" : "back")}
              >
                <RotateCcw size={14} /> {cameraPreset === "back" ? "View Front" : "View Back"}
              </button>
              {isolatedId && <button className="scene-tool-button" onClick={() => setIsolatedId(null)} title="Show all units"><RotateCcw size={14} /> Reset</button>}
              <button className="scene-tool-button" title="Focus selected unit" onClick={() => selectedId && setIsolatedId(selectedId)}><Focus size={14} /> Isolate</button>
              <span className="scene-coordinate">18°33′38″N · 73°48′28″E</span>
            </div>
          </div>
          <div className="scene-frame">
            {loading ? <div className="viewer-loading"><div className="loading-radar" /><span>Synchronizing geospatial scene</span></div> : (
              <CesiumViewer
                features={features} selectedId={selectedId} isolatedId={isolatedId}
                visibleTypes={visibleTypes} floorFilter={floorFilter} explodeFactor={explodeFactor}
                underground={underground} cameraPreset={cameraPreset} clashes={visibleClashes}
                focus={[activeBuilding.longitude, activeBuilding.latitude]} onSelect={setSelectedId}
              />
            )}
            <div className="scene-corner scene-corner-top-left"><span>WGS 84</span><span>·</span><span>LOCAL VERTICAL DATUM</span></div>
            <div className="scene-corner scene-corner-bottom-left"><Crosshair size={13} /><span>RIGHT-CLICK DRAG TO ORBIT 360° · SELECT A UNIT TO INSPECT</span></div>
            <div className="scene-corner scene-corner-bottom-right"><span>3D</span><span className="scene-separator">/</span><span>METRIC</span></div>
            {auditBusy && <div className="scene-scan-line" />}
            <div className="north-indicator"><span>N</span><ArrowUpRight size={15} /></div>
          </div>
          <div className="scene-footer"><div><span className="footer-led" /> {features.length} SPATIAL FEATURES <span className="scene-separator">·</span> {visibleClashes.length} ACTIVE CLASHES</div><div>GEOMETRY: <span className="text-cyan-100">POLYHEDRAL SURFACE</span> <span className="scene-separator">·</span> CRS: EPSG:32643</div></div>
        </div>

        <div className="inspector-column"><VUlpinInspector
          feature={selectedFeature} auditStatus={auditStatus} onVerify={runAudit}
          onIsolate={() => selectedId && setIsolatedId(isolatedId === selectedId ? null : selectedId)}
        /></div>
      </section>

      <footer className="dashboard-footer">
        <div><span>V-ULPIN PILOT</span><span className="scene-separator">/</span> AUNDH-BOPODI <span className="scene-separator">/</span> DATASET 01</div>
        <div className="footer-disclaimer">SIMULATED CADASTRAL DATA · NOT A TITLE INSTRUMENT</div>
        <button className="footer-alert-link" onClick={() => setShowCollisionModal(true)}><AlertTriangle size={13} /> Upload clash boundary</button>
      </footer>

      {showCollisionModal && <CollisionAlertModal buildingId={buildingId} selected={selectedFeature} onClose={() => setShowCollisionModal(false)} onClashes={(next) => { setClashes(next); setShowClashes(true); setAuditStatus(next.length ? "fail" : "pass"); }} />}
      {showCreateModal && <UnitCreationModal building={activeBuilding} onClose={() => setShowCreateModal(false)} onCreated={handleUnitCreated} />}
      <div className="sr-only" aria-live="polite">{features.length} units loaded. {clashes.length} spatial clashes.</div>
    </main>
  );
}

function Summary({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  return <div className={`summary-item summary-${tone}`}><span className="summary-icon">{icon}</span><span className="summary-copy"><span>{label}</span><strong>{value}</strong></span></div>;
}
