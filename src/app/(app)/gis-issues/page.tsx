"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import GisIssueStatusBadge from "@/components/gis/GisIssueStatusBadge";
import { Card, CardContent } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import {
  GIS_ISSUE_STATUSES,
  GIS_ISSUE_TYPES,
  GIS_STATUS_META,
  formatThaiShortDate,
  getGisIssueTypeLabel,
  type GisIssue,
  type GisIssueStatus,
  type GisIssueType
} from "@/lib/gisIssues";
import { inputLight } from "@/lib/theme";

type StatusFilter = GisIssueStatus | "ALL";
type TypeFilter = GisIssueType | "ALL";

const emptyCounts: Record<GisIssueStatus, number> = {
  OPEN: 0,
  IN_PROGRESS: 0,
  VERIFYING: 0,
  CLOSED: 0
};

function GisIssuesContent() {
  const searchParams = useSearchParams();
  const sourceJobId = searchParams.get("source_job_id") ?? "";
  const [issues, setIssues] = useState<GisIssue[]>([]);
  const [counts, setCounts] = useState(emptyCounts);
  const [feeders, setFeeders] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [feeder, setFeeder] = useState("");
  const [issueType, setIssueType] = useState<TypeFilter>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchIssues = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (status !== "ALL") params.set("status", status);
    if (feeder) params.set("feeder", feeder);
    if (issueType !== "ALL") params.set("issue_type", issueType);
    if (sourceJobId) params.set("source_job_id", sourceJobId);

    try {
      const response = await fetch(`/api/gis-issues?${params.toString()}`);
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) throw new Error(result?.error ?? "ไม่สามารถโหลด GIS Issues ได้");
      setIssues(result.data ?? []);
      setCounts(result.counts ?? emptyCounts);
      setFeeders(result.feeders ?? []);
    } catch (fetchError) {
      setIssues([]);
      setError(fetchError instanceof Error ? fetchError.message : "ไม่สามารถโหลด GIS Issues ได้");
    } finally {
      setLoading(false);
    }
  }, [feeder, issueType, query, sourceJobId, status]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void fetchIssues(), 200);
    return () => window.clearTimeout(timeout);
  }, [fetchIssues]);

  return (
    <div className="space-y-6">
      <header className="page-header">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="page-eyebrow">Data quality operations</p>
            <h1 className="page-title">GIS Issues</h1>
            <p className="page-description">ติดตามปัญหาข้อมูล GIS ตั้งแต่พบปัญหาจนตรวจสอบและปิด Issue</p>
          </div>
          <Link href="/gis-issues/new" className="inline-flex items-center rounded-[9px] bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--primary-hover)]">
            + สร้าง GIS Issue
          </Link>
        </div>
      </header>

      {sourceJobId ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>กำลังแสดงเฉพาะ GIS Issues ที่เชื่อมกับงานนี้</span>
          <Link href="/gis-issues" className="font-semibold underline underline-offset-2">ดูทั้งหมด</Link>
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="สรุปจำนวน GIS Issues">
        {GIS_ISSUE_STATUSES.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setStatus(status === item ? "ALL" : item)}
            className={`rounded-xl border bg-white px-4 py-3 text-left shadow-[var(--shadow-card)] transition hover:border-slate-300 ${status === item ? GIS_STATUS_META[item].badge : "border-slate-200"}`}
          >
            <span className="flex items-center gap-2 text-xs font-medium text-slate-600">
              <span className={`h-2 w-2 rounded-full ${GIS_STATUS_META[item].dot}`} />
              {GIS_STATUS_META[item].label}
            </span>
            <span className="mt-1 block text-2xl font-semibold text-slate-900">{counts[item]}</span>
          </button>
        ))}
      </section>

      <Card>
        <CardContent className="grid gap-2 py-3 md:grid-cols-[minmax(220px,1fr)_180px_220px_180px]">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาเลข Issue, Feeder, อุปกรณ์, พื้นที่..." className="h-9" />
          <select className={`${inputLight} h-9 py-1.5`} value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
            <option value="ALL">ทุกสถานะ</option>
            {GIS_ISSUE_STATUSES.map((item) => <option key={item} value={item}>{GIS_STATUS_META[item].label}</option>)}
          </select>
          <select className={`${inputLight} h-9 py-1.5`} value={issueType} onChange={(event) => setIssueType(event.target.value as TypeFilter)}>
            <option value="ALL">ทุกประเภทปัญหา</option>
            {GIS_ISSUE_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <select className={`${inputLight} h-9 py-1.5`} value={feeder} onChange={(event) => setFeeder(event.target.value)}>
            <option value="">ทุก Feeder</option>
            {feeders.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </CardContent>
      </Card>

      {error ? <p className="rounded-[10px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[var(--shadow-card)]">
        <div className="hidden grid-cols-[120px_110px_120px_minmax(180px,1fr)_150px_105px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-semibold text-slate-500 md:grid">
          <span>Issue</span><span>Feeder</span><span>Equipment</span><span>ประเภท / จุดที่พบ</span><span>สถานะ</span><span>วันที่พบ</span>
        </div>
        {loading ? <p className="px-4 py-8 text-center text-sm text-slate-600">กำลังโหลดข้อมูล...</p> : null}
        {!loading && issues.length === 0 ? <p className="px-4 py-8 text-center text-sm text-slate-600">ไม่พบ GIS Issue ตามเงื่อนไขที่เลือก</p> : null}
        {!loading && issues.map((issue) => (
          <Link
            key={issue.id}
            href={`/gis-issues/${issue.id}`}
            className="grid gap-2 border-b border-slate-100 px-4 py-3 transition last:border-b-0 hover:bg-slate-50 md:grid-cols-[120px_110px_120px_minmax(180px,1fr)_150px_105px] md:items-center md:gap-3"
          >
            <span className="font-semibold text-orange-700">{issue.issue_number}</span>
            <span className="text-sm font-medium text-slate-900">{issue.feeder_code}</span>
            <span className="text-sm text-slate-600">{issue.equipment_code || "-"}</span>
            <span className="min-w-0 text-sm text-slate-800">
              <span className="block truncate">{getGisIssueTypeLabel(issue.issue_type, issue.issue_type_detail)}</span>
              <span className="block truncate text-xs text-slate-500">{issue.location_text || issue.description}</span>
            </span>
            <span><GisIssueStatusBadge status={issue.status} compact /></span>
            <span className="text-xs text-slate-500">{formatThaiShortDate(issue.found_at)}</span>
          </Link>
        ))}
      </section>
    </div>
  );
}

export default function GisIssuesPage() {
  return <Suspense fallback={<p className="text-sm text-slate-500">กำลังโหลด GIS Issues...</p>}><GisIssuesContent /></Suspense>;
}
