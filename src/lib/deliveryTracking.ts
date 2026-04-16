import { randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";
import type {
  DeliveryBatch,
  DeliveryBatchWithTargets,
  DeliverySummary,
  DeliveryTarget,
  DeliveryTargetInput
} from "@/types/deliveryTracking";

export class DeliveryTrackingError extends Error {
  code: string;
  details?: unknown;

  constructor(message: string, code: string, details?: unknown) {
    super(message);
    this.name = "DeliveryTrackingError";
    this.code = code;
    this.details = details;
  }
}

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_ENV_CANDIDATES = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY"
] as const;

const resolveServiceRoleKey = () => {
  for (const key of SERVICE_ROLE_ENV_CANDIDATES) {
    const value = process.env[key];
    if (value?.trim()) {
      return { keyName: key, value };
    }
  }
  return null;
};

export const DELIVERY_PROOFS_BUCKET = "delivery-proofs";

const createAdminClient = () => {
  const serviceRole = resolveServiceRoleKey();
  if (!SUPABASE_URL || !serviceRole?.value) {
    throw new DeliveryTrackingError(
      "ระบบยังไม่ได้ตั้งค่า Supabase service role สำหรับ delivery tracking (รองรับ SUPABASE_SERVICE_ROLE_KEY / SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY)",
      "MISSING_SUPABASE_ENV"
    );
  }
  if (serviceRole.keyName === "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY") {
    console.warn(
      "[delivery] Using NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY as fallback. Move this key to server-only SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(SUPABASE_URL, serviceRole.value, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
};

const normalizeText = (value?: string | null) => {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeMapLink = (value?: string | null) => {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (/^https?:\/\//i.test(normalized)) return normalized;
  return `https://${normalized}`;
};

const buildMapUrl = (target: Pick<DeliveryTarget, "latitude" | "longitude" | "map_link">) => {
  if (target.map_link) return target.map_link;
  if (target.latitude !== null && target.longitude !== null) {
    return `https://www.google.com/maps?q=${target.latitude},${target.longitude}`;
  }
  return null;
};

export const getDeliveryMapUrl = buildMapUrl;

const toSummary = (targets: DeliveryTarget[]): DeliverySummary => {
  const delivered = targets.filter((target) => target.status === "delivered").length;
  return {
    total: targets.length,
    delivered,
    pending: targets.length - delivered
  };
};

export const generateDeliveryToken = () => randomBytes(24).toString("hex");

export async function getOrCreateDeliveryBatchByJobId(jobId: string) {
  if (!jobId?.trim()) {
    throw new DeliveryTrackingError("Missing job id", "MISSING_JOB_ID");
  }
  const supabase = createAdminClient();
  console.info("[delivery] getOrCreateDeliveryBatchByJobId:start", { jobId });

  const { data: existing, error: findError } = await supabase
    .from("delivery_batches")
    .select("*")
    .eq("job_id", jobId)
    .maybeSingle<DeliveryBatch>();

  if (findError) {
    console.error("[delivery] getOrCreateDeliveryBatchByJobId:lookup_error", {
      jobId,
      findError
    });
    throw new DeliveryTrackingError(
      "Cannot lookup delivery batch",
      "BATCH_LOOKUP_FAILED",
      findError
    );
  }

  if (existing) {
    console.info("[delivery] getOrCreateDeliveryBatchByJobId:existing_batch", {
      jobId,
      batchId: existing.id
    });
    return existing;
  }

  const token = generateDeliveryToken();
  const { data, error } = await supabase
    .from("delivery_batches")
    .insert({
      job_id: jobId,
      access_token: token,
      is_active: true
    })
    .select("*")
    .single<DeliveryBatch>();

  if (error || !data) {
    const pgCode = (error as { code?: string } | null)?.code;
    if (pgCode === "23505") {
      console.warn("[delivery] getOrCreateDeliveryBatchByJobId:unique_conflict_refetch", {
        jobId,
        error
      });
      const { data: refetched, error: refetchError } = await supabase
        .from("delivery_batches")
        .select("*")
        .eq("job_id", jobId)
        .maybeSingle<DeliveryBatch>();
      if (refetchError) {
        throw new DeliveryTrackingError(
          "Cannot re-fetch delivery batch after unique conflict",
          "BATCH_REFETCH_AFTER_CONFLICT_FAILED",
          refetchError
        );
      }
      if (refetched) return refetched;
    }

    console.error("[delivery] getOrCreateDeliveryBatchByJobId:create_error", {
      jobId,
      error
    });
    throw new DeliveryTrackingError(
      "Cannot create delivery batch",
      "BATCH_CREATE_FAILED",
      error
    );
  }

  console.info("[delivery] getOrCreateDeliveryBatchByJobId:created_batch", {
    jobId,
    batchId: data.id
  });
  return data;
}

export async function regenerateDeliveryBatchToken(jobId: string) {
  const supabase = createAdminClient();
  const token = generateDeliveryToken();

  const { data, error } = await supabase
    .from("delivery_batches")
    .update({ access_token: token })
    .eq("job_id", jobId)
    .select("*")
    .single<DeliveryBatch>();

  if (error || !data) {
    throw new DeliveryTrackingError(
      "Unable to regenerate token",
      "TOKEN_REGENERATE_FAILED",
      error
    );
  }

  return data;
}

export async function listDeliveryTargetsByBatchId(batchId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("delivery_targets")
    .select("*")
    .eq("batch_id", batchId)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) {
    throw new DeliveryTrackingError(
      "Unable to list delivery targets",
      "TARGETS_LIST_FAILED",
      error
    );
  }

  return (data ?? []) as DeliveryTarget[];
}

export async function replaceDeliveryTargets(batchId: string, targets: DeliveryTargetInput[]) {
  if (!batchId?.trim()) {
    throw new DeliveryTrackingError("Missing batch id", "MISSING_BATCH_ID");
  }

  const supabase = createAdminClient();
  const { data: existingTargets, error: existingError } = await supabase
    .from("delivery_targets")
    .select("id, status")
    .eq("batch_id", batchId);
  if (existingError) {
    throw new DeliveryTrackingError(
      "Unable to lookup existing targets",
      "TARGETS_LOOKUP_FAILED",
      existingError
    );
  }

  const existingStatusMap = new Map(
    (existingTargets ?? []).map((row) => [row.id as string, row.status as string])
  );

  const sanitized = targets
    .map((target, index) => ({
      id: target.id,
      batch_id: batchId,
      company_name: target.company_name.trim(),
      contact_name: normalizeText(target.contact_name),
      note: normalizeText(target.note),
      latitude:
        typeof target.latitude === "number" && Number.isFinite(target.latitude)
          ? target.latitude
          : null,
      longitude:
        typeof target.longitude === "number" && Number.isFinite(target.longitude)
          ? target.longitude
          : null,
      map_link: normalizeMapLink(target.map_link),
      sort_order: target.sort_order ?? index,
      status: (target.id ? existingStatusMap.get(target.id) : null) ?? "pending"
    }))
    .filter((target) => target.company_name.length > 0);

  const keepIds = sanitized
    .map((target) => target.id)
    .filter((id): id is string => Boolean(id));

  const deleteIds = (existingTargets ?? [])
    .map((row) => row.id as string)
    .filter((id) => !keepIds.includes(id));

  if (deleteIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("delivery_targets")
      .delete()
      .eq("batch_id", batchId)
      .in("id", deleteIds);
    if (deleteError) {
      throw new DeliveryTrackingError(
        "Unable to delete removed targets",
        "TARGET_DELETE_FAILED",
        deleteError
      );
    }
  }

  if (sanitized.length === 0) {
    return [] as DeliveryTarget[];
  }

  const savedRows: DeliveryTarget[] = [];
  for (let index = 0; index < sanitized.length; index += 1) {
    const payload = sanitized[index];
    const { data, error } = await supabase
      .from("delivery_targets")
      .upsert(payload, { onConflict: "id" })
      .select("*")
      .single<DeliveryTarget>();

    if (error || !data) {
      console.error("[delivery] replaceDeliveryTargets:upsert_error", {
        index,
        payload,
        error
      });
      throw new DeliveryTrackingError(
        `Unable to save target at index ${index}`,
        "TARGET_UPSERT_FAILED",
        { index, payload, error }
      );
    }

    savedRows.push(data);
  }

  return savedRows.sort((a, b) => {
    const orderA = a.sort_order ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.sort_order ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return a.created_at.localeCompare(b.created_at);
  });
}

export async function getDeliveryBatchWithTargetsByJobId(jobId: string): Promise<DeliveryBatchWithTargets | null> {
  const supabase = createAdminClient();

  const { data: batch, error: batchError } = await supabase
    .from("delivery_batches")
    .select("*")
    .eq("job_id", jobId)
    .maybeSingle<DeliveryBatch>();

  if (batchError) {
    throw new DeliveryTrackingError(
      "Unable to load delivery batch by job",
      "BATCH_LOOKUP_FAILED",
      batchError
    );
  }
  if (!batch) return null;

  const targets = await listDeliveryTargetsByBatchId(batch.id);

  return {
    batch,
    targets,
    summary: toSummary(targets)
  };
}

export async function getDeliveryBatchWithTargetsByToken(token: string) {
  const supabase = createAdminClient();

  const { data: batch, error: batchError } = await supabase
    .from("delivery_batches")
    .select("*")
    .eq("access_token", token)
    .eq("is_active", true)
    .maybeSingle<DeliveryBatch>();

  if (batchError) {
    throw new DeliveryTrackingError(
      "Unable to load delivery batch by token",
      "BATCH_TOKEN_LOOKUP_FAILED",
      batchError
    );
  }
  if (!batch) return null;

  const { data: job, error: jobError } = await supabase
    .from("outage_jobs")
    .select("id, outage_date, equipment_code, note")
    .eq("id", batch.job_id)
    .single();

  if (jobError || !job) {
    throw new DeliveryTrackingError(
      "Unable to load outage job",
      "OUTAGE_JOB_LOOKUP_FAILED",
      jobError
    );
  }

  const targets = await listDeliveryTargetsByBatchId(batch.id);

  return {
    batch,
    job,
    targets,
    summary: toSummary(targets)
  };
}

export async function markTargetDeliveredByToken(args: {
  token: string;
  targetId: string;
  proofImageUrl: string;
  deliveredByName?: string | null;
}) {
  const supabase = createAdminClient();

  const batchData = await getDeliveryBatchWithTargetsByToken(args.token);
  if (!batchData) return null;

  const targetExists = batchData.targets.some((target) => target.id === args.targetId);
  if (!targetExists) return null;

  const { data, error } = await supabase
    .from("delivery_targets")
    .update({
      status: "delivered",
      proof_image_url: args.proofImageUrl,
      delivered_by_name: normalizeText(args.deliveredByName),
      delivered_at: new Date().toISOString()
    })
    .eq("id", args.targetId)
    .eq("batch_id", batchData.batch.id)
    .select("*")
    .single<DeliveryTarget>();

  if (error || !data) {
    throw new DeliveryTrackingError(
      "Unable to update target status",
      "MARK_DELIVERED_FAILED",
      error
    );
  }

  return data;
}

export async function uploadDeliveryProof(args: {
  batchId: string;
  targetId: string;
  file: File;
}) {
  const supabase = createAdminClient();
  const extension = args.file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${args.batchId}/${args.targetId}/${Date.now()}.${extension}`;

  const { error } = await supabase.storage
    .from(DELIVERY_PROOFS_BUCKET)
    .upload(path, args.file, {
      upsert: true,
      contentType: args.file.type || "image/jpeg",
      cacheControl: "3600"
    });

  if (error) {
    throw new DeliveryTrackingError(
      "Unable to upload delivery proof image",
      "PROOF_UPLOAD_FAILED",
      error
    );
  }

  const { data } = supabase.storage.from(DELIVERY_PROOFS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
