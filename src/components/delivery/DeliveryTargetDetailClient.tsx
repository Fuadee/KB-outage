"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/Button";

type TargetPayload = {
  id: string;
  company_name: string;
  note: string | null;
  map_url: string | null;
  status: "pending" | "delivered";
};

export default function DeliveryTargetDetailClient({ token, targetId }: { token: string; targetId: string }) {
  const [target, setTarget] = useState<TargetPayload | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [deliveredByName, setDeliveredByName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    const response = await fetch(`/api/public-delivery/${token}`, { cache: "no-store" });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) {
      setError("ไม่พบลิงก์ที่ต้องการ");
      return;
    }

    const found = (result.data.targets ?? []).find((item: TargetPayload) => item.id === targetId);
    if (!found) {
      setError("ไม่พบรายการผู้ใช้ไฟรายนี้");
      return;
    }

    setTarget(found);
    setError(null);
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!proofFile) return;

    setSaving(true);
    setError(null);

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

    window.location.href = `/delivery/${token}`;
  };

  if (error) {
    return (
      <div className="mx-auto w-full max-w-xl p-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">{error}</div>
        <div className="mt-3">
          <Link href={`/delivery/${token}`} className="text-sm text-slate-700 underline">กลับหน้ารายการ</Link>
        </div>
      </div>
    );
  }

  if (!target) {
    return <div className="p-4 text-center text-sm text-slate-500">กำลังโหลด...</div>;
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 p-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">{target.company_name}</h1>
        {target.note ? <p className="mt-2 text-sm text-slate-600">หมายเหตุ: {target.note}</p> : null}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {target.map_url ? (
          <a href={target.map_url} target="_blank" rel="noreferrer" className="inline-flex rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">
            เปิด Google Maps
          </a>
        ) : null}

        <label className="block text-sm font-medium text-slate-700">
          รูปหลักฐาน
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => setProofFile(event.target.files?.[0] ?? null)}
            className="mt-2 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            required
          />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          ชื่อผู้แจ้ง (ไม่บังคับ)
          <input
            type="text"
            value={deliveredByName}
            onChange={(event) => setDeliveredByName(event.target.value)}
            className="mt-2 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            placeholder="ระบุชื่อ"
          />
        </label>

        {previewUrl ? (
          <img src={previewUrl} alt="preview" className="h-52 w-full rounded-xl object-cover" />
        ) : null}

        {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={!canSubmit}>
            {saving ? "กำลังส่ง..." : "ส่งหลักฐานการแจ้ง"}
          </Button>
          <Link href={`/delivery/${token}`} className="text-sm text-slate-700 underline">กลับหน้ารายการ</Link>
        </div>
      </form>
    </div>
  );
}
