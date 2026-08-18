"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import GisIssueForm, { type GisIssueFormValue } from "@/components/gis/GisIssueForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { getJob, type OutageJob } from "@/lib/jobsRepo";

function NewGisIssueContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sourceJobId = searchParams.get("source_job_id");
  const [sourceJob, setSourceJob] = useState<OutageJob | null>(null);
  const [jobLoadError, setJobLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!sourceJobId) return;
    let cancelled = false;
    getJob(sourceJobId).then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data) {
        setJobLoadError("ไม่สามารถโหลดข้อมูลงานต้นทางได้");
        return;
      }
      setSourceJob(data);
    });
    return () => {
      cancelled = true;
    };
  }, [sourceJobId]);

  const initialValue = useMemo<Partial<GisIssueFormValue>>(() => {
    if (!sourceJobId) return {};
    return {
      source_job_id: sourceJobId,
      ...(sourceJob
        ? {
            feeder_code: sourceJob.equipment_code,
            location_text: sourceJob.doc_area_title ?? sourceJob.doc_area_detail ?? "",
            found_at: sourceJob.outage_date
          }
        : {})
    };
  }, [sourceJob, sourceJobId]);

  const createIssue = async (value: GisIssueFormValue) => {
    const response = await fetch("/api/gis-issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value)
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) {
      throw new Error(result?.error ?? "ไม่สามารถสร้าง GIS Issue ได้");
    }
    router.push(`/gis-issues/${result.data.id}`);
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header className="py-1">
        <p className="page-eyebrow">GIS Issues</p>
        <h1 className="page-title">สร้าง GIS Issue</h1>
        <p className="page-description">บันทึกเฉพาะข้อมูลสำคัญเพื่อส่งต่อ แก้ไข และตรวจสอบภายหลัง</p>
      </header>

      {sourceJobId ? (
        <div className="rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {sourceJob ? (
            <>
              สร้างจากงาน <span className="font-semibold">{sourceJob.equipment_code}</span>
              {sourceJob.doc_area_title ? ` / ${sourceJob.doc_area_title}` : ""}
            </>
          ) : jobLoadError ? jobLoadError : "กำลังโหลดข้อมูลงานต้นทาง..."}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">ข้อมูลปัญหา GIS</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <GisIssueForm
            initialValue={initialValue}
            onSubmit={createIssue}
            onCancel={() => router.back()}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default function NewGisIssuePage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">กำลังเปิดแบบฟอร์ม...</p>}>
      <NewGisIssueContent />
    </Suspense>
  );
}
