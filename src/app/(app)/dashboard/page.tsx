"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
const STEP_ORDER = [
  "DRAFT",
  "DOC_READY",
  "SOCIAL_POSTED",
  "NOTICE_SCHEDULED"
] as const;

const STEP_LABELS: Record<(typeof STEP_ORDER)[number], string> = {
  DRAFT: "DRAFT",
  DOC_READY: "DOCUMENT READY",
  SOCIAL_POSTED: "SOCIAL POSTED",
  NOTICE_SCHEDULED: "NOTICE SCHEDULED"
};

type DashboardJob = {
  id: string;
  outage_date: string | null;
  equipment_code: string | null;
  doc_status: string | null;
  doc_generated_at: string | null;
  doc_url: string | null;
  social_status: string | null;
  social_posted_at: string | null;
  social_approved_at: string | null;
  notice_status: string | null;
  notice_date: string | null;
  notice_scheduled_at: string | null;
  nakhon_status: string | null;
  nakhon_notified_date: string | null;
  is_closed: boolean | null;
  closed_at: string | null;
  step: (typeof STEP_ORDER)[number];
  next_action: string;
};

type DashboardJobsResponse = {
  ok: true;
  jobs: DashboardJob[];
};

type DashboardJobsError = {
  ok: false;
  error: string;
};

async function fetchDashboardJobs() {
  const response = await fetch(
    "/api/dashboard/jobs?filter=open&limit=200",
    {
      cache: "no-store"
    }
  );
  if (!response.ok) {
    throw new Error("Failed to load dashboard jobs");
  }
  const data = (await response.json()) as
    | DashboardJobsResponse
    | DashboardJobsError;
  if (!data.ok) {
    throw new Error(data.error);
  }
  return data.jobs;
}

export default function DashboardPage() {
  const [jobs, setJobs] = useState<DashboardJob[]>([]);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [isLoadingJobs, setIsLoadingJobs] = useState(true);

  useEffect(() => {
    let isActive = true;
    setIsLoadingJobs(true);
    fetchDashboardJobs()
      .then((data) => {
        if (!isActive) return;
        setJobs(data);
        setJobsError(null);
      })
      .catch((error: unknown) => {
        console.error("Failed to load dashboard jobs", error);
        if (!isActive) return;
        setJobs([]);
        setJobsError("ไม่สามารถโหลดข้อมูลงานได้ กรุณาลองใหม่");
      })
      .finally(() => {
        if (!isActive) return;
        setIsLoadingJobs(false);
      });

    return () => {
      isActive = false;
    };
  }, []);

  const pipelineJobs = useMemo(() => {
    return STEP_ORDER.reduce<Record<string, DashboardJob[]>>((acc, step) => {
      acc[step] = jobs.filter(
        (job) => job.step === step && job.is_closed !== true
      );
      return acc;
    }, {});
  }, [jobs]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">
          Dashboard
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          ติดตามสถานะงานแต่ละรายการและงานที่ต้องทำต่อ
        </p>
      </div>
      {jobsError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          {jobsError}
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Pipeline
          </h2>
          <p className="text-sm text-slate-500">
            งานที่ยังต้องดำเนินการตามขั้นตอน
          </p>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-4">
          {STEP_ORDER.map((step) => (
            <div
              key={step}
              className="flex flex-col rounded-2xl border border-slate-100 bg-slate-50/40 p-4"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  {STEP_LABELS[step]}
                </p>
              </div>
              <div className="mt-4 space-y-2">
                {isLoadingJobs ? (
                  <p className="text-xs text-slate-400">กำลังโหลด...</p>
                ) : pipelineJobs[step]?.length ? (
                  pipelineJobs[step].map((job) => (
                    <Link
                      key={job.id}
                      href={`/job/${job.id}`}
                      className="block rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-sm transition hover:border-slate-300"
                    >
                      {job.equipment_code ?? "—"}
                    </Link>
                  ))
                ) : (
                  <p className="text-xs text-slate-400">ไม่มีงาน</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
