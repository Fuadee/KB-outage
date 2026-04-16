import { NextResponse } from "next/server";
import {
  DeliveryTrackingError,
  getDeliveryBatchWithTargetsByJobId,
  getOrCreateDeliveryBatchByJobId,
  regenerateDeliveryBatchToken,
  replaceDeliveryTargets
} from "@/lib/deliveryTracking";
import { createServerClient, getAuthTokens } from "@/lib/supabase/server";
import type { DeliveryTargetInput } from "@/types/deliveryTracking";

export const runtime = "nodejs";

const parsePgCode = (details: unknown) => {
  if (typeof details !== "object" || details === null) return "";
  if (!("code" in details)) return "";
  return String((details as { code?: string }).code ?? "");
};

const buildDeliveryErrorResponse = (error: DeliveryTrackingError) => {
  const detailCode = parsePgCode(error.details);
  const messageByCode: Record<string, string> = {
    MISSING_JOB_ID: "ไม่พบ job_id",
    BATCH_LOOKUP_FAILED: "ไม่สามารถค้นหา delivery batch ได้",
    BATCH_CREATE_FAILED: "ไม่สามารถสร้าง delivery batch ได้",
    BATCH_REFETCH_AFTER_CONFLICT_FAILED:
      "สร้าง batch ซ้ำพร้อมกันและไม่สามารถโหลดรายการเดิมได้",
    TARGET_UPSERT_FAILED: "ไม่สามารถบันทึกรายการบางรายการได้",
    TARGET_DELETE_FAILED: "ไม่สามารถลบรายการเดิมได้",
    MISSING_SUPABASE_ENV:
      "ระบบยังไม่ได้ตั้งค่า service role สำหรับ delivery tracking (ตั้งค่า SUPABASE_SERVICE_ROLE_KEY หรือ SERVICE_ROLE_KEY ที่ server)",
    MISSING_BATCH_ID: "ไม่พบ batch_id",
    TARGETS_LOOKUP_FAILED: "ไม่สามารถโหลดรายการเดิมได้"
  };

  if (detailCode === "42P01") {
    return NextResponse.json(
      {
        ok: false,
        error: "ยังไม่พบตาราง delivery_batches/delivery_targets (migration ยังไม่ถูก run)",
        code: "MIGRATION_MISSING",
        details: error.details ?? null
      },
      { status: 500 }
    );
  }

  if (detailCode === "42501") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "ไม่มีสิทธิ์เขียนข้อมูล delivery tracking: ตรวจ env service role key และ policy ของตาราง delivery_batches/delivery_targets",
        code: "PERMISSION_DENIED",
        details: error.details ?? null
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      ok: false,
      error: messageByCode[error.code] ?? error.message,
      code: error.code,
      details: error.details ?? null
    },
    { status: 500 }
  );
};

const ensureAuthenticated = async () => {
  const { accessToken } = getAuthTokens();
  if (!accessToken) return false;
  const authClient = createServerClient();
  const {
    data: { user },
    error
  } = await authClient.auth.getUser(accessToken);
  return Boolean(user) && !error;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const isAuthenticated = await ensureAuthenticated();
    if (!isAuthenticated) {
      return NextResponse.json(
        { ok: false, error: "UNAUTHENTICATED" },
        { status: 401 }
      );
    }

    const { id: jobId } = await params;
    if (!jobId?.trim()) {
      return NextResponse.json(
        { ok: false, error: "ไม่พบ job_id" },
        { status: 400 }
      );
    }
    const data = await getDeliveryBatchWithTargetsByJobId(jobId);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    console.error("Delivery batch GET failed", { error });
    if (error instanceof DeliveryTrackingError) {
      return buildDeliveryErrorResponse(error);
    }
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
    const isAuthenticated = await ensureAuthenticated();
    if (!isAuthenticated) {
      return NextResponse.json(
        { ok: false, error: "UNAUTHENTICATED" },
        { status: 401 }
      );
    }

    const { id: jobId } = await params;
    console.info("[delivery-api] POST incoming", { jobId });
    if (!jobId?.trim()) {
      return NextResponse.json(
        { ok: false, error: "ไม่พบ job_id" },
        { status: 400 }
      );
    }
    const body = (await request.json().catch(() => ({}))) as {
      regenerateToken?: boolean;
      targets?: DeliveryTargetInput[];
    };
    console.info("[delivery-api] POST body", {
      regenerateToken: body.regenerateToken ?? false,
      targetCount: Array.isArray(body.targets) ? body.targets.length : 0
    });

    const batch = body.regenerateToken
      ? await regenerateDeliveryBatchToken(jobId)
      : await getOrCreateDeliveryBatchByJobId(jobId);
    console.info("[delivery-api] batch resolved", { batchId: batch.id });

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
    console.error("Delivery batch POST failed", { error });
    if (error instanceof DeliveryTrackingError) {
      return buildDeliveryErrorResponse(error);
    }

    return NextResponse.json(
      { ok: false, error: "ไม่สามารถบันทึกข้อมูลติดตามการแจ้งได้" },
      { status: 500 }
    );
  }
}
