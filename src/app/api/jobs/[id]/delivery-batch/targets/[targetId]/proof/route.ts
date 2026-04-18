import { NextResponse } from "next/server";
import {
  DeliveryTrackingError,
  getDeliveryBatchWithTargetsByJobId,
  markTargetDeliveredByToken,
  uploadDeliveryProof
} from "@/lib/deliveryTracking";
import { buildDeliveryErrorResponse, ensureAuthenticated, isUuid } from "../../../_shared";

export const runtime = "nodejs";
const MAX_PROOF_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; targetId: string }> }
) {
  try {
    const isAuthenticated = await ensureAuthenticated();
    if (!isAuthenticated) {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const { id: jobId, targetId } = await params;

    if (!jobId?.trim()) {
      return NextResponse.json({ ok: false, error: "ไม่พบ job_id" }, { status: 400 });
    }
    if (!isUuid(jobId)) {
      return NextResponse.json(
        { ok: false, error: "job_id ไม่ถูกต้อง", code: "INVALID_JOB_ID" },
        { status: 400 }
      );
    }
    if (!targetId?.trim()) {
      return NextResponse.json(
        { ok: false, error: "ไม่พบ target ที่ต้องการอัปเดต" },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const proofFile = formData.get("proof");

    if (!(proofFile instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "ไม่พบไฟล์ที่อัปโหลด", code: "PROOF_FILE_MISSING" },
        { status: 400 }
      );
    }

    if (!proofFile.type.startsWith("image/")) {
      return NextResponse.json(
        {
          ok: false,
          error: "ประเภทไฟล์ไม่ถูกต้อง (อนุญาตเฉพาะ image/*)",
          code: "PROOF_FILE_INVALID_TYPE"
        },
        { status: 400 }
      );
    }

    if (proofFile.size <= 0) {
      return NextResponse.json(
        { ok: false, error: "ไม่พบไฟล์ที่อัปโหลด", code: "PROOF_FILE_EMPTY" },
        { status: 400 }
      );
    }

    if (proofFile.size > MAX_PROOF_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { ok: false, error: "ขนาดไฟล์เกินกำหนด (สูงสุด 10MB)", code: "PROOF_FILE_TOO_LARGE" },
        { status: 400 }
      );
    }

    const batchData = await getDeliveryBatchWithTargetsByJobId(jobId);
    if (!batchData) {
      return NextResponse.json(
        { ok: false, error: "ไม่พบชุดข้อมูลติดตามสำหรับงานนี้", code: "BATCH_NOT_FOUND" },
        { status: 404 }
      );
    }

    const target = batchData.targets.find((item) => item.id === targetId);

    if (!target) {
      return NextResponse.json(
        {
          ok: false,
          error: "ไม่พบรายการลูกค้าในงานนี้",
          code: "TARGET_NOT_IN_JOB_BATCH"
        },
        { status: 404 }
      );
    }

    const proofImageUrl = await uploadDeliveryProof({
      batchId: batchData.batch.id,
      targetId,
      file: proofFile
    });

    const updated = await markTargetDeliveredByToken({
      token: batchData.batch.access_token,
      targetId,
      proofImageUrl
    });

    if (!updated) {
      return NextResponse.json(
        { ok: false, error: "อัปเดตสถานะจัดส่งไม่สำเร็จ", code: "DELIVERY_TARGET_UPDATE_FAILED" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        id: updated.id,
        status: updated.status,
        delivered_at: updated.delivered_at,
        proof_image_url: updated.proof_image_url
      }
    });
  } catch (error) {
    console.error("Delivery target proof upload failed", { error });
    if (error instanceof DeliveryTrackingError) {
      return buildDeliveryErrorResponse(error);
    }
    return NextResponse.json(
      { ok: false, error: "ส่งหลักฐานไม่สำเร็จ กรุณาลองใหม่" },
      { status: 500 }
    );
  }
}
