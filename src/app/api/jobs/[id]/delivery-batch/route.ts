import { NextResponse } from "next/server";
import {
  DeliveryTrackingError,
  getDeliveryBatchWithTargetsByJobId,
  getOrCreateDeliveryBatchByJobId,
  regenerateDeliveryBatchToken,
  replaceDeliveryTargets
} from "@/lib/deliveryTracking";
import type { DeliveryTargetInput } from "@/types/deliveryTracking";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    if (!jobId?.trim()) {
      return NextResponse.json(
        { ok: false, error: "ไม่พบ job_id" },
        { status: 400 }
      );
    }
    const data = await getDeliveryBatchWithTargetsByJobId(jobId);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    console.error("Delivery batch GET failed", { error });
    return NextResponse.json(
      { ok: false, error: "ไม่สามารถโหลดข้อมูลติดตามการแจ้งได้" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    console.info("[delivery-api] POST incoming", { jobId });
    if (!jobId?.trim()) {
      return NextResponse.json(
        { ok: false, error: "ไม่พบ job_id" },
        { status: 400 }
      );
    }
    const body = (await request.json().catch(() => ({}))) as {
      regenerateToken?: boolean;
      targets?: DeliveryTargetInput[];
    };
    console.info("[delivery-api] POST body", {
      regenerateToken: body.regenerateToken ?? false,
      targetCount: Array.isArray(body.targets) ? body.targets.length : 0
    });

    const batch = body.regenerateToken
      ? await regenerateDeliveryBatchToken(jobId)
      : await getOrCreateDeliveryBatchByJobId(jobId);
    console.info("[delivery-api] batch resolved", { batchId: batch.id });

    const targets = Array.isArray(body.targets)
      ? await replaceDeliveryTargets(batch.id, body.targets)
      : await getDeliveryBatchWithTargetsByJobId(jobId).then((payload) => payload?.targets ?? []);

    return NextResponse.json({
      ok: true,
      data: {
        batch,
        targets
      }
    });
  } catch (error) {
    console.error("Delivery batch POST failed", { error });
    if (error instanceof DeliveryTrackingError) {
      const messageByCode: Record<string, string> = {
        MISSING_JOB_ID: "ไม่พบ job_id",
        BATCH_LOOKUP_FAILED: "ไม่สามารถค้นหา delivery batch ได้",
        BATCH_CREATE_FAILED: "ไม่สามารถสร้าง delivery batch ได้",
        TARGET_UPSERT_FAILED: "ไม่สามารถบันทึกรายการบางรายการได้",
        TARGET_DELETE_FAILED: "ไม่สามารถลบรายการเดิมได้",
        MISSING_SUPABASE_ENV: "เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า Supabase",
        MISSING_BATCH_ID: "ไม่พบ batch_id",
        TARGETS_LOOKUP_FAILED: "ไม่สามารถโหลดรายการเดิมได้"
      };

      return NextResponse.json(
        {
          ok: false,
          error: messageByCode[error.code] ?? error.message,
          code: error.code,
          details: error.details ?? null
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { ok: false, error: "ไม่สามารถบันทึกข้อมูลติดตามการแจ้งได้" },
      { status: 500 }
    );
  }
}
