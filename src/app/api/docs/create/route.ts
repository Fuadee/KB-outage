import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun
} from "docx";

export const runtime = "nodejs";

type DocPayload = {
  doc_issue_date: string;
  doc_purpose: string;
  doc_area_title: string;
  doc_time_start: string;
  doc_time_end: string;
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
  return (
    Boolean(payload.doc_issue_date) &&
    Boolean(payload.doc_purpose?.trim()) &&
    Boolean(payload.doc_area_title?.trim()) &&
    Boolean(payload.doc_time_start?.trim()) &&
    Boolean(payload.doc_time_end?.trim()) &&
    Boolean(payload.doc_area_detail?.trim()) &&
    Boolean(payload.map_link?.trim())
  );
}

function buildOutageDocument(payload: DocPayload, job: Record<string, unknown>) {
  const lines = [
    { label: "รหัสอุปกรณ์", value: job.equipment_code ?? "-" },
    { label: "วันที่ดับไฟ", value: job.outage_date ?? "-" },
    { label: "วันที่ออกหนังสือ", value: payload.doc_issue_date },
    { label: "วัตถุประสงค์", value: payload.doc_purpose },
    { label: "บริเวณที่ดับ", value: payload.doc_area_title },
    {
      label: "เวลา",
      value: `${payload.doc_time_start} - ${payload.doc_time_end}`
    },
    { label: "รายละเอียดพื้นที่ดับไฟ", value: payload.doc_area_detail },
    { label: "ลิงก์แผนที่", value: payload.map_link }
  ];

  return new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: "หนังสือแจ้งดับไฟ",
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER
          }),
          new Paragraph({ text: "" }),
          ...lines.map(
            (line) =>
              new Paragraph({
                children: [
                  new TextRun({ text: `${line.label}: `, bold: true }),
                  new TextRun({ text: String(line.value ?? "-") })
                ]
              })
          )
        ]
      }
    ]
  });
}

export async function POST(request: Request) {
  let jobId: string | number | undefined;
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

    const payload = body.payload as DocPayload;
    const { error: updateError } = await supabase
      .from("outage_jobs")
      .update({
        doc_issue_date: payload.doc_issue_date,
        doc_purpose: payload.doc_purpose,
        doc_area_title: payload.doc_area_title,
        doc_time_start: payload.doc_time_start,
        doc_time_end: payload.doc_time_end,
        doc_area_detail: payload.doc_area_detail,
        map_link: payload.map_link,
        doc_status: "GENERATING",
        doc_url: null,
        doc_generated_at: null
      })
      .eq("id", jobId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    const document = buildOutageDocument(payload, job);
    const buffer = await Packer.toBuffer(document);

    const { error: finalizeError } = await supabase
      .from("outage_jobs")
      .update({
        doc_status: "GENERATED",
        doc_url: null,
        doc_generated_at: new Date().toISOString()
      })
      .eq("id", jobId);

    if (finalizeError) {
      throw new Error(finalizeError.message);
    }

    const filename = `เอกสารดับไฟ-${job.equipment_code ?? "JOB"}-${
      job.outage_date ?? ""
    }.docx`;

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`
      }
    });
  } catch (error) {
    console.error("Doc generation failed", error);
    if (jobId) {
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
