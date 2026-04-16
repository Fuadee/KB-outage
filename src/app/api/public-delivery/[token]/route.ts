import { NextResponse } from "next/server";
import { getDeliveryBatchWithTargetsByToken, getDeliveryMapUrl } from "@/lib/deliveryTracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isDeliveredTarget = (target: {
  status: string;
  delivered_at: string | null;
  proof_image_url: string | null;
}) => target.status === "delivered" || Boolean(target.delivered_at) || Boolean(target.proof_image_url);

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
    const data = await getDeliveryBatchWithTargetsByToken(token);

    if (!data) {
      return NextResponse.json(
        { ok: false, error: "invalid token" },
        { status: 404 }
      );
    }

    const mappedTargets = data.targets.map((target) => {
      const derivedDelivered = isDeliveredTarget(target);
      return {
        id: target.id,
        company_name: target.company_name,
        contact_name: target.contact_name,
        note: target.note,
        status: derivedDelivered ? "delivered" : "pending",
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
      token: `${token.slice(0, 8)}...`,
      summary: responsePayload.data.summary,
      targets: responsePayload.data.targets.map((target) => ({
        id: target.id,
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
