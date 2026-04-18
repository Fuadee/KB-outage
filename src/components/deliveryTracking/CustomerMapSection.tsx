"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { EditableTarget } from "./types";
import { buildCustomerPoints, getGoogleMapsDirectionLink, type CustomerPoint } from "./customerMapHelpers";
import { markerStatusStyles } from "./markerStatusStyles";

type LeafletMap = {
  remove: () => void;
  fitBounds: (bounds: [[number, number], [number, number]], options?: { padding?: [number, number]; maxZoom?: number }) => void;
  setView: (center: [number, number], zoom: number, options?: { animate?: boolean }) => void;
  invalidateSize: (options?: { animate?: boolean; pan?: boolean }) => void;
  on: (event: string, cb: () => void) => void;
};

type LeafletTileErrorEvent = {
  tile: HTMLImageElement;
  coords?: { x: number; y: number; z: number };
};

type LeafletTileLoadEvent = {
  tile: HTMLImageElement;
  coords?: { x: number; y: number; z: number };
};

type LeafletTileLayer = {
  addTo: (map: LeafletMap) => LeafletTileLayer;
  remove: () => void;
  on: (event: "tileloadstart" | "tileload" | "tileerror", cb: (event: LeafletTileErrorEvent | LeafletTileLoadEvent) => void) => LeafletTileLayer;
  off: (event: "tileloadstart" | "tileload" | "tileerror", cb: (event: LeafletTileErrorEvent | LeafletTileLoadEvent) => void) => LeafletTileLayer;
};

type LeafletMarker = {
  addTo: (map: LeafletMap) => LeafletMarker;
  bindPopup: (content: string) => LeafletMarker;
  openPopup: () => LeafletMarker;
  on: (event: string, cb: () => void) => LeafletMarker;
  remove: () => void;
};

type LeafletNamespace = {
  map: (element: HTMLElement, options: { zoomControl: boolean }) => LeafletMap;
  tileLayer: (url: string, options: { attribution: string; maxZoom?: number }) => LeafletTileLayer;
  divIcon: (options: { html: string; className: string; iconAnchor: [number, number] }) => unknown;
  marker: (latLng: [number, number], options: { icon: unknown }) => LeafletMarker;
  latLngBounds: (points: [number, number][]) => { isValid: () => boolean; getSouthWest: () => { lat: number; lng: number }; getNorthEast: () => { lat: number; lng: number } };
};

declare global {
  interface Window {
    L?: LeafletNamespace;
  }
}

type CustomerMapSectionProps = {
  items: EditableTarget[];
  selectedTempId: string | null;
  onMarkerSelect: (tempId: string) => void;
};

type ProviderKey = "osm" | "carto";

type ProviderConfig = {
  key: ProviderKey;
  label: string;
  url: string;
  attribution: string;
};

type RuntimeLog = {
  id: number;
  message: string;
  detail?: Record<string, unknown>;
};

const LEAFLET_SCRIPT_ID = "leaflet-js-cdn";
const TILE_PROVIDERS: ProviderConfig[] = [
  {
    key: "osm",
    label: "OpenStreetMap",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "&copy; OpenStreetMap contributors"
  },
  {
    key: "carto",
    label: "CARTO Light",
    url: "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO"
  }
];

const formatThaiDateTime = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
};

const markerHtml = (color: string, isSelected: boolean) => `
  <div style="
    width: 18px;
    height: 18px;
    border-radius: 9999px;
    background: ${color};
    border: 2px solid rgba(255,255,255,0.95);
    box-shadow: 0 0 0 ${isSelected ? "5px" : "2px"} ${isSelected ? "rgba(56,189,248,.35)" : "rgba(15,23,42,.55)"};
  "></div>
`;

