"use client";

import type { EditableTarget } from "./types";
import { MapContainer, TileLayer } from "react-leaflet";

type CustomerMapSectionProps = {
  items: EditableTarget[];
  selectedTempId: string | null;
  onMarkerSelect: (tempId: string) => void;
};

const KRABI_CENTER: [number, number] = [8.0863, 98.9063];
const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export default function CustomerMapSection({ items, selectedTempId, onMarkerSelect }: CustomerMapSectionProps) {
  void items;
  void selectedTempId;
  void onMarkerSelect;

  return (
    <section className="rounded-2xl border border-slate-700/80 bg-gradient-to-b from-[#101a2d] to-[#0d1627] p-4 shadow-[0_18px_40px_-28px_rgba(59,130,246,0.55)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-white">แผนที่ลูกค้าทั้งหมด</h2>
      </div>

      <div className="relative h-[360px] w-full overflow-hidden rounded-xl border border-slate-600/70 bg-[#0B1220]">
        <MapContainer
          center={KRABI_CENTER}
          zoom={11}
          scrollWheelZoom
          className="h-full w-full"
          aria-label="แผนที่ลูกค้าทั้งหมด"
        >
          <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_TILE_URL} />
        </MapContainer>
      </div>
    </section>
  );
}
