"use client";

import { useEffect, useRef } from "react";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import type { UnitFeature, UnitType } from "@/lib/demo-data";

export type CameraPreset = "aerial" | "front" | "street" | "back" | "isometric" | "underground";

export type ViewerClash = {
  unit_v_ulpin: string;
  overlap_volume_m3: number;
  overlap_geometry: UnitFeature["geometry"];
  level: number;
  z_min_m?: number;
  z_max_m?: number;
};

type Props = {
  features: UnitFeature[];
  selectedId: string | null;
  isolatedId: string | null;
  visibleTypes: UnitType[];
  floorFilter: number | "all";
  explodeFactor: number;
  underground: boolean;
  cameraPreset: CameraPreset;
  clashes: ViewerClash[];
  focus?: [number, number];
  onSelect: (featureId: string) => void;
};

const TYPE_COLORS: Record<UnitType, Cesium.Color> = {
  RES: Cesium.Color.fromCssColorString("#06b6d4"),
  COM: Cesium.Color.fromCssColorString("#a78bfa"),
  PRK: Cesium.Color.fromCssColorString("#f59e0b"),
  UTL: Cesium.Color.fromCssColorString("#34d399"),
};

export default function CesiumViewer({
  features,
  selectedId,
  isolatedId,
  visibleTypes,
  floorFilter,
  explodeFactor,
  underground,
  cameraPreset,
  clashes,
  focus = [73.8078, 18.5605],
  onSelect,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const selectRef = useRef(onSelect);
  const focusLongitude = focus[0];
  const focusLatitude = focus[1];

  useEffect(() => {
    selectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!hostRef.current) return;
    (window as Window & { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = "/cesium/";
    const viewer = new Cesium.Viewer(hostRef.current, {
      animation: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
      terrainProvider: new Cesium.EllipsoidTerrainProvider(),
      baseLayer: false,
      requestRenderMode: true,
      maximumRenderTimeChange: Infinity,
    });
    viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      maximumLevel: 19,
      credit: "© OpenStreetMap contributors",
    }));
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#071116");
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#172327");
    viewer.scene.globe.enableLighting = true;
    viewer.scene.fog.enabled = true;
    viewer.scene.fog.density = 0.00008;
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 5;
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = 500_000;
    viewer.scene.screenSpaceCameraController.enableCollisionDetection = false;
    viewer.scene.screenSpaceCameraController.tiltEventTypes = [
      Cesium.CameraEventType.MIDDLE_DRAG,
      Cesium.CameraEventType.RIGHT_DRAG,
      Cesium.CameraEventType.PINCH,
      { eventType: Cesium.CameraEventType.LEFT_DRAG, modifier: Cesium.KeyboardEventModifier.CTRL },
      { eventType: Cesium.CameraEventType.LEFT_DRAG, modifier: Cesium.KeyboardEventModifier.SHIFT },
    ];
    viewer.scene.screenSpaceCameraController.rotateEventTypes = [
      Cesium.CameraEventType.LEFT_DRAG,
      Cesium.CameraEventType.MIDDLE_DRAG,
      Cesium.CameraEventType.RIGHT_DRAG,
    ];
    viewer.scene.screenSpaceCameraController.zoomEventTypes = [
      Cesium.CameraEventType.WHEEL,
      Cesium.CameraEventType.PINCH,
    ];

    const clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    clickHandler.setInputAction((movement: { position: Cesium.Cartesian2 }) => {
      const picked = viewer.scene.pick(movement.position);
      const entity = picked?.id as Cesium.Entity | undefined;
      const idProperty = entity?.properties?.v_ulpin;
      const pickedId = idProperty?.getValue(Cesium.JulianDate.now());
      if (typeof pickedId === "string") selectRef.current(pickedId);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    viewerRef.current = viewer;
    return () => {
      clickHandler.destroy();
      viewer.destroy();
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    // Batch entity mutations to avoid firing hundreds of individual scene graph update events
    viewer.entities.suspendEvents();
    viewer.entities.removeAll();

    const unitDistanceCondition = new Cesium.DistanceDisplayCondition(0.0, 4500.0);
    // Ground elevation datum (560m MSL in Pune). Cesium's EllipsoidTerrainProvider renders ground at 0m.
    // Subtracting ground datum anchors the ground floor directly onto the street level.
    const GROUND_DATUM = 560.0;

    for (const feature of features) {
      const properties = feature.properties;
      if (!visibleTypes.includes(properties.type)) continue;
      if (floorFilter !== "all" && properties.level !== floorFilter) continue;
      if (isolatedId && isolatedId !== feature.id) continue;

      const ring = feature.geometry.coordinates[0];
      const hierarchy = Cesium.Cartesian3.fromDegreesArray(ring.slice(0, -1).flat());
      const levelOffset = properties.level * 3.25 * (explodeFactor - 1);
      const isSelected = selectedId === feature.id;
      const color = isSelected ? Cesium.Color.fromCssColorString("#f8d477") : TYPE_COLORS[properties.type];
      const alpha = isSelected ? 0.86 : selectedId ? 0.09 : 0.34;

      const baseHeight = properties.z_min_m >= 300 ? (properties.z_min_m - GROUND_DATUM) : properties.z_min_m;
      const topHeight = properties.z_max_m >= 300 ? (properties.z_max_m - GROUND_DATUM) : properties.z_max_m;

      viewer.entities.add({
        id: feature.id,
        properties: {
          v_ulpin: feature.id,
          level: properties.level,
          type: properties.type,
          unit_no: properties.unit_no,
        },
        polygon: {
          hierarchy,
          height: baseHeight + levelOffset,
          extrudedHeight: topHeight + levelOffset,
          closeBottom: true,
          closeTop: true,
          perPositionHeight: false,
          material: color.withAlpha(alpha),
          outline: true,
          outlineColor: isSelected ? Cesium.Color.fromCssColorString("#fff1b8") : color.withAlpha(0.8),
          outlineWidth: isSelected ? 2 : 1,
          distanceDisplayCondition: unitDistanceCondition,
        },
      });
    }

    const pulseStart = Cesium.JulianDate.now();
    const clashMaterial = new Cesium.ColorMaterialProperty(new Cesium.CallbackProperty((time) => {
      const elapsed = Cesium.JulianDate.secondsDifference(time ?? Cesium.JulianDate.now(), pulseStart);
      const alpha = 0.42 + 0.34 * (0.5 + 0.5 * Math.sin(elapsed * 5));
      return Cesium.Color.fromCssColorString("#fb7185").withAlpha(alpha);
    }, false));

    for (const [index, clash] of clashes.entries()) {
      const ring = clash.overlap_geometry.coordinates[0];
      const hierarchy = Cesium.Cartesian3.fromDegreesArray(ring.slice(0, -1).flat());
      const matchingUnit = features.find((feature) => feature.id === clash.unit_v_ulpin);
      const rawBottom = clash.z_min_m ?? matchingUnit?.properties.z_min_m ?? 560;
      const rawTop = clash.z_max_m ?? matchingUnit?.properties.z_max_m ?? rawBottom + 2.8;
      const bottom = rawBottom >= 300 ? (rawBottom - GROUND_DATUM) : rawBottom;
      const top = rawTop >= 300 ? (rawTop - GROUND_DATUM) : rawTop;

      viewer.entities.add({
        id: `clash-${index}-${clash.unit_v_ulpin}`,
        polygon: {
          hierarchy,
          height: bottom,
          extrudedHeight: top,
          material: clashMaterial,
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString("#fecdd3"),
        },
      });
    }

    viewer.entities.resumeEvents();
    viewer.scene.requestRender();

    const pulseTimer = clashes.length
      ? window.setInterval(() => {
          if (viewerRef.current && !viewerRef.current.isDestroyed()) {
            viewerRef.current.scene.requestRender();
          }
        }, 180)
      : undefined;
    return () => {
      if (pulseTimer !== undefined) window.clearInterval(pulseTimer);
    };
  }, [features, selectedId, isolatedId, visibleTypes, floorFilter, explodeFactor, clashes]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    // Remove the artificial bounding rectangle cutout to eliminate the sharp dark box border
    if (underground) {
      viewer.scene.globe.translucency.enabled = true;
      viewer.scene.globe.translucency.frontFaceAlpha = 0.45;
      viewer.scene.globe.translucency.backFaceAlpha = 0.2;
    } else {
      viewer.scene.globe.translucency.enabled = false;
      viewer.scene.globe.translucency.frontFaceAlpha = 1.0;
      viewer.scene.globe.translucency.backFaceAlpha = 1.0;
    }

    const camera = {
      aerial: {
        destination: Cesium.Cartesian3.fromDegrees(focusLongitude, focusLatitude, 180),
        orientation: { heading: 0, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0 },
      },
      front: {
        destination: Cesium.Cartesian3.fromDegrees(focusLongitude, focusLatitude - 0.00075, 25),
        orientation: { heading: 0, pitch: -0.15, roll: 0 },
      },
      street: {
        destination: Cesium.Cartesian3.fromDegrees(focusLongitude, focusLatitude - 0.00075, 25),
        orientation: { heading: 0, pitch: -0.15, roll: 0 },
      },
      back: {
        destination: Cesium.Cartesian3.fromDegrees(focusLongitude, focusLatitude + 0.00075, 25),
        orientation: { heading: Cesium.Math.toRadians(180), pitch: -0.15, roll: 0 },
      },
      isometric: {
        destination: Cesium.Cartesian3.fromDegrees(focusLongitude + 0.00075, focusLatitude - 0.00075, 45),
        orientation: { heading: Cesium.Math.toRadians(315), pitch: -0.32, roll: 0 },
      },
      underground: {
        destination: Cesium.Cartesian3.fromDegrees(focusLongitude, focusLatitude - 0.00045, 8),
        orientation: { heading: 0, pitch: -0.65, roll: 0 },
      },
    }[cameraPreset];

    viewer.camera.flyTo({
      destination: camera.destination,
      orientation: camera.orientation,
      duration: 1.2,
    });
  }, [underground, cameraPreset, focusLongitude, focusLatitude]);

  return <div ref={hostRef} className="cesium-host" aria-label="Interactive 3D cadastral viewer" />;
}