import { NextResponse } from "next/server";
import {
  DeliveryTrackingError,
  getDeliveryBatchWithTargetsByToken,
  markTargetDeliveredByToken,
  uploadDeliveryProof
} from "@/lib/deliveryTracking";

export const runtime = "nodejs";
const MAX_PROOF_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(
  request: Request,
  {
    params
  }: {
    params: Promise<{ token: string; targetId: string }>;
  }
) {
  try {
    const { token, targetId } = await params;
    if (!token?.trim()) {
      return NextResponse.json(
        { ok: false, error: "ไม่พบ token สำหรับลิงก์ติดตาม" },
        { status: 400 }
      );
    }
    if (!targetId?.trim()) {
      return NextResponse.json(
        { ok: false, error: "ไม่พบ target ที่ต้องการอัปเดต" },
        { status: 400 }
      );
    }
    console.info("[delivery-public] proof upload incoming", { token: `${token.slice(0, 8)}...`, targetId });
    const formData = await request.formData();
    const proofFile = formData.get("proof");
    const deliveredByName = formData.get("deliveredByName")?.toString();

    if (!(proofFile instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "ไม่พบไฟล์ที่อัปโหลด", code: "PROOF_FILE_MISSING" },
        { status: 400 }
      );
    }

    if (!proofFile.type.startsWith("image/")) {
      return NextResponse.json(
        { ok: false, error: "ประเภทไฟล์ไม่ถูกต้อง (อนุญาตเฉพาะ image/*)", code: "PROOF_FILE_INVALID_TYPE" },
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

    const batchData = await getDeliveryBatchWithTargetsByToken(token);
    if (!batchData) {
      return NextResponse.json(
        { ok: false, error: "token หรือ target ไม่ถูกต้อง: token ไม่ถูกต้องหรือหมดอายุ", code: "INVALID_TOKEN" },
        { status: 401 }
      );
    }

    const target = batchData.targets.find((item) => item.id === targetId);
    if (!target) {
      return NextResponse.json(
        { ok: false, error: "token หรือ target ไม่ถูกต้อง: target นี้ไม่ได้อยู่ใน batch ของลิงก์นี้", code: "TARGET_NOT_IN_TOKEN_BATCH" },
        { status: 404 }
      );
    }

    const proofImageUrl = await uploadDeliveryProof({
      batchId: batchData.batch.id,
      targetId,
      file: proofFile
    });

    const updated = await markTargetDeliveredByToken({
      token,
      targetId,
      proofImageUrl,
      deliveredByName
    });

    if (!updated) {
      return NextResponse.json(
        { ok: false, error: "update delivery target หลัง upload ไม่สำเร็จ", code: "DELIVERY_TARGET_UPDATE_FAILED" },
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
    console.error("Public delivery proof upload failed", { error });
    if (error instanceof DeliveryTrackingError) {
      if (error.code === "MISSING_SUPABASE_ENV") {
        return NextResponse.json(
          {
            ok: false,
            error: "ไม่พบ service role key",
            code: "MISSING_SERVICE_ROLE_KEY",
            details: error.details ?? null
          },
          { status: 500 }
        );
      }
      const detailCode =
        typeof error.details === "object" &&
        error.details !== null &&
        "code" in error.details
          ? String((error.details as { code?: string }).code ?? "")
          : "";
      if (detailCode === "42501") {
        return NextResponse.json(
          {
            ok: false,
            error:
              "เซิร์ฟเวอร์ไม่มีสิทธิ์อัปเดตสถานะจัดส่ง (ตรวจ env service role key และ policy ของ delivery_targets)",
            code: "PERMISSION_DENIED",
            details: error.details ?? null
          },
          { status: 500 }
        );
      }
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          code: error.code,
          details: error.details ?? null
        },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { ok: false, error: "ส่งหลักฐานไม่สำเร็จ กรุณาลองใหม่" },
      { status: 500 }
    );
  }
}
