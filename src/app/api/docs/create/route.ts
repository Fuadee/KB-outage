import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function createSupabaseServerClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Missing Supabase env vars.");
  }
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
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

function buildTableRow(label: string, value: string) {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 35, type: WidthType.PERCENTAGE },
        children: [
          new Paragraph({
            children: [new TextRun({ text: label, bold: true })]
          })
        ]
      }),
      new TableCell({
        width: { size: 65, type: WidthType.PERCENTAGE },
        children: [new Paragraph({ text: value || "-" })]
      })
    ]
  });
}

function buildOutageDocument(payload: DocPayload, job: any) {
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
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              buildTableRow("รหัสอุปกรณ์", job.equipment_code ?? "-"),
              buildTableRow("วันที่ดับไฟ", job.outage_date ?? "-"),
              buildTableRow("วันที่ออกหนังสือ", payload.doc_issue_date),
              buildTableRow("วัตถุประสงค์", payload.doc_purpose),
              buildTableRow("บริเวณที่ดับ", payload.doc_area_title),
              buildTableRow(
                "เวลา",
                `${payload.doc_time_start} - ${payload.doc_time_end}`
              ),
              buildTableRow("รายละเอียดพื้นที่ดับไฟ", payload.doc_area_detail),
              buildTableRow("ลิงก์แผนที่", payload.map_link)
            ]
          })
        ]
      }
    ]
  });
}

export async function POST(request: Request) {
  let jobId: string | undefined;
  try {
    const body = (await request.json()) as CreateDocRequest;
    jobId = body?.jobId;
    if (!body?.jobId || !body?.payload || !isPayloadValid(body.payload)) {
      return NextResponse.json(
        { ok: false, error: "กรุณากรอกข้อมูลให้ครบถ้วน" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseServerClient();
    const { data: job, error: jobError } = await supabase
      .from("outage_jobs")
      .select("*")
      .eq("id", body.jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { ok: false, error: "ไม่พบข้อมูลงานที่ต้องการ" },
        { status: 404 }
      );
    }

    const payload = body.payload;

    // Persist form data and mark as generating before building the document.
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
      .eq("id", body.jobId);

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
      .eq("id", body.jobId);

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
