import { NextResponse } from "next/server";
import {
  getDeliveryBatchByToken,
  getDeliveryBatchWithTargetsByToken,
  getDeliveryMapUrl,
  getLatestActiveDeliveryBatchByJobId,
  listDeliveryTargetsByBatchId
} from "@/lib/deliveryTracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    if (!token?.trim()) {
      return NextResponse.json(
        { ok: false, error: "ไม่พบ token สำหรับลิงก์ติดตาม" },
        { status: 400 }
      );
    }
    const tokenBatch = await getDeliveryBatchByToken(token);

    console.info("[delivery-public] token lookup", {
      token,
      found: Boolean(tokenBatch),
      batch_id: tokenBatch?.id ?? null,
      job_id: tokenBatch?.job_id ?? null,
      is_active: tokenBatch?.is_active ?? null
    });

    if (!tokenBatch) {
      return NextResponse.json(
        { ok: false, error: "invalid token", code: "TOKEN_NOT_FOUND" },
        { status: 404 }
      );
    }

    if (!tokenBatch.is_active) {
      return NextResponse.json(
        {
          ok: false,
          error: "ลิงก์นี้เป็น token เก่าที่ถูกปิดใช้งานแล้ว",
          code: "TOKEN_INACTIVE"
        },
        { status: 410 }
      );
    }

    const latestActiveBatch = await getLatestActiveDeliveryBatchByJobId(tokenBatch.job_id);
    if (latestActiveBatch && latestActiveBatch.access_token !== token) {
      return NextResponse.json(
        {
          ok: false,
          error: "ลิงก์นี้ไม่ใช่ token ล่าสุด กรุณาขอลิงก์ใหม่จากผู้ดูแล",
          code: "TOKEN_NOT_LATEST",
          data: {
            requested_batch_id: tokenBatch.id,
            latest_batch_id: latestActiveBatch.id
          }
        },
        { status: 409 }
      );
    }

    const batchTargets = await listDeliveryTargetsByBatchId(tokenBatch.id);
    console.info("[delivery-public] resolved batch targets", {
      token,
      batch_id: tokenBatch.id,
      target_ids: batchTargets.map((target) => target.id)
    });

    const data = await getDeliveryBatchWithTargetsByToken(token);

    if (!data) {
      return NextResponse.json(
        { ok: false, error: "invalid token" },
        { status: 404 }
      );
    }

    const mappedTargets = data.targets.map((target) => {
      return {
        id: target.id,
        batch_id: target.batch_id,
        company_name: target.company_name,
        contact_name: target.contact_name,
        note: target.note,
        status: target.status,
        delivered_at: target.delivered_at,
        map_url: getDeliveryMapUrl(target),
        proof_image_url: target.proof_image_url
      };
    });
    const deliveredCount = mappedTargets.filter((target) => target.status === "delivered").length;

    const responsePayload = {
      ok: true,
      data: {
        batch: {
          id: data.batch.id,
          job_id: data.batch.job_id
        },
        job: data.job,
        summary: {
          total: mappedTargets.length,
          delivered: deliveredCount,
          pending: mappedTargets.length - deliveredCount
        },
        targets: mappedTargets
      }
    };

    console.info("[delivery-public] list payload fetched", {
      token,
      resolved_batch_id: data.batch.id,
      summary: responsePayload.data.summary,
      targets: responsePayload.data.targets.map((target) => ({
        id: target.id,
        batch_id: target.batch_id,
        company_name: target.company_name,
        status: target.status,
        delivered_at: target.delivered_at,
        proof_image_url: target.proof_image_url
      }))
    });

    return NextResponse.json(responsePayload, {
      headers: {
        "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate"
      }
    });
  } catch (error) {
    console.error("Public delivery GET failed", error);
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "BATCH_TOKEN_LOOKUP_FAILED"
    ) {
      return NextResponse.json(
        { ok: false, error: "ไม่สามารถตรวจสอบ token ได้ กรุณาลองใหม่" },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { ok: false, error: "ไม่สามารถโหลดข้อมูลได้" },
      { status: 500 }
    );
  }
}
