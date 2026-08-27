export type DocumentWorkflowStage =
  | "DRAFT"
  | "WAITING_DOCUMENT"
  | "WAITING_DELIVERY"
  | "READY_FOR_NOTICE"
  | "READY_FOR_SOCIAL"
  | "NOTICE_SCHEDULED"
  | "SOCIAL_POSTED"
  | "CLOSED";

export type DocumentWorkflowAction =
  | "CREATE_DOCUMENT"
  | "RECEIVE_DOCUMENT"
  | "DELIVER_DOCUMENT"
  | "POST_SOCIAL"
  | "SCHEDULE_NOTICE"
  | "CLOSE_JOB"
  | "COMPLETE";

export type DocumentWorkflowSource = {
  doc_status?: string | null;
  doc_generated_at?: string | null;
  document_received_at?: string | null;
  document_received_by?: string | null;
  document_delivered_at?: string | null;
  document_delivered_by?: string | null;
  document_delivery_note?: string | null;
  social_status?: string | null;
  social_posted_at?: string | null;
  notice_status?: string | null;
  notice_date?: string | null;
  is_closed?: boolean | null;
};

export const DOCUMENT_WORKFLOW_STAGE_ORDER: DocumentWorkflowStage[] = [
  "DRAFT",
  "WAITING_DOCUMENT",
  "WAITING_DELIVERY",
  "READY_FOR_NOTICE",
  "NOTICE_SCHEDULED",
  "READY_FOR_SOCIAL",
  "SOCIAL_POSTED"
];

export const DOCUMENT_WORKFLOW_STAGE_LABELS: Record<
  DocumentWorkflowStage,
  string
> = {
  DRAFT: "Draft",
  WAITING_DOCUMENT: "Document ready / รอรับเอกสาร",
  WAITING_DELIVERY: "Received / รอส่งเอกสาร",
  READY_FOR_NOTICE: "Delivered / รอกำหนดแจ้งดับไฟ",
  NOTICE_SCHEDULED: "Notice scheduled / รอลง Social",
  READY_FOR_SOCIAL: "Notice scheduled / รอลง Social",
  SOCIAL_POSTED: "Social posted",
  CLOSED: "Closed"
};

export function isDocumentReady(job: DocumentWorkflowSource): boolean {
  return job.doc_status === "GENERATED" || Boolean(job.doc_generated_at);
}

export function isSocialPosted(job: DocumentWorkflowSource): boolean {
  return job.social_status === "POSTED" || Boolean(job.social_posted_at);
}

export function isNoticeScheduled(job: DocumentWorkflowSource): boolean {
  return (
    job.notice_status === "SCHEDULED" ||
    job.notice_status === "SENT" ||
    Boolean(job.notice_date)
  );
}

/**
 * Single source of truth for pipeline placement.
 * Terminal states are evaluated first so pre-migration Social/Notice jobs never
 * regress to "waiting for document" merely because the new nullable fields are empty.
 */
export function getDocumentWorkflowStage(
  job: DocumentWorkflowSource
): DocumentWorkflowStage {
  if (job.is_closed) return "CLOSED";
  if (isSocialPosted(job)) return "SOCIAL_POSTED";
  if (isNoticeScheduled(job)) return "READY_FOR_SOCIAL";
  if (job.document_delivered_at) return "READY_FOR_NOTICE";
  if (job.document_received_at) return "WAITING_DELIVERY";
  if (isDocumentReady(job)) return "WAITING_DOCUMENT";
  return "DRAFT";
}

export function getDocumentWorkflowAction(
  job: DocumentWorkflowSource
): DocumentWorkflowAction {
  switch (getDocumentWorkflowStage(job)) {
    case "DRAFT":
      return "CREATE_DOCUMENT";
    case "WAITING_DOCUMENT":
      return "RECEIVE_DOCUMENT";
    case "WAITING_DELIVERY":
      return "DELIVER_DOCUMENT";
    case "READY_FOR_NOTICE":
      return "SCHEDULE_NOTICE";
    case "NOTICE_SCHEDULED":
    case "READY_FOR_SOCIAL":
      return "POST_SOCIAL";
    case "SOCIAL_POSTED":
      return "CLOSE_JOB";
    case "CLOSED":
      return "COMPLETE";
  }
}

export function getDocumentWorkflowActionLabel(
  action: DocumentWorkflowAction
): string {
  const labels: Record<DocumentWorkflowAction, string> = {
    CREATE_DOCUMENT: "สร้างเอกสารดับไฟ",
    RECEIVE_DOCUMENT: "รับเอกสารแล้ว",
    DELIVER_DOCUMENT: "บันทึกการส่งเอกสาร",
    POST_SOCIAL: "Post ลงสื่อ Social",
    SCHEDULE_NOTICE: "แจ้งหนังสือดับไฟ",
    CLOSE_JOB: "ปิดงาน",
    COMPLETE: "ครบแล้ว"
  };
  return labels[action];
}

export function getLegacyCalendarStatus(
  job: DocumentWorkflowSource
): "Done" | "Notice" | "Posted" | "Doc" | "Draft" {
  const stage = getDocumentWorkflowStage(job);
  if (stage === "CLOSED") return "Done";
  if (stage === "SOCIAL_POSTED") return "Posted";
  if (stage === "NOTICE_SCHEDULED" || stage === "READY_FOR_SOCIAL") return "Notice";
  if (stage !== "DRAFT") return "Doc";
  return "Draft";
}
