import { NextResponse } from "next/server";
import {
  DeliveryTrackingError,
  getDeliveryBatchWithTargetsByToken,
  markTargetDeliveredByToken,
  uploadDeliveryProof
} from "@/lib/deliveryTracking";

export const runtime = "nodejs";

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
        { ok: false, error: "กรุณาแนบรูปหลักฐาน" },
        { status: 400 }
      );
    }

    if (!proofFile.type.startsWith("image/")) {
      return NextResponse.json(
        { ok: false, error: "รองรับเฉพาะไฟล์รูปภาพ" },
        { status: 400 }
      );
    }

    const batchData = await getDeliveryBatchWithTargetsByToken(token);
    if (!batchData) {
      return NextResponse.json(
        { ok: false, error: "invalid token" },
        { status: 404 }
      );
    }

    const target = batchData.targets.find((item) => item.id === targetId);
    if (!target) {
      return NextResponse.json(
        { ok: false, error: "ไม่พบรายการที่ต้องการอัปเดต" },
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
        { ok: false, error: "ไม่สามารถบันทึกผลการแจ้งได้" },
        { status: 400 }
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