const buildPopupContent = (point: CustomerPoint) => {
  const statusLabel = markerStatusStyles[point.status].label;
  const proof = point.proofImageUrl
    ? `<img src="${point.proofImageUrl}" alt="รูปหลักฐาน ${point.companyName}" style="margin-top:8px;width:100%;max-width:200px;max-height:140px;object-fit:cover;border-radius:8px;border:1px solid rgba(148,163,184,.35)" />`
    : "<p style='margin:8px 0 0;color:#94a3b8;font-size:12px'>ไม่มีรูปหลักฐาน</p>";

  return `
    <div style="min-width:220px;color:#d1d5db;font-family:ui-sans-serif,system-ui,sans-serif">
      <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#fff">${point.companyName}</p>
      <p style="margin:0;font-size:12px">สถานะ: <span style="color:${markerStatusStyles[point.status].color};font-weight:600">${statusLabel}</span></p>
      <p style="margin:4px 0 0;font-size:12px">เวลาแจ้ง: ${formatThaiDateTime(point.deliveredAt)}</p>
      ${proof}
      <a href="${getGoogleMapsDirectionLink(point.latitude, point.longitude)}" target="_blank" rel="noreferrer" style="display:inline-block;margin-top:10px;padding:6px 10px;border-radius:8px;background:#1d4ed8;color:white;font-size:12px;text-decoration:none;font-weight:600">เปิด Google Maps</a>
    </div>
  `;
};

const ensureLeafletScript = () => {
  if (typeof document === "undefined") return;
  if (!document.getElementById(LEAFLET_SCRIPT_ID)) {
    const script = document.createElement("script");
    script.id = LEAFLET_SCRIPT_ID;
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    document.body.appendChild(script);
  }
};

const createDomReport = (container: HTMLDivElement) => {
  const mapPane = container.querySelector(".leaflet-map-pane");
  const tilePane = container.querySelector(".leaflet-tile-pane");
  const overlayPane = container.querySelector(".leaflet-overlay-pane");
  const markerPane = container.querySelector(".leaflet-marker-pane");
  const tileImages = tilePane?.querySelectorAll("img").length ?? 0;
  const rect = container.getBoundingClientRect();
  const topElement = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);

  return {
    panes: {
      mapPane: Boolean(mapPane),
      tilePane: Boolean(tilePane),
      overlayPane: Boolean(overlayPane),
      markerPane: Boolean(markerPane)
    },
    tileImages,
    tilePaneStyle: tilePane instanceof HTMLElement
      ? {
          opacity: getComputedStyle(tilePane).opacity,
          visibility: getComputedStyle(tilePane).visibility,
          zIndex: getComputedStyle(tilePane).zIndex,
          transform: getComputedStyle(tilePane).transform
        }
      : null,
    topElementTag: topElement?.tagName ?? null,
    topElementClass: topElement?.className ?? null
  };
};

function MinimalLeafletProbeMap({ provider }: { provider: ProviderConfig }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    ensureLeafletScript();
    let timer = 0;
    let map: LeafletMap | null = null;
    let layer: LeafletTileLayer | null = null;

    const init = () => {
      if (!window.L || !containerRef.current || map) return;
      map = window.L.map(containerRef.current, { zoomControl: true });
      layer = window.L.tileLayer(provider.url, {
        attribution: provider.attribution,
        maxZoom: 19
      }).addTo(map);
      map.setView([8.0863, 98.9063], 11, { animate: false });
      map.invalidateSize({ animate: false, pan: false });
      layer.on("tileerror", (event) => {
        const e = event as LeafletTileErrorEvent;
        console.error("[minimal-map] tileerror", {
          src: e.tile?.currentSrc || e.tile?.src,
          coords: e.coords
        });
      });
      layer.on("tileload", (event) => {
        const e = event as LeafletTileLoadEvent;
        console.info("[minimal-map] tileload", {
          src: e.tile?.currentSrc || e.tile?.src,
          coords: e.coords
        });
      });
    };

    if (window.L) {
      init();
    } else {
      timer = window.setInterval(init, 100);
    }

    return () => {
      if (timer) window.clearInterval(timer);
      layer?.remove();
      map?.remove();
    };
  }, [provider]);

  return (
    <div className="mt-4 rounded-xl border border-slate-600/70 bg-[#0B1220] p-3">
      <p className="mb-2 text-xs text-slate-300">Minimal isolated map (MapContainer + TileLayer equivalent)</p>
      <div ref={containerRef} className="h-[360px] w-full overflow-hidden rounded-lg border border-slate-700" />
    </div>
  );
}

