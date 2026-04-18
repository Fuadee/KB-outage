"use client";

import { useEffect, useMemo, useRef } from "react";
import type { EditableTarget } from "./types";
import { buildCustomerPoints, getGoogleMapsDirectionLink, type CustomerPoint } from "./customerMapHelpers";
import { markerStatusStyles } from "./markerStatusStyles";

type LeafletMap = {
  remove: () => void;
  fitBounds: (bounds: [[number, number], [number, number]], options?: { padding?: [number, number]; maxZoom?: number }) => void;
  setView: (center: [number, number], zoom: number, options?: { animate?: boolean }) => void;
  invalidateSize: (options?: { animate?: boolean; pan?: boolean }) => void;
  on: (event: string, cb: () => void) => void;
  off: (event: string, cb: () => void) => void;
};

type LeafletTileErrorEvent = {
  tile: HTMLImageElement;
  coords?: { x: number; y: number; z: number };
};

type LeafletTileLayer = {
  addTo: (map: LeafletMap) => LeafletTileLayer;
  remove: () => void;
  on: (event: "tileload" | "tileerror", cb: (event: LeafletTileErrorEvent) => void) => LeafletTileLayer;
  off: (event: "tileload" | "tileerror", cb: (event: LeafletTileErrorEvent) => void) => LeafletTileLayer;
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

const LEAFLET_SCRIPT_ID = "leaflet-js-cdn";
const TILE_PRIMARY_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_PRIMARY_ATTRIBUTION = "&copy; OpenStreetMap contributors";
const TILE_FALLBACK_URL = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const TILE_FALLBACK_ATTRIBUTION = "&copy; OpenStreetMap contributors &copy; CARTO";

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

export default function CustomerMapSection({ items, selectedTempId, onMarkerSelect }: CustomerMapSectionProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const tileLayerRef = useRef<LeafletTileLayer | null>(null);
  const isFallbackLayerRef = useRef(false);
  const markersRef = useRef<Record<string, LeafletMarker>>({});
  const loadedRef = useRef(false);

  const { points, missingCoordinateCount } = useMemo(() => buildCustomerPoints(items), [items]);

  useEffect(() => {
    ensureLeafletScript();

    let timer = 0;
    let mapResizeTimer = 0;
    let switchedToFallback = false;
    let tileErrorCount = 0;

    const onTileLoad = () => {
      if (tileErrorCount > 0) {
        console.info("[customer-map] tile loaded after previous errors", { tileErrorCount });
      }
    };

    const onTileError = (event: LeafletTileErrorEvent) => {
      tileErrorCount += 1;
      const tileSrc = event.tile?.currentSrc || event.tile?.src;
      console.error("[customer-map] tile request failed", {
        tileErrorCount,
        src: tileSrc,
        coords: event.coords
      });
      if (switchedToFallback || tileErrorCount < 3 || !window.L || !mapRef.current) return;
      switchedToFallback = true;
      isFallbackLayerRef.current = true;
      tileLayerRef.current?.off("tileload", onTileLoad);
      tileLayerRef.current?.off("tileerror", onTileError);
      tileLayerRef.current?.remove();

      const fallback = window.L.tileLayer(TILE_FALLBACK_URL, {
        attribution: TILE_FALLBACK_ATTRIBUTION,
        maxZoom: 19
      }).addTo(mapRef.current);

      fallback.on("tileload", onTileLoad);
      fallback.on("tileerror", onTileError);
      tileLayerRef.current = fallback;
      console.warn("[customer-map] switched to fallback tile provider for debugging");
    };

    const initMap = () => {
      if (loadedRef.current || !window.L || !mapContainerRef.current) return;
      loadedRef.current = true;

      const map = window.L.map(mapContainerRef.current, { zoomControl: true });
      const primaryLayer = window.L.tileLayer(TILE_PRIMARY_URL, {
        attribution: TILE_PRIMARY_ATTRIBUTION,
        maxZoom: 19
      }).addTo(map);

      primaryLayer.on("tileload", onTileLoad);
      primaryLayer.on("tileerror", onTileError);

      mapRef.current = map;
      tileLayerRef.current = primaryLayer;
      isFallbackLayerRef.current = false;

      map.on("load", () => {
        console.info("[customer-map] map mounted");
      });

      window.requestAnimationFrame(() => {
        map.invalidateSize({ animate: false, pan: false });
      });

      mapResizeTimer = window.setTimeout(() => {
        map.invalidateSize({ animate: false, pan: false });
      }, 250);
    };

    if (window.L) {
      initMap();
    } else {
      timer = window.setInterval(initMap, 80);
    }

    return () => {
      if (timer) window.clearInterval(timer);
      if (mapResizeTimer) window.clearTimeout(mapResizeTimer);
      tileLayerRef.current?.off("tileload", onTileLoad);
      tileLayerRef.current?.off("tileerror", onTileError);
      Object.values(markersRef.current).forEach((marker) => marker.remove());
      markersRef.current = {};
      tileLayerRef.current = null;
      isFallbackLayerRef.current = false;
      mapRef.current?.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
  }, []);

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
      console.info("[customer-map] single-point center resolved", {
        point: [points[0].latitude, points[0].longitude]
      });
    } else {
      map.fitBounds(
        [
          [southWest.lat, southWest.lng],
          [northEast.lat, northEast.lng]
        ],
        { padding: [28, 28], maxZoom: 13 }
      );
      console.info("[customer-map] bounds resolved", {
        southWest: [southWest.lat, southWest.lng],
        northEast: [northEast.lat, northEast.lng]
      });
    }

    map.invalidateSize({ animate: false, pan: false });
    console.info("[customer-map] tile layer added", { provider: isFallbackLayerRef.current ? "fallback" : "primary" });
    console.info("[customer-map] markers rendered", { count: points.length });
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

      <div className="relative h-[360px] w-full overflow-hidden rounded-xl border border-slate-600/70 bg-[#0B1220]">
        <div ref={mapContainerRef} className="h-full w-full" aria-label="แผนที่ลูกค้าทั้งหมด" />
        {points.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0B1220]/90 text-sm text-slate-400">ไม่พบพิกัดสำหรับรายการที่แสดงอยู่</div>
        ) : null}
      </div>
    </section>
  );
}
