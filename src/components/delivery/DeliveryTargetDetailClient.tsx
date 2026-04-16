"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Button from "@/components/ui/Button";

type TargetPayload = {
  id: string;
  company_name: string;
  note: string | null;
  map_url: string | null;
  status: "pending" | "delivered";
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function DeliveryTargetDetailClient({ token, targetId }: { token: string; targetId: string }) {
  const [target, setTarget] = useState<TargetPayload | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [deliveredByName, setDeliveredByName] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const loadData = async () => {
    setLoading(true);
    const response = await fetch(`/api/public-delivery/${token}`, { cache: "no-store" });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) {
      setError("ไม่พบลิงก์ที่ต้องการ");
      setLoading(false);
      return;
    }

    const found = (result.data.targets ?? []).find((item: TargetPayload) => item.id === targetId);
    if (!found) {
      setError("ไม่พบรายการผู้ใช้ไฟรายนี้");
      setLoading(false);
      return;
    }

    setTarget(found);
    setError(null);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [token, targetId]);

  useEffect(() => {
    if (!proofFile) {
      setPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(proofFile);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [proofFile]);

  const canSubmit = useMemo(() => Boolean(proofFile) && !saving, [proofFile, saving]);

  const handleFileSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    setProofFile(nextFile);
    setError(null);
    setSuccessMessage(null);
    event.target.value = "";
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!proofFile) {
      setError("กรุณาถ่ายรูปหรือเลือกรูปก่อนส่ง");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    const formData = new FormData();
    formData.append("proof", proofFile);
    formData.append("deliveredByName", deliveredByName);

    const response = await fetch(`/api/public-delivery/${token}/targets/${targetId}/proof`, {
      method: "POST",
      body: formData
    });
    const result = await response.json().catch(() => null);

    setSaving(false);
    if (!response.ok || !result?.ok) {
      setError(result?.error ?? "ส่งหลักฐานไม่สำเร็จ");
      return;
    }

    setSuccessMessage("ส่งหลักฐานสำเร็จแล้ว กำลังกลับหน้ารายการ...");

    console.info("[delivery-public] upload+update success", {
      token,
      targetId,
      data: result.data
    });

    window.setTimeout(() => {
      window.location.replace(`/delivery/${token}?refresh=${Date.now()}`);
    }, 1200);
  };

  if (error && !target) {
    return (
      <div className="mx-auto w-full max-w-xl p-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">{error}</div>
        <div className="mt-3">
          <Link href={`/delivery/${token}`} className="text-sm text-slate-700 underline">กลับหน้ารายการ</Link>
        </div>
      </div>
    );
  }

  if (loading || !target) {
    return <div className="p-4 text-center text-sm text-slate-500">กำลังโหลด...</div>;
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 p-4 sm:space-y-5 sm:p-5">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">เป้าหมายการแจ้ง</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">ส่งหลักฐานการแจ้งหนังสือ</h1>
        <p className="mt-1 text-base font-medium text-slate-900">{target.company_name}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${target.status === "delivered" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
            {target.status === "delivered" ? "สถานะ: แจ้งแล้ว" : "สถานะ: รอแจ้ง"}
          </span>
          {target.map_url ? (
            <a
              href={target.map_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex rounded-2xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700"
            >
              เปิดแผนที่
            </a>
          ) : null}
        </div>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">ถ่ายรูปขณะส่งหนังสือหรือหลักฐานที่เกี่ยวข้อง</p>
        {target.note ? <p className="mt-2 text-sm text-slate-500">หมายเหตุ: {target.note}</p> : null}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:space-y-5 sm:p-5">
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelected}
          className="sr-only"
          aria-label="เปิดกล้องถ่ายรูป"
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelected}
          className="sr-only"
          aria-label="เลือกรูปจากเครื่อง"
        />

        <div className="grid gap-3">
          <Button
            type="button"
            size="lg"
            className="w-full rounded-2xl py-4 text-base"
            onClick={() => cameraInputRef.current?.click()}
            disabled={saving}
          >
            เปิดกล้องถ่ายรูป
          </Button>
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={saving}
          >
            เลือกรูปจากเครื่อง
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          {previewUrl ? (
            <>
              <img src={previewUrl} alt="ตัวอย่างรูปหลักฐาน" className="max-h-[420px] w-full rounded-2xl object-contain bg-black/5" />
              <div className="mt-3 space-y-1 text-xs text-slate-600">
                <p className="truncate">ไฟล์: {proofFile?.name}</p>
                <p>ขนาด: {proofFile ? formatFileSize(proofFile.size) : "-"}</p>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex-1 rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-medium text-white"
                  disabled={saving}
                >
                  ถ่ายใหม่
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProofFile(null);
                    setError(null);
                    setSuccessMessage(null);
                  }}
                  className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-700"
                  disabled={saving}
                >
                  ลบรูป
                </button>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
              ยังไม่มีรูปหลักฐาน
              <br />
              กด “เปิดกล้องถ่ายรูป” เพื่อเริ่มส่งงาน
            </div>
          )}
        </div>

        <label className="block text-sm font-medium text-slate-700">
          ชื่อผู้แจ้ง (ไม่บังคับ)
          <input
            type="text"
            value={deliveredByName}
            onChange={(event) => setDeliveredByName(event.target.value)}
            className="mt-2 block w-full rounded-xl border border-slate-300 px-3 py-3 text-sm"
            placeholder="เช่น สมชาย"
            disabled={saving}
          />
        </label>

        {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
        {successMessage ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{successMessage}</div> : null}

        <div className="space-y-2">
          <Button type="submit" disabled={!canSubmit} size="lg" className="w-full rounded-2xl py-4 text-base">
            {saving ? "กำลังอัปโหลด..." : "ส่งหลักฐานการแจ้ง"}
          </Button>
          <div className="text-center">
            <Link href={`/delivery/${token}`} className="text-sm text-slate-600 underline underline-offset-2">กลับหน้ารายการ</Link>
          </div>
        </div>
      </form>
    </div>
  );
}