export default function CustomerMapSection({ items, selectedTempId, onMarkerSelect }: CustomerMapSectionProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const tileLayerRef = useRef<LeafletTileLayer | null>(null);
  const markersRef = useRef<Record<string, LeafletMarker>>({});
  const loadedRef = useRef(false);
  const [providerKey, setProviderKey] = useState<ProviderKey>("osm");
  const [runtimeLogs, setRuntimeLogs] = useState<RuntimeLog[]>([]);

  const provider = useMemo(() => TILE_PROVIDERS.find((item) => item.key === providerKey) ?? TILE_PROVIDERS[0], [providerKey]);
  const { points, missingCoordinateCount } = useMemo(() => buildCustomerPoints(items), [items]);

  const appendRuntimeLog = (message: string, detail?: Record<string, unknown>) => {
    setRuntimeLogs((prev) => [{ id: Date.now() + Math.random(), message, detail }, ...prev].slice(0, 12));
  };

  useEffect(() => {
    ensureLeafletScript();

    let timer = 0;

    const onTileLoadStart = (event: LeafletTileErrorEvent | LeafletTileLoadEvent) => {
      const e = event as LeafletTileLoadEvent;
      const src = e.tile?.currentSrc || e.tile?.src;
      console.info("[customer-map] tileloadstart", { src, coords: e.coords, provider: provider.key });
    };

    const onTileLoad = (event: LeafletTileErrorEvent | LeafletTileLoadEvent) => {
      const e = event as LeafletTileLoadEvent;
      const src = e.tile?.currentSrc || e.tile?.src;
      console.info("[customer-map] tileload", { src, coords: e.coords, provider: provider.key });
    };

    const onTileError = (event: LeafletTileErrorEvent | LeafletTileLoadEvent) => {
      const e = event as LeafletTileErrorEvent;
      const src = e.tile?.currentSrc || e.tile?.src;
      console.error("[customer-map] tileerror", { src, coords: e.coords, provider: provider.key });
      appendRuntimeLog("tileerror", {
        src,
        coords: e.coords,
        provider: provider.key
      });
    };

    const mountTileLayer = (map: LeafletMap) => {
      tileLayerRef.current?.off("tileloadstart", onTileLoadStart);
      tileLayerRef.current?.off("tileload", onTileLoad);
      tileLayerRef.current?.off("tileerror", onTileError);
      tileLayerRef.current?.remove();

      const layer = window.L!.tileLayer(provider.url, {
        attribution: provider.attribution,
        maxZoom: 19
      }).addTo(map);
      layer.on("tileloadstart", onTileLoadStart);
      layer.on("tileload", onTileLoad);
      layer.on("tileerror", onTileError);
      tileLayerRef.current = layer;

      appendRuntimeLog("tile layer switched", {
        provider: provider.key,
        url: provider.url
      });
    };

    const initMap = () => {
      if (!window.L || !mapContainerRef.current) return;

      if (!loadedRef.current) {
        loadedRef.current = true;
        mapRef.current = window.L.map(mapContainerRef.current, { zoomControl: true });
        mapRef.current.on("load", () => {
          appendRuntimeLog("map mounted");
        });
      }

      const map = mapRef.current;
      if (!map) return;

      mountTileLayer(map);

      window.requestAnimationFrame(() => {
        map.invalidateSize({ animate: false, pan: false });
        if (!mapContainerRef.current) return;
        const domReport = createDomReport(mapContainerRef.current);
        appendRuntimeLog("leaflet DOM report", domReport as unknown as Record<string, unknown>);
        console.info("[customer-map] leaflet DOM report", domReport);
      });
    };

    if (window.L) {
      initMap();
    } else {
      timer = window.setInterval(initMap, 100);
    }

    return () => {
      if (timer) window.clearInterval(timer);
      tileLayerRef.current?.off("tileloadstart", onTileLoadStart);
      tileLayerRef.current?.off("tileload", onTileLoad);
      tileLayerRef.current?.off("tileerror", onTileError);
      tileLayerRef.current?.remove();
      tileLayerRef.current = null;
    };
  }, [provider]);

  useEffect(() => {
    const map = mapRef.current;
    const L = window.L;
    if (!map || !L) return;

    Object.values(markersRef.current).forEach((marker) => marker.remove());
    markersRef.current = {};

    if (points.length === 0) return;

    points.forEach((point) => {
      const marker = L.marker([point.latitude, point.longitude], {
        icon: L.divIcon({
          html: markerHtml(markerStatusStyles[point.status].color, point.tempId === selectedTempId),
          className: "bg-transparent border-0",
          iconAnchor: [9, 9]
        })
      })
        .addTo(map)
        .bindPopup(buildPopupContent(point))
        .on("click", () => onMarkerSelect(point.tempId));

      markersRef.current[point.tempId] = marker;
    });

    const bounds = L.latLngBounds(points.map((point) => [point.latitude, point.longitude] as [number, number]));
    if (!bounds.isValid()) return;

    const southWest = bounds.getSouthWest();
    const northEast = bounds.getNorthEast();

    if (points.length === 1) {
      map.setView([points[0].latitude, points[0].longitude], 15, { animate: true });
    } else {
      map.fitBounds(
        [
          [southWest.lat, southWest.lng],
          [northEast.lat, northEast.lng]
        ],
        { padding: [28, 28], maxZoom: 13 }
      );
    }

    map.invalidateSize({ animate: false, pan: false });
    appendRuntimeLog("markers rendered", { count: points.length });
  }, [points, selectedTempId, onMarkerSelect]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedTempId) return;

    const selectedPoint = points.find((point) => point.tempId === selectedTempId);
    const selectedMarker = selectedPoint ? markersRef.current[selectedTempId] : null;
    if (!selectedPoint || !selectedMarker) return;

    map.setView([selectedPoint.latitude, selectedPoint.longitude], 15, { animate: true });
    selectedMarker.openPopup();
  }, [selectedTempId, points]);

  useEffect(() => {
    return () => {
      Object.values(markersRef.current).forEach((marker) => marker.remove());
      markersRef.current = {};
      mapRef.current?.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
  }, []);

  if (items.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-700/80 bg-gradient-to-b from-[#101a2d] to-[#0d1627] p-6 text-center">
        <h2 className="text-lg font-semibold text-white">แผนที่ลูกค้าทั้งหมด</h2>
        <p className="mt-2 text-sm text-slate-300">ยังไม่มีรายการลูกค้าที่แสดงอยู่ในตอนนี้</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-700/80 bg-gradient-to-b from-[#101a2d] to-[#0d1627] p-4 shadow-[0_18px_40px_-28px_rgba(59,130,246,0.55)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-white">แผนที่ลูกค้าทั้งหมด</h2>
        <div className="text-xs text-slate-300">
          ทั้งหมด {points.length} พิกัด
          {missingCoordinateCount > 0 ? <span className="ml-2 text-amber-300">มี {missingCoordinateCount} รายการที่ยังไม่มีพิกัด</span> : null}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-300">Tile provider:</span>
        {TILE_PROVIDERS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setProviderKey(option.key)}
            className={`rounded-full border px-3 py-1 ${providerKey === option.key ? "border-sky-400 bg-sky-500/20 text-sky-200" : "border-slate-600 text-slate-300"}`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="relative h-[360px] w-full overflow-hidden rounded-xl border border-slate-600/70 bg-[#0B1220]">
        <div ref={mapContainerRef} className="h-full w-full" aria-label="แผนที่ลูกค้าทั้งหมด" />
        {points.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0B1220]/90 text-sm text-slate-400">ไม่พบพิกัดสำหรับรายการที่แสดงอยู่</div>
        ) : null}
      </div>

      <MinimalLeafletProbeMap provider={provider} />

      <div className="mt-4 rounded-xl border border-slate-700/80 bg-slate-900/70 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-300">Runtime debug logs</p>
        <ul className="space-y-2 text-[11px] text-slate-300">
          {runtimeLogs.length === 0 ? <li>ยังไม่มี log</li> : null}
          {runtimeLogs.map((log) => (
            <li key={log.id}>
              <p className="font-medium text-slate-200">{log.message}</p>
              {log.detail ? <pre className="whitespace-pre-wrap text-slate-400">{JSON.stringify(log.detail, null, 2)}</pre> : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
