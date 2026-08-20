import { NextResponse } from "next/server";
import { getGisContext, logGisError } from "@/lib/gisIssuesServer";

export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  try {
    const { admin } = await getGisContext();
    const body = (await request.json()) as { job_ids?: unknown };
    const jobIds = Array.isArray(body.job_ids)
      ? [...new Set(body.job_ids.filter((id): id is string => typeof id === "string" && UUID_PATTERN.test(id)))].slice(0, 200)
      : [];

    if (jobIds.length === 0) return NextResponse.json({ ok: true, data: {} });

    const { data, error } = await admin
      .from("gis_issues")
      .select("source_job_id")
      .in("source_job_id", jobIds);
    if (error) throw error;

    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      if (row.source_job_id) counts[row.source_job_id] = (counts[row.source_job_id] ?? 0) + 1;
    }
    return NextResponse.json({ ok: true, data: counts });
  } catch (error) {
    logGisError("[gis-issues][job-counts]", error);
    return NextResponse.json({ ok: false, error: "ไม่สามารถโหลดจำนวน GIS Issues ได้" }, { status: 500 });
  }
}
