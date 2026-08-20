"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Badge from "@/components/ui/Badge";
import {
  DOCUMENT_WORKFLOW_STAGE_LABELS,
  type DocumentWorkflowStage
} from "@/lib/documentWorkflow";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/Card";
const STEP_ORDER = [
  "DRAFT",
  "WAITING_DOCUMENT",
  "WAITING_DELIVERY",
  "READY_FOR_SOCIAL",
  "SOCIAL_POSTED",
  "NOTICE_SCHEDULED"
] as const satisfies readonly DocumentWorkflowStage[];

const STEP_LABELS = DOCUMENT_WORKFLOW_STAGE_LABELS;

const STEP_TONES: Record<(typeof STEP_ORDER)[number], string> = {
  DRAFT: "bg-slate-400",
  WAITING_DOCUMENT: "bg-blue-500",
  WAITING_DELIVERY: "bg-cyan-600",
  READY_FOR_SOCIAL: "bg-indigo-600",
  SOCIAL_POSTED: "bg-emerald-500",
  NOTICE_SCHEDULED: "bg-orange-500"
};

type DashboardJob = {
  id: string;
  outage_date: string | null;
  equipment_code: string | null;
  doc_status: string | null;
  doc_generated_at: string | null;
  doc_url: string | null;
  document_received_at: string | null;
  document_received_by: string | null;
  document_delivered_at: string | null;
  document_delivered_by: string | null;
  document_delivery_note: string | null;
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

function getStageDetail(job: DashboardJob): string | null {
  if (job.step === "WAITING_DOCUMENT") return "รอรับเอกสารฉบับจริง";
  if (job.step === "WAITING_DELIVERY") {
    return `รับโดย ${job.document_received_by ?? "ไม่ระบุ"}`;
  }
  if (job.step === "READY_FOR_SOCIAL") {
    return `ส่งโดย ${job.document_delivered_by ?? "ไม่ระบุ"}`;
  }
  if (job.step === "SOCIAL_POSTED") return "โพสต์ Social แล้ว";
  return null;
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
      <header className="page-header">
        <div>
        <p className="page-eyebrow">
          Overview
        </p>
        <h1 className="page-title">
          Dashboard
        </h1>
        <p className="page-description">
          ติดตามสถานะงานแต่ละรายการและงานที่ต้องทำต่อ
        </p>
        </div>
      </header>
      {jobsError ? (
        <Card className="border-rose-200 bg-rose-50/70">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm text-rose-700">
            <span>{jobsError}</span>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
            >
              ลองใหม่
            </button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Pipeline</CardTitle>
              <CardDescription>
                งานที่ยังต้องดำเนินการตามขั้นตอน
              </CardDescription>
            </div>
            <Badge variant="accent">Live operations</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {STEP_ORDER.map((step) => (
              <div
                key={step}
                className="flex min-h-40 flex-col rounded-xl bg-slate-50/90 p-4"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-700">
                    {STEP_LABELS[step]}
                  </p>
                  <span className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    {pipelineJobs[step]?.length ?? 0}
                    <span className={`h-2 w-2 rounded-full ${STEP_TONES[step]}`} />
                  </span>
                </div>
                <div className="mt-4 space-y-2">
                  {isLoadingJobs ? (
                    <div className="space-y-2" aria-label="กำลังโหลดข้อมูล">
                      <div className="h-9 animate-pulse rounded-lg bg-slate-200/70" />
                      <div className="h-9 animate-pulse rounded-lg bg-slate-200/50" />
                    </div>
                  ) : pipelineJobs[step]?.length ? (
                    pipelineJobs[step].map((job) => (
                      <Link
                        key={job.id}
                        href={`/job/${job.id}`}
                        className="group flex items-start justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:shadow-md"
                      >
                        <span className="min-w-0">
                          <span className="block truncate">{job.equipment_code ?? "—"}</span>
                          {getStageDetail(job) ? (
                            <span className="mt-0.5 block truncate text-[10px] font-normal text-slate-600">
                              {getStageDetail(job)}
                            </span>
                          ) : null}
                        </span>
                        <span className="text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-orange-500">→</span>
                      </Link>
                    ))
                  ) : (
                    <p className="rounded-lg border border-dashed border-slate-200 px-3 py-5 text-center text-xs text-slate-500">ไม่มีงานในขั้นตอนนี้</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
