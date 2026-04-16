import { NextResponse } from "next/server";
import {
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
    console.error("Public delivery proof upload failed", error);
    return NextResponse.json(
      { ok: false, error: "ส่งหลักฐานไม่สำเร็จ กรุณาลองใหม่" },
      { status: 500 }
    );
  }
}
