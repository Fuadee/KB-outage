"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";

type DeliveryPayload = {
  batch: { id: string; job_id: string };
  job: { id: string; outage_date: string; equipment_code: string; note: string | null };
  summary: { total: number; delivered: number; pending: number };
  targets: Array<{
    id: string;
    company_name: string;
    contact_name: string | null;
    note: string | null;
    status: "pending" | "delivered";
    delivered_at: string | null;
    map_url: string | null;
    proof_image_url: string | null;
  }>;
};

export default function DeliveryListClient({ token }: { token: string }) {
  const [data, setData] = useState<DeliveryPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    const response = await fetch(`/api/public-delivery/${token}?ts=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
      headers: {
        Pragma: "no-cache"
      }
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) {
      setError("ลิงก์ไม่ถูกต้อง หรือหมดอายุแล้ว");
      setData(null);
      return;
    }
    console.info("[delivery-public] list client fetched", {
      token,
      summary: result.data.summary,
      targets: (result.data.targets ?? []).map((target: DeliveryPayload["targets"][number]) => ({
        id: target.id,
        company_name: target.company_name,
        status: target.status,
        delivered_at: target.delivered_at,
        proof_image_url: target.proof_image_url
      }))
    });
    setData(result.data);
    setError(null);
  };

  useEffect(() => {
    loadData();
  }, [token]);

  if (error) {
    return <div className="mx-auto max-w-md rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">{error}</div>;
  }

  if (!data) {
    return <div className="text-center text-sm text-slate-500">กำลังโหลด...</div>;
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 p-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-500">งานแจ้งหนังสือดับไฟ</p>
        <h1 className="text-lg font-semibold text-slate-900">{data.job.equipment_code}</h1>
        <p className="text-sm text-slate-600">วันที่ดับไฟ: {new Date(data.job.outage_date).toLocaleDateString("th-TH")}</p>
        {data.job.note ? <p className="mt-1 text-sm text-slate-600">พื้นที่: {data.job.note}</p> : null}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-medium text-slate-700">แจ้งแล้ว {data.summary.delivered} / {data.summary.total}</p>
        <div className="mt-2 h-2 w-full rounded-full bg-slate-200">
          <div
            className="h-2 rounded-full bg-emerald-500"
            style={{ width: `${data.summary.total > 0 ? (data.summary.delivered / data.summary.total) * 100 : 0}%` }}
          />
        </div>
      </div>

      <div className="space-y-3">
        {data.targets.map((target) => (
          <div key={target.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-slate-900">{target.company_name}</p>
                {target.contact_name ? <p className="text-sm text-slate-500">ผู้รับผิดชอบ: {target.contact_name}</p> : null}
              </div>
              <span className={`rounded-full px-2 py-1 text-xs font-semibold ${target.status === "delivered" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                {target.status === "delivered" ? "แจ้งแล้ว" : "ยังไม่แจ้ง"}
              </span>
            </div>
            {target.status === "delivered" && target.delivered_at ? (
              <p className="mb-2 text-xs text-emerald-700">
                แจ้งเมื่อ{" "}
                {new Date(target.delivered_at).toLocaleString("th-TH", {
                  dateStyle: "medium",
                  timeStyle: "short"
                })}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {target.map_url ? (
                <a href={target.map_url} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-3 py-2 text-xs font-medium text-white">
                  เปิดแผนที่
                </a>
              ) : null}
              {target.proof_image_url ? (
                <a
                  href={`/api/public-delivery/${token}/targets/${target.id}/proof`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-3 py-2 text-xs font-medium text-white"
                >
                  ดูรูปหลักฐาน
                </a>
              ) : null}
              <Link href={`/delivery/${token}/target/${target.id}`}>
                <Button type="button" size="sm">อัปโหลดรูปยืนยัน</Button>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
