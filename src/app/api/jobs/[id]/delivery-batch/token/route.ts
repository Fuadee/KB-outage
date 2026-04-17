import { NextResponse } from "next/server";
import {
  DeliveryTrackingError,
  getOrCreateDeliveryBatchByJobId
} from "@/lib/deliveryTracking";
import { buildDeliveryErrorResponse, ensureAuthenticated, isUuid } from "../_shared";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
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

    const batch = await getOrCreateDeliveryBatchByJobId(jobId);
    return NextResponse.json({ ok: true, data: { batch } });
  } catch (error) {
    console.error("Delivery token POST failed", { error });
    if (error instanceof DeliveryTrackingError) {
      return buildDeliveryErrorResponse(error);
    }
    return NextResponse.json(
      { ok: false, error: "ไม่สามารถสร้างลิงก์ติดตามการแจ้งได้" },
      { status: 500 }
    );
  }
}
