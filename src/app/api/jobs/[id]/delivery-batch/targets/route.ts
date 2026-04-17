import { NextResponse } from "next/server";
import {
  DeliveryTrackingError,
  getDeliveryBatchWithTargetsByJobId,
  replaceDeliveryTargets
} from "@/lib/deliveryTracking";
import type { DeliveryTargetInput } from "@/types/deliveryTracking";
import { buildDeliveryErrorResponse, ensureAuthenticated, isUuid } from "../_shared";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const isAuthenticated = await ensureAuthenticated();
    if (!isAuthenticated) {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const { id: jobId } = await params;
    if (!jobId?.trim()) {
      return NextResponse.json({ ok: false, error: "ไม่พบ job_id" }, { status: 400 });
    }
    if (!isUuid(jobId)) {
      return NextResponse.json(
        { ok: false, error: "job_id ไม่ถูกต้อง", code: "INVALID_JOB_ID" },
        { status: 400 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      targets?: DeliveryTargetInput[];
    };

    if (!Array.isArray(body.targets)) {
      return NextResponse.json(
        { ok: false, error: "ไม่พบ targets", code: "TARGETS_REQUIRED" },
        { status: 400 }
      );
    }

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
    return NextResponse.json({
      ok: true,
      data: {
        batch: existing.batch,
        targets
      }
    });
  } catch (error) {
    console.error("Delivery targets POST failed", { error });
    if (error instanceof DeliveryTrackingError) {
      return buildDeliveryErrorResponse(error);
    }
    return NextResponse.json(
      { ok: false, error: "ไม่สามารถบันทึกรายการติดตามการแจ้งได้" },
      { status: 500 }
    );
  }
}
