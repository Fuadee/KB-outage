"use client";

import { useEffect, useMemo, useRef } from "react";
import type { EditableTarget } from "./types";
import { buildCustomerPoints, getGoogleMapsDirectionLink, type CustomerPoint } from "./customerMapHelpers";
import { markerStatusStyles } from "./markerStatusStyles";

type LeafletMap = {
  remove: () => void;
  fitBounds: (bounds: [[number, number], [number, number]], options?: { padding?: [number, number]; maxZoom?: number }) => void;
  setView: (center: [number, number], zoom: number, options?: { animate?: boolean }) => void;
  panTo: (center: [number, number], options?: { animate?: boolean }) => void;
};

type LeafletMarker = {
  addTo: (map: LeafletMap) => LeafletMarker;
  bindPopup: (content: string) => LeafletMarker;
  openPopup: () => LeafletMarker;
  on: (event: string, cb: () => void) => LeafletMarker;
  setLatLng: (latLng: [number, number]) => LeafletMarker;
  remove: () => void;
};

type LeafletNamespace = {
  map: (element: HTMLElement, options: { zoomControl: boolean }) => LeafletMap;
  tileLayer: (url: string, options: { attribution: string; maxZoom?: number }) => { addTo: (map: LeafletMap) => void };
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
const LEAFLET_CSS_ID = "leaflet-css-cdn";

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

const ensureLeafletAsset = () => {
  if (typeof document === "undefined") return;
  if (!document.getElementById(LEAFLET_CSS_ID)) {
    const css = document.createElement("link");
    css.id = LEAFLET_CSS_ID;
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    css.crossOrigin = "";
    document.head.appendChild(css);
  }
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
  const markersRef = useRef<Record<string, LeafletMarker>>({});
  const loadedRef = useRef(false);

  const { points, missingCoordinateCount } = useMemo(() => buildCustomerPoints(items), [items]);

  useEffect(() => {
    ensureLeafletAsset();

    let timer = 0;
    const initMap = () => {
      if (loadedRef.current || !window.L || !mapContainerRef.current) return;
      loadedRef.current = true;

      const map = window.L.map(mapContainerRef.current, { zoomControl: true });
      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19
      }).addTo(map);

      mapRef.current = map;
    };

    if (window.L) {
      initMap();
    } else {
      timer = window.setInterval(initMap, 80);
    }

    return () => {
      if (timer) window.clearInterval(timer);
      Object.values(markersRef.current).forEach((marker) => marker.remove());
      markersRef.current = {};
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
    if (bounds.isValid()) {
      const southWest = bounds.getSouthWest();
      const northEast = bounds.getNorthEast();
      map.fitBounds(
        [
          [southWest.lat, southWest.lng],
          [northEast.lat, northEast.lng]
        ],
        { padding: [28, 28], maxZoom: points.length === 1 ? 15 : 13 }
      );
      if (points.length === 1) {
        map.setView([points[0].latitude, points[0].longitude], 15, { animate: true });
      }
    }
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

      {points.length === 0 ? (
        <div className="flex h-[360px] items-center justify-center rounded-xl border border-dashed border-slate-600/80 bg-[#0B1220] text-sm text-slate-400">
          ไม่พบพิกัดสำหรับรายการที่แสดงอยู่
        </div>
      ) : (
        <div
          ref={mapContainerRef}
          className="h-[360px] w-full overflow-hidden rounded-xl border border-slate-600/70 bg-[#0B1220]"
          aria-label="แผนที่ลูกค้าทั้งหมด"
        />
      )}
    </section>
  );
}
