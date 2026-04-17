import { NextResponse } from "next/server";
import { DeliveryTrackingError } from "@/lib/deliveryTracking";
import { createServerClient, getAuthTokens } from "@/lib/supabase/server";

const parsePgCode = (details: unknown) => {
  if (typeof details !== "object" || details === null) return "";
  if (!("code" in details)) return "";
  return String((details as { code?: string }).code ?? "");
};

export const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export const buildDeliveryErrorResponse = (error: DeliveryTrackingError) => {
  const detailCode = parsePgCode(error.details);
  const messageByCode: Record<string, string> = {
    MISSING_JOB_ID: "ไม่พบ job_id",
    INVALID_JOB_ID: "job_id ไม่ถูกต้อง",
    BATCH_LOOKUP_FAILED: "ไม่สามารถค้นหา delivery batch ได้",
    BATCH_CREATE_FAILED: "ไม่สามารถสร้าง delivery batch ได้",
    BATCH_NOT_FOUND: "ยังไม่มีลิงก์สำหรับงานนี้ กรุณากด “สร้างลิงก์” ก่อนบันทึกรายการ",
    BATCH_REFETCH_AFTER_CONFLICT_FAILED:
      "สร้าง batch ซ้ำพร้อมกันและไม่สามารถโหลดรายการเดิมได้",
    TARGET_UPSERT_FAILED: "ไม่สามารถบันทึกรายการบางรายการได้",
    TARGET_DELETE_FAILED: "ไม่สามารถลบรายการเดิมได้",
    MISSING_SUPABASE_ENV:
      "ระบบยังไม่ได้ตั้งค่า service role สำหรับ delivery tracking (ตั้งค่า SUPABASE_SERVICE_ROLE_KEY หรือ SERVICE_ROLE_KEY ที่ server)",
    INVALID_SERVICE_ROLE_KEY:
      "service role key ไม่ถูกต้องหรือไม่ใช่ service_role",
    MISSING_BATCH_ID: "ไม่พบ batch_id",
    TARGETS_LOOKUP_FAILED: "ไม่สามารถโหลดรายการเดิมได้",
    TOKEN_REGENERATE_FAILED: "token generation ล้มเหลว"
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
          "ไม่มีสิทธิ์เขียนข้อมูล delivery tracking: service role key อาจไม่ถูกต้อง หรือ policy ยังไม่อนุญาต role service_role",
        code: "PERMISSION_DENIED",
        details: error.details ?? null
      },
      { status: 500 }
    );
  }

  if (error.code === "TARGET_UPSERT_FAILED") {
    const itemNumber =
      typeof error.details === "object" && error.details !== null && "itemNumber" in error.details
        ? (error.details as { itemNumber?: number }).itemNumber
        : null;

    return NextResponse.json(
      {
        ok: false,
        error: itemNumber
          ? `ไม่สามารถบันทึกรายการลำดับที่ ${itemNumber} ได้`
          : "ไม่สามารถบันทึกรายการบางรายการได้",
        code: error.code,
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

export const ensureAuthenticated = async () => {
  const { accessToken } = getAuthTokens();
  if (!accessToken) return false;
  const authClient = createServerClient();
  const {
    data: { user },
    error
  } = await authClient.auth.getUser(accessToken);
  return Boolean(user) && !error;
};
