/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { DEFAULT_SOCIAL_MAP_VIEW, socialMapPlacement, type SocialMapView } from "@/lib/socialImage";
import { SOCIAL_LAYOUT as L } from "@/lib/socialImageLayout";

type Facts = { outage_date: string; doc_time_start: string | null; doc_time_end: string | null; doc_area_title: string | null };
type Props = { source: string; endpoint: string; file: File | null; job: Facts; view: SocialMapView; onViewChange: (view: SocialMapView) => void };
const clamp = (value: number) => Math.min(1, Math.max(0, value));

export default function SocialImageLivePreview({ source, endpoint, file, job, view, onViewChange }: Props) {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [drag, setDrag] = useState<{ x: number; y: number; startX: number; startY: number } | null>(null);
  useEffect(() => {
    let active = true;
    const probe = new Image();
    setDimensions({ width: 0, height: 0 });
    probe.onload = () => { if (active) setDimensions({ width: probe.naturalWidth, height: probe.naturalHeight }); };
    probe.src = source;
    return () => { active = false; };
  }, [source]);
  const mapHeight = L.infoTop - L.mapTop;
  const geometry = dimensions.width && dimensions.height
    ? socialMapPlacement(dimensions.width, dimensions.height, L.width, mapHeight, view)
    : null;
  const factsKey = JSON.stringify([job.outage_date, job.doc_time_start, job.doc_time_end, job.doc_area_title]);
  const viewKey = JSON.stringify(view);
  const requestKey = JSON.stringify([endpoint, source, factsKey, viewKey]);
  const [rendered, setRendered] = useState<{ key: string; url: string } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  useEffect(() => {
    setRendered(null);
    setFailure(null);
    const controller = new AbortController();
    let objectUrl = "";
    const timer = window.setTimeout(async () => {
      try {
        const form = new FormData();
        if (file) form.set("map", file);
        form.set("map_view", viewKey);
        const response = await fetch(`${endpoint}?preview=1`, { method: "POST", body: form, signal: controller.signal });
        if (!response.ok) throw new Error((await response.json()).error || "โหลดตัวอย่างไม่สำเร็จ");
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setRendered({ key: requestKey, url: objectUrl });
      } catch (error) {
        if (!controller.signal.aborted) setFailure({ key: requestKey, message: error instanceof Error ? error.message : "โหลดตัวอย่างไม่สำเร็จ" });
      }
    }, 200);
    return () => { controller.abort(); window.clearTimeout(timer); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [requestKey, endpoint, file, viewKey]);
  const ready = rendered?.key === requestKey;
  function setMode(mode: SocialMapView["mode"]) {
    onViewChange(mode === "fit" ? { ...DEFAULT_SOCIAL_MAP_VIEW } : { ...view, mode });
  }
  function pan(clientX: number, clientY: number, target: HTMLDivElement) {
    if (!drag || !geometry) return;
    const rectangle = target.getBoundingClientRect();
    const scale = L.width / rectangle.width;
    const overflowX = Math.max(0, geometry.width - L.width);
    const overflowY = Math.max(0, geometry.height - mapHeight);
    onViewChange({ ...view, x: overflowX ? clamp(drag.startX - (clientX - drag.x) * scale / overflowX) : 0.5,
      y: overflowY ? clamp(drag.startY - (clientY - drag.y) * scale / overflowY) : 0.5 });
  }
  return <div className="space-y-3">
    <div role="group" aria-label="การจัดวางภาพแผนที่" className="flex flex-wrap gap-2">
      <button type="button" aria-pressed={view.mode === "fit"} onClick={() => setMode("fit")} className={`rounded-lg border px-4 py-2 ${view.mode === "fit" ? "border-orange-600 bg-orange-50 font-bold text-orange-800" : "border-slate-300"}`}>พอดีทั้งภาพ</button>
      <button type="button" aria-pressed={view.mode === "fill"} onClick={() => setMode("fill")} className={`rounded-lg border px-4 py-2 ${view.mode === "fill" ? "border-orange-600 bg-orange-50 font-bold text-orange-800" : "border-slate-300"}`}>เต็มกรอบ</button>
    </div>
    {view.mode === "fill" && <label className="flex items-center gap-3 text-sm">ซูม
      <input aria-label="ซูมภาพแผนที่" type="range" min="1" max="3" step="0.05" value={view.zoom} onChange={event => onViewChange({ ...view, zoom: Number(event.target.value) })} className="w-full" />
      <span className="w-12 text-right">{view.zoom.toFixed(1)}×</span>
    </label>}
    <p className="text-sm text-slate-600">{view.mode === "fit" ? "แสดงภาพแผนที่ทั้งหมดโดยไม่ตัดขอบ" : "ลากภาพในตัวอย่างเพื่อเลือกพื้นที่ที่ต้องการแสดง"}</p>
    <div aria-busy={!ready && failure?.key !== requestKey}
      style={{ aspectRatio: `${L.width} / ${L.height}` }}
      className={`relative w-full max-w-[540px] overflow-hidden rounded-xl border bg-slate-100 shadow-sm ${view.mode === "fill" ? "touch-none cursor-grab" : ""}`}
      onPointerDown={event => { if (view.mode !== "fill" || !geometry) return; const rect = event.currentTarget.getBoundingClientRect(); const y = (event.clientY - rect.top) * L.height / rect.height; if (y < L.mapTop || y > L.infoTop) return; event.currentTarget.setPointerCapture(event.pointerId); setDrag({ x: event.clientX, y: event.clientY, startX: view.x, startY: view.y }); }}
      onPointerMove={event => { if (view.mode === "fill") pan(event.clientX, event.clientY, event.currentTarget); }}
      onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)} onLostPointerCapture={() => setDrag(null)}>
      {ready ? <img src={rendered.url} alt="ตัวอย่างภาพประชาสัมพันธ์ 4 ต่อ 5" draggable={false} className="block w-full select-none" />
        : <p role={failure?.key === requestKey ? "alert" : "status"} className="absolute inset-0 flex items-center justify-center p-6 text-center text-slate-600">
          {failure?.key === requestKey ? failure.message : "กำลังสร้างตัวอย่างภาพ…"}
        </p>}
    </div>
  </div>;
}

