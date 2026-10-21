import type { SupabaseClient } from "@supabase/supabase-js";
import { findPersonById, normalizePersonId } from "./peopleServer.ts";
import type { DocumentDeliverySnapshot } from "./documentDelivery.ts";

type DeliverySender = DocumentDeliverySnapshot & {
  document_delivered_by: string | null;
  document_delivered_by_person_id?: string | null;
  document_delivered_by_department?: string | null;
  document_delivered_at?: string | null;
};

// Preserve recorded snapshots on resave, including inactive people and legacy text.
// A different sender always requires an explicit, active master-list selection.
export async function resolveDocumentDeliverySender(
  client: SupabaseClient,
  job: DeliverySender,
  input: {
    person_id?: unknown; preserve_existing_sender?: unknown;
    sender_status?: unknown; unknown_reason?: unknown; delivery_confirmed?: unknown;
  }
) {
  const personId = normalizePersonId(input.person_id);
  if (personId === undefined) return null;
  if (input.sender_status !== undefined && !["PERSON", "UNKNOWN"].includes(input.sender_status as string)) return null;
  if (input.sender_status === "UNKNOWN") {
    const reason = typeof input.unknown_reason === "string" ? input.unknown_reason.trim() : "";
    if (personId || input.preserve_existing_sender === true || !reason || reason.length > 1000 || input.delivery_confirmed !== true) return null;
    return {
      document_delivery_sender_status: "UNKNOWN" as const,
      document_delivery_unknown_reason: reason,
      document_delivery_confirmed_at: new Date().toISOString(),
      document_delivered_by_person_id: null,
      document_delivered_by: null,
      document_delivered_by_department: null
    };
  }
  const knownFields = {
    document_delivery_sender_status: personId ? "PERSON" as const : null,
    document_delivery_unknown_reason: null,
    document_delivery_confirmed_at: null
  };
  const existingId = job.document_delivered_by_person_id ?? null;
  if (
    job.document_delivery_sender_status !== "UNKNOWN" && job.document_delivered_at && job.document_delivered_by &&
    ((personId && personId.toLowerCase() === existingId?.toLowerCase()) ||
      (!personId && !existingId && input.preserve_existing_sender === true))
  ) {
    return {
      ...knownFields,
      document_delivered_by_person_id: existingId,
      document_delivered_by: job.document_delivered_by,
      document_delivered_by_department: job.document_delivered_by_department ?? null
    };
  }
  if (!personId) return null;
  const person = await findPersonById(client, personId);
  if (!person?.is_active) return null;
  return {
    ...knownFields,
    document_delivered_by_person_id: person.id,
    document_delivered_by: person.full_name,
    document_delivered_by_department: person.department
  };
}
