import { NextResponse } from "next/server";
import { getDeliveryBatchWithTargetsByToken, getDeliveryMapUrl } from "@/lib/deliveryTracking";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const data = await getDeliveryBatchWithTargetsByToken(token);

    if (!data) {
      return NextResponse.json(
        { ok: false, error: "invalid token" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        batch: {
          id: data.batch.id,
          job_id: data.batch.job_id
        },
        job: data.job,
        summary: data.summary,
        targets: data.targets.map((target) => ({
          id: target.id,
          company_name: target.company_name,
          contact_name: target.contact_name,
          note: target.note,
          status: target.status,
          delivered_at: target.delivered_at,
          map_url: getDeliveryMapUrl(target),
          proof_image_url: target.proof_image_url
        }))
      }
    });
  } catch (error) {
    console.error("Public delivery GET failed", error);
    return NextResponse.json(
      { ok: false, error: "ไม่สามารถโหลดข้อมูลได้" },
      { status: 500 }
    );
  }
}
