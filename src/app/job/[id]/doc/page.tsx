"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getJob, OutageJob } from "@/lib/jobsRepo";
import { parseLocalDate } from "@/lib/dateUtils";

const formatThaiDate = (dateString: string) =>
  parseLocalDate(dateString).toLocaleDateString("th-TH", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });

const formatThaiDateTime = (dateString: string) =>
  new Date(dateString).toLocaleString("th-TH", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

export default function JobDocPlaceholderPage() {
  const params = useParams<{ id: string }>();
  const [job, setJob] = useState<OutageJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadJob = async () => {
      if (!params.id) return;
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await getJob(params.id);
      if (fetchError || !data) {
        setError(fetchError?.message ?? "ไม่พบงานที่ต้องการ");
        setLoading(false);
        return;
      }
      setJob(data);
      setLoading(false);
    };

    loadJob();
  }, [params.id]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm">
        กำลังโหลดข้อมูล...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-8 text-center text-sm text-red-700 shadow-sm">
        {error}
      </div>
    );
  }

  if (!job) return null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">สร้างหนังสือดับไฟ</h1>
        <p className="text-sm text-slate-500">
          กำลังพัฒนา: สร้างหนังสือดับไฟ
        </p>
      </header>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">สรุปงาน</h2>
        <div className="mt-4 space-y-2 text-sm text-slate-700">
          <p>
            วันที่ดับไฟ: <span className="font-medium">{formatThaiDate(job.outage_date)}</span>
          </p>
          <p>
            รหัสอุปกรณ์: <span className="font-medium">{job.equipment_code}</span>
          </p>
          <p>
            หมายเหตุ: <span className="font-medium">{job.note?.trim() || "ไม่มีหมายเหตุ"}</span>
          </p>
          <p>
            สถานะหนังสือ: <span className="font-medium">{job.doc_status}</span>
          </p>
          <p>
            วันที่ขอสร้าง:{" "}
            <span className="font-medium">
              {job.doc_requested_at
                ? formatThaiDateTime(job.doc_requested_at)
                : "-"}
            </span>
          </p>
        </div>
      </section>

      <Link
        href={`/job/${job.id}`}
        className="w-fit rounded-xl border border-slate-200 px-5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100"
      >
        กลับไปหน้ารายละเอียด
      </Link>
    </div>
  );
}
