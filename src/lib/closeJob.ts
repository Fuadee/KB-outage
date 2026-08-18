const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CloseJobSuccess = {
  ok: true;
  jobId: string;
  is_closed: true;
  closed_at: string | null;
  message?: string;
};

type CloseJobFailure = {
  ok: false;
  code?: string;
  error?: string;
};

export class CloseJobRequestError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "CloseJobRequestError";
    this.code = code;
    this.status = status;
  }
}

export function normalizeJobId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

export async function closeOutageJob(jobIdInput: string) {
  const jobId = normalizeJobId(jobIdInput);
  if (!jobId) {
    throw new CloseJobRequestError("รหัสงานไม่ถูกต้อง", "INVALID_JOB_ID", 400);
  }

  let response: Response;
  try {
    response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
  } catch {
    throw new CloseJobRequestError(
      "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบเครือข่ายแล้วลองใหม่",
      "NETWORK_ERROR",
      0
    );
  }

  const result = (await response.json().catch(() => null)) as
    | CloseJobSuccess
    | CloseJobFailure
    | null;

  if (!response.ok || !result?.ok) {
    const failure = result as CloseJobFailure | null;
    throw new CloseJobRequestError(
      failure?.error ?? "เซิร์ฟเวอร์ไม่สามารถปิดงานได้ กรุณาลองใหม่อีกครั้ง",
      failure?.code ?? "SERVER_ERROR",
      response.status
    );
  }

  if (normalizeJobId(result.jobId) !== jobId || result.is_closed !== true) {
    throw new CloseJobRequestError(
      "ผลการปิดงานจากเซิร์ฟเวอร์ไม่ตรงกับงานที่เลือก",
      "RESPONSE_MISMATCH",
      502
    );
  }

  return result;
}
