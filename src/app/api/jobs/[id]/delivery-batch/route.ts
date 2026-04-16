import { NextResponse } from "next/server";
import {
  getDeliveryBatchWithTargetsByJobId,
  getOrCreateDeliveryBatchByJobId,
  regenerateDeliveryBatchToken,
  replaceDeliveryTargets
} from "@/lib/deliveryTracking";
import type { DeliveryTargetInput } from "@/types/deliveryTracking";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    const data = await getDeliveryBatchWithTargetsByJobId(jobId);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    console.error("Delivery batch GET failed", error);
    return NextResponse.json(
      { ok: false, error: "ไม่สามารถโหลดข้อมูลติดตามการแจ้งได้" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      regenerateToken?: boolean;
      targets?: DeliveryTargetInput[];
    };

    const batch = body.regenerateToken
      ? await regenerateDeliveryBatchToken(jobId)
      : await getOrCreateDeliveryBatchByJobId(jobId);

    const targets = Array.isArray(body.targets)
      ? await replaceDeliveryTargets(batch.id, body.targets)
      : await getDeliveryBatchWithTargetsByJobId(jobId).then((payload) => payload?.targets ?? []);

    return NextResponse.json({
      ok: true,
      data: {
        batch,
        targets
      }
    });
  } catch (error) {
    console.error("Delivery batch POST failed", error);
    return NextResponse.json(
      { ok: false, error: "ไม่สามารถบันทึกข้อมูลติดตามการแจ้งได้" },
      { status: 500 }
    );
  }
}
