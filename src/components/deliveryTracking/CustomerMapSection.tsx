"use client";

import { useEffect, useMemo } from "react";
import { LatLngBounds } from "leaflet";
import type { EditableTarget } from "./types";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";

type CustomerMapSectionProps = {
  items: EditableTarget[];
  selectedTempId: string | null;
  onMarkerSelect: (tempId: string) => void;
};

type CustomerMapPoint = {
  tempId: string;
  companyName: string;
  status: EditableTarget["status"];
  latitude: number;
  longitude: number;
};

const KRABI_CENTER: [number, number] = [8.0863, 98.9063];
const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const isValidCoordinate = (latitude: number | null | undefined, longitude: number | null | undefined) => {
  if (typeof latitude !== "number" || typeof longitude !== "number") return false;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return false;
  return true;
};

function MapViewportController({ points }: { points: CustomerMapPoint[] }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;

    if (points.length === 1) {
      const onlyPoint = points[0];
      map.setView([onlyPoint.latitude, onlyPoint.longitude], 14);
      return;
    }

    const bounds = new LatLngBounds(points.map((point) => [point.latitude, point.longitude] as [number, number]));
    map.fitBounds(bounds, { padding: [30, 30] });
  }, [map, points]);

  return null;
}

export default function CustomerMapSection({ items, selectedTempId, onMarkerSelect }: CustomerMapSectionProps) {
  void selectedTempId;
  const mapPoints = useMemo<CustomerMapPoint[]>(() => {
    return items.flatMap((item, index) => {
      if (!isValidCoordinate(item.latitude, item.longitude)) {
        return [];
      }

      return [
        {
          tempId: item.tempId,
          companyName: item.company_name || `รายการ ${index + 1}`,
          status: item.status,
          latitude: item.latitude as number,
          longitude: item.longitude as number
        }
      ];
    });
  }, [items]);

  return (
    <section className="rounded-2xl border border-slate-700/80 bg-gradient-to-b from-[#101a2d] to-[#0d1627] p-4 shadow-[0_18px_40px_-28px_rgba(59,130,246,0.55)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-white">แผนที่ลูกค้าทั้งหมด</h2>
      </div>

      {mapPoints.length === 0 ? (
        <div className="rounded-xl border border-slate-600/70 bg-[#0B1220] px-4 py-6 text-sm text-gray-300">
          ยังไม่มีพิกัดสำหรับแสดงบนแผนที่
        </div>
      ) : (
        <div className="relative h-[360px] w-full overflow-hidden rounded-xl border border-slate-600/70 bg-[#0B1220]">
          <MapContainer
            center={KRABI_CENTER}
            zoom={11}
            scrollWheelZoom
            className="h-full w-full"
            aria-label="แผนที่ลูกค้าทั้งหมด"
          >
            <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_TILE_URL} />
            <MapViewportController points={mapPoints} />
            {mapPoints.map((point) => (
              <Marker
                key={point.tempId}
                position={[point.latitude, point.longitude]}
                eventHandlers={{
                  click: () => onMarkerSelect(point.tempId)
                }}
              >
                <Popup>
                  <div className="text-sm">
                    <div className="font-medium">{point.companyName}</div>
                    <div>{point.status === "delivered" ? "แจ้งแล้ว" : "ยังไม่แจ้ง"}</div>
                                      </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      )}
    </section>
  );
}
