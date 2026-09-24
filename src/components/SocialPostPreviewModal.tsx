/* Native images intentionally display private signed URLs and local upload blobs unchanged. */
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import Modal from "./Modal";
import MapActionButtons from "@/components/job/MapActionButtons";
import Button from "@/components/ui/Button";
import SocialImageLivePreview from "./SocialImageLivePreview";
import type { OutageJob } from "@/lib/jobsRepo";
import { getSocialPostPreview, formatThaiFullDate } from "@/lib/socialPost";
import { DEFAULT_SOCIAL_MAP_VIEW, isSocialImageStale, parseSocialMapView, socialImageSnapshot, MAX_SOCIAL_IMAGE_BYTES, SOCIAL_IMAGE_MIMES, type SocialImageAsset, type SocialMapView } from "@/lib/socialImage";

type Props = { job: OutageJob | null; isOpen: boolean; onClose: () => void; onJobUpdate: (id: string, patch: Partial<OutageJob>) => void };
export default function SocialPostPreviewModal({ job, isOpen, onClose, onJobUpdate }: Props) {
  const [current, setCurrent] = useState<OutageJob | null>(null);
  const [asset, setAsset] = useState<SocialImageAsset | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [localUrl, setLocalUrl] = useState("");
  const [mapView, setMapView] = useState<SocialMapView>(DEFAULT_SOCIAL_MAP_VIEW);
  const initializedAsset = useRef<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const session = useRef(0);
  const refreshSequence = useRef(0);
  const actionInFlight = useRef(false);
  const endpoint = `/api/jobs/${job?.id}/social-image`;
  const refresh = useCallback(async (token: number) => {
    const sequence = ++refreshSequence.current;
    const response = await fetch(endpoint, { cache: "no-store" });
    const result = await response.json();
    if (token !== session.current || sequence !== refreshSequence.current) return;
    if (!response.ok) { setLoaded(false); setConfirmed(false); throw new Error(result.error); }
    setCurrent(result.job); setAsset(result.asset); setLoaded(true);
    if (result.asset?.id && result.asset.id !== initializedAsset.current) {
      initializedAsset.current = result.asset.id;
      setMapView(parseSocialMapView(result.asset.snapshot?.map_view));
    }
  }, [endpoint]);
  useEffect(() => {
    const token = ++session.current;
    setCurrent(null); setAsset(null); setFile(null); setMapView(DEFAULT_SOCIAL_MAP_VIEW); initializedAsset.current = null; setConfirmed(false); setLoaded(false); setMessage(""); setBusy(false);
    if (!isOpen || !job?.id) return;
    const reload = () => void refresh(token).catch(error => { if (token === session.current) { setLoaded(false); setConfirmed(false); setMessage(error.message); } });
    reload();
    const timer = window.setInterval(reload, 5000);
    window.addEventListener("focus", reload);
    return () => { session.current = token + 1; window.clearInterval(timer); window.removeEventListener("focus", reload); };
  }, [isOpen, job?.id, refresh]);
  useEffect(() => {
    if (!file) { setLocalUrl(""); return; }
    const url = URL.createObjectURL(file); setLocalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const snapshotKey = current ? JSON.stringify(socialImageSnapshot(current)) : "";
  useEffect(() => { setConfirmed(false); }, [snapshotKey, asset?.id, file, mapView]);
  // Parent edits invalidate the review immediately; polling also detects edits in other sessions.
  const parentKey = job ? JSON.stringify(socialImageSnapshot(job)) : "";
  useEffect(() => { setConfirmed(false); if (isOpen) { setLoaded(false); void refresh(session.current).catch(error => setMessage(error.message)); } }, [parentKey, isOpen, refresh]);
  const stale = !!current && !!asset && isSocialImageStale(current, asset);
  const savedView = asset ? parseSocialMapView(asset.snapshot?.map_view) : DEFAULT_SOCIAL_MAP_VIEW;
  const framingChanged = !!asset && JSON.stringify(mapView) !== JSON.stringify(savedView);
  const valid = loaded && !!asset?.generated_url && !stale && !file && !framingChanged;
  const text = current ? getSocialPostPreview(current) : "";
  async function run(action: () => Promise<void>) {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    const token = session.current;
    setBusy(true); setMessage("");
    try { await action(); }
    catch (error) {
      console.error("Social modal action failed", error);
      if (token === session.current) setMessage(error instanceof Error ? error.message : "เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      actionInFlight.current = false;
      if (token === session.current) setBusy(false);
    }
  }
  async function generate() {
    const token = session.current;
    setConfirmed(false);
    const form = new FormData(); if (file) form.set("map", file); form.set("map_view", JSON.stringify(mapView));
    const response = await fetch(endpoint, { method: "POST", body: form });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    if (token !== session.current) return;
    setFile(null); await refresh(token);
  }
  async function post() {
    if (!valid || !confirmed || !current) return;
    const token = session.current;
    const response = await fetch("/api/jobs/social-post", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: current.id, imageId: asset?.id, confirmed }) });
    const result = await response.json();
    if (token !== session.current) return;
    if (!response.ok || result?.ok !== true) {
      setConfirmed(false);
      try { await refresh(token); } catch (error) { console.error("Social refresh after failed post", error); }
      throw new Error(result?.error ?? "ไม่สามารถบันทึก Social ได้ กรุณาลองใหม่");
    }
    if (result.job?.id !== current.id || result.job.social_status !== "POSTED" || !result.job.social_posted_at) {
      throw new Error("ระบบไม่ยืนยันว่าบันทึกสถานะ Social สำเร็จ กรุณาตรวจสอบข้อมูลงานล่าสุด");
    }
    onJobUpdate(current.id, result.job); onClose();
  }
  const facts = current && <dl className="grid gap-3 rounded-xl bg-purple-50 p-4 sm:grid-cols-2">
    <div><dt>วันที่ดับไฟ</dt><dd className="text-2xl font-bold text-purple-900">{formatThaiFullDate(current.outage_date)}</dd></div>
    <div><dt>เวลา</dt><dd className="text-2xl font-bold text-purple-900">{current.doc_time_start || "ยังไม่ระบุ"} - {current.doc_time_end || "ยังไม่ระบุ"} น.</dd></div>
    <div className="sm:col-span-2"><dt>พื้นที่</dt><dd className="break-words text-xl font-semibold">{current.doc_area_title || "ยังไม่ระบุ"}</dd></div>
    <div><dt>รหัสอุปกรณ์ / Feeder</dt><dd>{current.equipment_code}</dd></div>
  </dl>;
  return <Modal isOpen={isOpen} title="ตรวจสอบก่อนประชาสัมพันธ์" onClose={onClose} footer={<div className="flex flex-wrap justify-end gap-3">
    <Button variant="secondary" disabled={!loaded || busy} onClick={() => void run(async () => { await navigator.clipboard.writeText(text); setMessage("คัดลอกข้อความแล้ว — ไปวางใน Facebook/LINE ได้เลย"); })}>คัดลอกข้อความ</Button>
    <Button disabled={!valid || !confirmed || busy} onClick={() => void run(post)}>{busy ? "กำลังดำเนินการ..." : "บันทึกว่า Post ลงสื่อ Social แล้ว"}</Button>
  </div>}>
    <div className="flex flex-col gap-5">
      {message && <p role="alert" className="rounded-xl border border-amber-400 bg-amber-50 p-3 text-amber-900">{message}</p>}
      {!loaded && <p role="status">กำลังตรวจสอบข้อมูลล่าสุด…</p>}
      <section className="space-y-2"><h3 className="font-bold">1. ข้อมูลประกาศ</h3>{facts}<p className="text-sm">ข้อมูลจากงานโดยตรง หากต้องแก้ไขให้แก้ไขที่ข้อมูลงาน</p></section>
      <section className="space-y-3"><h3 className="font-bold">2. ภาพพื้นที่ดับไฟ</h3>
        <label className="block">อัปโหลดภาพพื้นที่ดับไฟ<input key={asset?.id ?? "new"} className="mt-2 block w-full text-sm" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || !loaded} onChange={event => {
          setConfirmed(false); const selected = event.target.files?.[0];
          if (!selected) return;
          if (!SOCIAL_IMAGE_MIMES.includes(selected.type) || selected.size > MAX_SOCIAL_IMAGE_BYTES || !selected.size) { setMessage("ใช้ไฟล์ PNG, JPG หรือ WEBP ขนาดไม่เกิน 3 MB"); event.target.value = ""; return; }
          setFile(selected); setMapView(DEFAULT_SOCIAL_MAP_VIEW); setMessage("");
        }} /></label>
        <p className="text-sm">อัปโหลดเฉพาะภาพแผนที่หรือพื้นที่ดับไฟ (PNG / JPG / WEBP ไม่เกิน 3 MB) ระบบจะใส่วันที่และเวลาให้อัตโนมัติ</p>
        {(localUrl || asset?.source_url) && current && <SocialImageLivePreview endpoint={endpoint} file={file} source={localUrl || asset?.source_url || ""} job={current} view={mapView} onViewChange={setMapView} />}
      </section>
      <section className="space-y-3"><h3 className="font-bold">3. สร้างภาพประชาสัมพันธ์</h3>
        {stale && <div role="alert" className="rounded-xl border-2 border-red-600 bg-red-50 p-4 font-bold text-red-800">ข้อมูลดับไฟมีการแก้ไขหลังจากสร้างภาพนี้<br />กรุณาสร้างภาพประชาสัมพันธ์ใหม่</div>}
        {framingChanged && !file && <p className="text-sm font-semibold text-orange-800">ตำแหน่งภาพแผนที่เปลี่ยนแล้ว กรุณาสร้างภาพใหม่</p>}
        {!file && !asset && <p>กรุณาอัปโหลดภาพพื้นที่ดับไฟก่อนสร้างภาพ</p>}
        <Button disabled={busy || !loaded || (!file && !asset)} onClick={() => void run(generate)}>{stale ? "สร้างภาพใหม่จากข้อมูลล่าสุด" : asset ? "สร้างภาพใหม่" : "สร้างภาพประชาสัมพันธ์"}</Button>
        {asset?.generated_url && <><img src={asset.generated_url} alt="ภาพประชาสัมพันธ์ที่สร้างจากข้อมูลงาน" className="max-h-[60vh] w-full rounded-xl border object-contain" /><p className="text-sm">สร้างเมื่อ {new Date(asset.generated_at).toLocaleString("th-TH")}{file && " · มีภาพพื้นที่ใหม่ กรุณาสร้างภาพใหม่"}</p>
          <Button variant="secondary" disabled={!valid || busy} onClick={() => void run(async () => {
            const response = await fetch(`${endpoint}?download=1`, { cache: "no-store" });
            if (!response.ok) { await refresh(session.current); throw new Error("กรุณาตรวจสอบข้อมูลล่าสุดและสร้างภาพใหม่"); }
            const url = URL.createObjectURL(await response.blob()); const link = document.createElement("a"); link.href = url; link.download = `outage-${current?.outage_date}.png`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
          })}>ดาวน์โหลดภาพ</Button></>}
      </section>
      <section className="space-y-3"><h3 className="font-bold">4. ตรวจสอบก่อนประชาสัมพันธ์</h3>{facts}
        <label className="flex items-start gap-3 rounded-xl border p-4"><input className="mt-1 h-5 w-5 shrink-0" type="checkbox" checked={confirmed} disabled={!valid || busy} onChange={event => setConfirmed(event.target.checked)} />ตรวจสอบข้อมูลวันที่ เวลา พื้นที่ และภาพประชาสัมพันธ์แล้ว</label>
      </section>
      <section className="space-y-3"><h3 className="font-bold">ข้อความโพสต์ Social</h3><p className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-sm leading-relaxed">{text}</p><MapActionButtons googleUrl={current?.map_link} /></section>
    </div>
  </Modal>;
}
