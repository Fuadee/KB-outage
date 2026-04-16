import { randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";
import type {
  DeliveryBatch,
  DeliveryBatchWithTargets,
  DeliverySummary,
  DeliveryTarget,
  DeliveryTargetInput
} from "@/types/deliveryTracking";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const DELIVERY_PROOFS_BUCKET = "delivery-proofs";

const createAdminClient = () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var.");
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
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
  const supabase = createAdminClient();

  const { data: existing, error: findError } = await supabase
    .from("delivery_batches")
    .select("*")
    .eq("job_id", jobId)
    .maybeSingle<DeliveryBatch>();

  if (findError) {
    throw new Error(findError.message);
  }

  if (existing) return existing;

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
    throw new Error(error?.message ?? "Unable to create delivery batch");
  }

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
    throw new Error(error?.message ?? "Unable to regenerate token");
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
    throw new Error(error.message);
  }

  return (data ?? []) as DeliveryTarget[];
}

export async function replaceDeliveryTargets(batchId: string, targets: DeliveryTargetInput[]) {
  const supabase = createAdminClient();
  const { data: existingTargets, error: existingError } = await supabase
    .from("delivery_targets")
    .select("id, status")
    .eq("batch_id", batchId);
  if (existingError) throw new Error(existingError.message);

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
    if (deleteError) throw new Error(deleteError.message);
  }

  if (sanitized.length === 0) {
    return [] as DeliveryTarget[];
  }

  const { data, error } = await supabase
    .from("delivery_targets")
    .upsert(sanitized, { onConflict: "id" })
    .select("*")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as DeliveryTarget[];
}

export async function getDeliveryBatchWithTargetsByJobId(jobId: string): Promise<DeliveryBatchWithTargets | null> {
  const supabase = createAdminClient();

  const { data: batch, error: batchError } = await supabase
    .from("delivery_batches")
    .select("*")
    .eq("job_id", jobId)
    .maybeSingle<DeliveryBatch>();

  if (batchError) throw new Error(batchError.message);
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

  if (batchError) throw new Error(batchError.message);
  if (!batch) return null;

  const { data: job, error: jobError } = await supabase
    .from("outage_jobs")
    .select("id, outage_date, equipment_code, note")
    .eq("id", batch.job_id)
    .single();

  if (jobError || !job) {
    throw new Error(jobError?.message ?? "Unable to load outage job");
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
    throw new Error(error?.message ?? "Unable to update target status");
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
    throw new Error(error.message);
  }

  const { data } = supabase.storage.from(DELIVERY_PROOFS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
