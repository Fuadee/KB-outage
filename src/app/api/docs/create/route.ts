import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import QRCode from "qrcode";
import { createDocsClient, createDriveClient } from "@/lib/google/googleClient";

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
const GOOGLE_DOC_TEMPLATE_ID = process.env.GOOGLE_DOC_TEMPLATE_ID;
const GOOGLE_DOC_FOLDER_ID = process.env.GOOGLE_DOC_FOLDER_ID;

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

function buildReplaceRequests(payload: DocPayload, job: any) {
  return [
    {
      replaceAllText: {
        containsText: { text: "{{DOC_ISSUE_DATE}}", matchCase: true },
        replaceText: payload.doc_issue_date
      }
    },
    {
      replaceAllText: {
        containsText: { text: "{{DOC_PURPOSE}}", matchCase: true },
        replaceText: payload.doc_purpose
      }
    },
    {
      replaceAllText: {
        containsText: { text: "{{DOC_AREA_TITLE}}", matchCase: true },
        replaceText: payload.doc_area_title
      }
    },
    {
      replaceAllText: {
        containsText: { text: "{{DOC_TIME_START}}", matchCase: true },
        replaceText: payload.doc_time_start
      }
    },
    {
      replaceAllText: {
        containsText: { text: "{{DOC_TIME_END}}", matchCase: true },
        replaceText: payload.doc_time_end
      }
    },
    {
      replaceAllText: {
        containsText: { text: "{{DOC_AREA_DETAIL}}", matchCase: true },
        replaceText: payload.doc_area_detail
      }
    },
    {
      replaceAllText: {
        containsText: { text: "{{MAP_LINK}}", matchCase: true },
        replaceText: payload.map_link
      }
    },
    {
      replaceAllText: {
        containsText: { text: "{{EQUIPMENT_CODE}}", matchCase: true },
        replaceText: job.equipment_code ?? ""
      }
    },
    {
      replaceAllText: {
        containsText: { text: "{{OUTAGE_DATE}}", matchCase: true },
        replaceText: job.outage_date ?? ""
      }
    }
  ];
}

function findPlaceholderRange(document: any, placeholder: string) {
  const content = document?.body?.content ?? [];
  for (const element of content) {
    const elements = element?.paragraph?.elements ?? [];
    for (const textElement of elements) {
      const textRun = textElement?.textRun?.content ?? "";
      const index = textRun.indexOf(placeholder);
      if (index !== -1) {
        const startIndex = (textElement.startIndex ?? 0) + index;
        return {
          startIndex,
          endIndex: startIndex + placeholder.length
        };
      }
    }
  }
  return null;
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

    if (!GOOGLE_DOC_TEMPLATE_ID) {
      throw new Error("Missing Google Doc template ID.");
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

    const drive = createDriveClient();
    const docs = createDocsClient();
    const computedName = `เอกสารดับไฟ-${job.equipment_code ?? "JOB"}-${
      job.outage_date ?? ""
    }`;

    const copyResponse = await drive.files.copy({
      fileId: GOOGLE_DOC_TEMPLATE_ID,
      requestBody: {
        name: computedName,
        parents: GOOGLE_DOC_FOLDER_ID ? [GOOGLE_DOC_FOLDER_ID] : undefined
      }
    });

    const newDocId = copyResponse.data.id;
    if (!newDocId) {
      throw new Error("Failed to create Google Doc.");
    }

    await docs.documents.batchUpdate({
      documentId: newDocId,
      requestBody: {
        requests: buildReplaceRequests(payload, job)
      }
    });

    const docResponse = await docs.documents.get({ documentId: newDocId });
    const qrRange = findPlaceholderRange(docResponse.data, "{{MAP_QR}}");
    if (!qrRange) {
      throw new Error("MAP_QR placeholder not found.");
    }

    const qrBuffer = await QRCode.toBuffer(payload.map_link, {
      type: "png",
      width: 240,
      margin: 1
    });
    const qrDataUri = `data:image/png;base64,${qrBuffer.toString("base64")}`;

    await docs.documents.batchUpdate({
      documentId: newDocId,
      requestBody: {
        requests: [
          {
            deleteContentRange: {
              range: qrRange
            }
          },
          {
            insertInlineImage: {
              location: { index: qrRange.startIndex },
              uri: qrDataUri,
              objectSize: {
                width: { magnitude: 120, unit: "PT" },
                height: { magnitude: 120, unit: "PT" }
              }
            }
          }
        ]
      }
    });

    const docUrl = `https://docs.google.com/document/d/${newDocId}/edit`;

    const { error: finalizeError } = await supabase
      .from("outage_jobs")
      .update({
        doc_status: "GENERATED",
        doc_url: docUrl,
        doc_generated_at: new Date().toISOString()
      })
      .eq("id", body.jobId);

    if (finalizeError) {
      throw new Error(finalizeError.message);
    }

    return NextResponse.json({ ok: true, docUrl });
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
