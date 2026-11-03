import { getOutagePeriods, normalizeOutagePeriods, type OutagePeriod } from "@/lib/outagePeriods";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import fs from "fs/promises";
import {
  generateOutageDocxBuffer,
  OUTAGE_TEMPLATE_PATH
} from "@/lib/docs/outage-docx-template";
import { runVulnerablePatientsCheck } from "@/lib/vulnerablePatientsCheck";
import { parseCustomerCount } from "@/lib/jobMetadata";

export const runtime = "nodejs";

type DocPayload = {
  outage_periods?: OutagePeriod[] | null;
  doc_issue_date: string;
  doc_purpose: string;
  doc_area_title: string;
  doc_time_start: string;
  doc_time_end: string;
  customer_count?: number | null;
  doc_area_detail: string;
  map_link: string;
};

type CreateDocRequest = {
  jobId: string;
  payload: DocPayload;
};

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function createSupabaseServerClient() {
  if (!SUPABASE_URL) {
    throw new Error("Missing SUPABASE_URL env var.");
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY env var.");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function isPayloadValid(payload: Partial<DocPayload>) {
  return [payload.doc_issue_date, payload.doc_purpose, payload.doc_area_title,
    payload.doc_area_detail, payload.map_link].every(value => typeof value === "string" && value.trim());
}

function toAsciiFilename(value: string) {
  return value.replace(/[^\x20-\x7E]/g, "_");
}

function buildContentDisposition(asciiName: string, utf8Name?: string) {
  if (!utf8Name) return `attachment; filename="${asciiName}"`;
  const encoded = encodeURIComponent(utf8Name)
    .replace(/['()]/g, escape)
    .replace(/\*/g, "%2A");
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encoded}`;
}



export async function POST(request: Request) {
  let jobId: string | number | undefined;
  let generationStarted = false;
  try {
    const body = (await request.json()) as Partial<CreateDocRequest> & {
      id?: string | number;
      payload?: Partial<DocPayload> & { jobId?: string | number };
    };
    console.info("Docs create request body:", JSON.stringify(body, null, 2));
    jobId = body?.jobId ?? body?.payload?.jobId ?? body?.id;
    console.info("Docs create jobId:", jobId);

    if (!jobId) {
      return NextResponse.json(
        { ok: false, error: "missing jobId" },
        { status: 400 }
      );
    }

    if (!body?.payload || !isPayloadValid(body.payload)) {
      return NextResponse.json(
        { ok: false, error: "กรุณากรอกข้อมูลให้ครบถ้วน" },
        { status: 400 }
      );
    }

    let periods: OutagePeriod[];
    try {
      periods = normalizeOutagePeriods(body.payload.outage_periods === undefined
        ? getOutagePeriods(body.payload) : body.payload.outage_periods);
    } catch (error) {
      return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 400 });
    }

    const hasCustomerCount = Object.prototype.hasOwnProperty.call(body.payload, "customer_count");
    const customerCount = parseCustomerCount(body.payload.customer_count);
    if (!customerCount.success) {
      return NextResponse.json(
        { ok: false, error: customerCount.error },
        { status: 400 }
      );
    }

    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { ok: false, error: "Missing SUPABASE_SERVICE_ROLE_KEY env var." },
        { status: 500 }
      );
    }

    const supabase = createSupabaseServerClient();
    const { data: job, error: jobError } = await supabase
      .from("outage_jobs")
      .select("*")
      .eq("id", jobId)
      .single();
    console.log("Docs create jobError:", jobError);
    console.log("Docs create job:", job);

    if (jobError || !job) {
      return NextResponse.json(
        {
          ok: false,
          error: "ไม่พบข้อมูลงานที่ต้องการ",
          debug: { jobId, jobError }
        },
        { status: 404 }
      );
    }

    // Older clients may edit one-period jobs, but must never discard a multi-period schedule.
    if (body.payload.outage_periods === undefined && getOutagePeriods(job).length > 1) {
      return NextResponse.json({ ok: false, error: "งานนี้มีหลายช่วงเวลาดับไฟ กรุณาโหลดหน้าใหม่ก่อนแก้ไข" }, { status: 409 });
    }
    const payload = { ...body.payload, outage_periods: periods, doc_time_start: periods[0].start_time, doc_time_end: periods[0].end_time } as DocPayload;
    const { data: savedJob, error: updateError } = await supabase
      .from("outage_jobs")
      .update({
        doc_issue_date: payload.doc_issue_date,
        doc_purpose: payload.doc_purpose,
        doc_area_title: payload.doc_area_title,
        outage_periods: periods,
        doc_time_start: payload.doc_time_start,
        doc_time_end: payload.doc_time_end,
        ...(hasCustomerCount ? { customer_count: customerCount.value } : {}),
        doc_area_detail: payload.doc_area_detail,
        map_link: payload.map_link,
        doc_status: "GENERATING",
        doc_url: null,
        doc_generated_at: null
      })
      .eq("id", jobId)
      .eq("updated_at", job.updated_at)
      .select("*")
      .single();

    if (updateError) {
      if (updateError.code === "PGRST116") {
        return NextResponse.json({ ok: false, error: "งานมีการแก้ไขระหว่างบันทึก กรุณาโหลดข้อมูลล่าสุดแล้วลองใหม่" }, { status: 409 });
      }
      throw new Error(updateError.message);
    }
    generationStarted = true;
    await runVulnerablePatientsCheck(supabase, jobId, payload.map_link);

    console.info("DOCX template path:", OUTAGE_TEMPLATE_PATH);
    console.info("DOCX template jobId:", jobId);
    console.info("DOCX generation mode: template");
    try {
      await fs.access(OUTAGE_TEMPLATE_PATH);
    } catch {
      const missingMessage =
        "Missing DOCX template at templates/outage_template.docx. See README: DOCX Template Setup.";
      console.error(missingMessage);
      await supabase
        .from("outage_jobs")
        .update({
          doc_status: "ERROR"
        })
        .eq("id", jobId);
      return NextResponse.json(
        {
          ok: false,
          error: missingMessage
        },
        { status: 500 }
      );
    }

    const buffer = await generateOutageDocxBuffer({ payload, job: savedJob });
    const bytes = new Uint8Array(buffer);

    const { error: finalizeError } = await supabase
      .from("outage_jobs")
      .update({
        doc_status: "GENERATED",
        doc_url: null,
        doc_generated_at: new Date().toISOString()
      })
      .eq("id", jobId)
      .eq("outage_date", savedJob.outage_date)
      .eq("outage_periods", JSON.stringify(periods))
      .select("id")
      .single();

    if (finalizeError) {
      if (finalizeError.code === "PGRST116") {
        return NextResponse.json({ ok: false, error: "วันหรือช่วงเวลาดับไฟมีการแก้ไขระหว่างสร้างเอกสาร กรุณาสร้างเอกสารใหม่" }, { status: 409 });
      }
      throw new Error(finalizeError.message);
    }

    const asciiName = toAsciiFilename(
      `outage-doc-${job.equipment_code ?? "JOB"}-${job.outage_date ?? ""}.docx`
    );
    const thaiName = `เอกสารดับไฟ-${job.equipment_code ?? "JOB"}-${
      job.outage_date ?? ""
    }.docx`;
    const contentDisposition = buildContentDisposition(asciiName, thaiName);

    if (process.env.NODE_ENV !== "production") {
      const hasOnlyAsciiOrPercentEncoding = /^[\x20-\x7E]+$/.test(
        contentDisposition
      );
      console.info("Docs create Content-Disposition:", contentDisposition, {
        hasOnlyAsciiOrPercentEncoding
      });
    }

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": contentDisposition,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    console.error("Doc generation failed", error);
    if (jobId && generationStarted) {
      try {
        const supabase = createSupabaseServerClient();
        await supabase
          .from("outage_jobs")
          .update({
            doc_status: "ERROR"
          })
          .eq("id", jobId);
      } catch (updateError) {
        console.error("Failed to update doc_status to ERROR", updateError);
      }
    }
    return NextResponse.json(
      { ok: false, error: "ไม่สามารถสร้างเอกสารได้ กรุณาลองใหม่" },
      { status: 500 }
    );
  }
}
