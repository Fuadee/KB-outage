export type DocumentDeliverySnapshot = {
  document_delivered_at?: string | null;
  document_delivered_by?: string | null;
  document_delivered_by_person_id?: string | null;
  document_delivered_by_department?: string | null;
  document_delivery_sender_status?: "PERSON" | "UNKNOWN" | null;
  document_delivery_unknown_reason?: string | null;
  document_delivery_confirmed_at?: string | null;
  document_delivery_note?: string | null;
};

export type DocumentDeliveryAudit = {
  id: string;
  before_state: DocumentDeliverySnapshot | null;
  after_state: DocumentDeliverySnapshot;
  created_at: string;
};

export function getDocumentDeliverySenderLabel(job: DocumentDeliverySnapshot): string {
  if (!job.document_delivered_at) return "ยังไม่ได้ส่งเอกสาร";
  if (job.document_delivery_sender_status === "UNKNOWN") return "ไม่ทราบชื่อผู้ส่ง";
  return `${job.document_delivered_by ?? "-"}${job.document_delivered_by_department ? ` · ${job.document_delivered_by_department}` : ""}`;
}
