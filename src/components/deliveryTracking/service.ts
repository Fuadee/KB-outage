import type { DeliveryTarget } from "@/types/deliveryTracking";
import { toEditableTarget, type EditableTarget } from "./types";

type BatchResponse = {
  ok: boolean;
  error?: string;
  data?: {
    targets?: DeliveryTarget[];
  };
};

type UploadProofResponse = {
  ok: boolean;
  error?: string;
  data?: {
    id: string;
    status: "pending" | "delivered";
    delivered_at: string | null;
    proof_image_url: string | null;
  };
};

const parseJson = async <T>(response: Response): Promise<T | null> => {
  return (await response.json().catch(() => null)) as T | null;
};

export async function fetchDeliveryTargetsByJobId(jobId: string): Promise<EditableTarget[]> {
  const response = await fetch(`/api/jobs/${jobId}/delivery-batch`, { method: "GET" });
  const result = await parseJson<BatchResponse>(response);

  if (!response.ok || !result?.ok) {
    throw new Error(result?.error ?? "โหลดข้อมูลไม่สำเร็จ");
  }

  return (result.data?.targets ?? []).map((target) => toEditableTarget(target));
}

export async function persistDeliveryTargetsByJobId(jobId: string, targets: unknown[]) {
  const response = await fetch(`/api/jobs/${jobId}/delivery-batch/targets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targets })
  });

  const result = await parseJson<BatchResponse>(response);

  if (!response.ok || !result?.ok) {
    throw new Error(result?.error ?? "บันทึกไม่สำเร็จ");
  }

  return (result.data?.targets ?? []).map((target) => toEditableTarget(target));
}

export async function uploadDeliveryProofForJobId(jobId: string, targetId: string, file: File) {
  const formData = new FormData();
  formData.append("proof", file);

  const response = await fetch(`/api/jobs/${jobId}/delivery-batch/targets/${targetId}/proof`, {
    method: "POST",
    body: formData
  });

  const result = await parseJson<UploadProofResponse>(response);

  if (!response.ok || !result?.ok || !result.data) {
    throw new Error(result?.error ?? "อัปโหลดรูปไม่สำเร็จ");
  }

  return result.data;
}
