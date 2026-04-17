import { NextResponse } from "next/server";
import {
  DeliveryTrackingError,
  getDeliveryBatchWithTargetsByJobId,
  getOrCreateDeliveryBatchByJobId,
  regenerateDeliveryBatchToken,
  replaceDeliveryTargets
} from "@/lib/deliveryTracking";
import type { DeliveryTargetInput } from "@/types/deliveryTracking";
import { buildDeliveryErrorResponse, ensureAuthenticated, isUuid } from "./_shared";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const isAuthenticated = await ensureAuthenticated();
    if (!isAuthenticated) {
      return NextResponse.json(
        { ok: false, error: "UNAUTHENTICATED" },
        { status: 401 }
      );
    }

    const { id: jobId } = await params;
    if (!jobId?.trim()) {
      return NextResponse.json(
        { ok: false, error: "ไม่พบ job_id" },
        { status: 400 }
      );
    }
    if (!isUuid(jobId)) {
      return NextResponse.json(
        { ok: false, error: "job_id ไม่ถูกต้อง", code: "INVALID_JOB_ID" },
        { status: 400 }
      );
    }
    const data = await getDeliveryBatchWithTargetsByJobId(jobId);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    console.error("Delivery batch GET failed", { error });
    if (error instanceof DeliveryTrackingError) {
      return buildDeliveryErrorResponse(error);
    }
    return NextResponse.json(
      { ok: false, error: "ไม่สามารถโหลดข้อมูลติดตามการแจ้งได้" },
      { status: 500 }
    );
  }
}

// Deprecated compatibility endpoint. Prefer explicit intent routes:
// - POST /delivery-batch/targets
// - POST /delivery-batch/token
// - POST /delivery-batch/token/regenerate
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const isAuthenticated = await ensureAuthenticated();
    if (!isAuthenticated) {
      return NextResponse.json(
        { ok: false, error: "UNAUTHENTICATED" },
        { status: 401 }
      );
    }

    const { id: jobId } = await params;
    if (!jobId?.trim()) {
      return NextResponse.json(
        { ok: false, error: "ไม่พบ job_id" },
        { status: 400 }
      );
    }
    if (!isUuid(jobId)) {
      return NextResponse.json(
        { ok: false, error: "job_id ไม่ถูกต้อง", code: "INVALID_JOB_ID" },
        { status: 400 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      regenerateToken?: boolean;
      targets?: DeliveryTargetInput[];
    };

    if (body.regenerateToken) {
      const batch = await regenerateDeliveryBatchToken(jobId);
      return NextResponse.json({ ok: true, data: { batch } });
    }

    if (Array.isArray(body.targets)) {
      const existing = await getDeliveryBatchWithTargetsByJobId(jobId);
      if (!existing?.batch?.id) {
        return NextResponse.json(
          {
            ok: false,
            error: "ยังไม่มีลิงก์สำหรับงานนี้ กรุณากด “สร้างลิงก์” ก่อนบันทึกรายการ",
            code: "BATCH_NOT_FOUND"
          },
          { status: 400 }
        );
      }
      const targets = await replaceDeliveryTargets(existing.batch.id, body.targets);
      return NextResponse.json({ ok: true, data: { batch: existing.batch, targets } });
    }

    const batch = await getOrCreateDeliveryBatchByJobId(jobId);
    return NextResponse.json({ ok: true, data: { batch } });
  } catch (error) {
    console.error("Delivery batch POST failed", { error });
    if (error instanceof DeliveryTrackingError) {
      return buildDeliveryErrorResponse(error);
    }

    return NextResponse.json(
      { ok: false, error: "ไม่สามารถบันทึกข้อมูลติดตามการแจ้งได้" },
      { status: 500 }
    );
  }
}
