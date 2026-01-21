export type DashboardStep =
  | "DRAFT"
  | "DOC_READY"
  | "SOCIAL_POSTED"
  | "NOTICE_SCHEDULED"
  | "CLOSED";

export type DashboardJobStatusSource = {
  doc_status: string | null;
  social_status: string | null;
  notice_status: string | null;
  notice_date: string | null;
  nakhon_status: string | null;
  nakhon_notified_date: string | null;
  is_closed: boolean | null;
};

const DOC_READY_STATUS = "GENERATED";
const SOCIAL_POSTED_STATUS = "POSTED";
const NOTICE_SCHEDULED_STATUS = "SCHEDULED";
const NOTICE_SENT_STATUS = "SENT";
const NAKHON_NOT_REQUIRED_STATUS = "NOT_REQUIRED";

export function getDashboardStep(
  job: Pick<
    DashboardJobStatusSource,
    "doc_status" | "social_status" | "notice_status" | "is_closed"
  >
): DashboardStep {
  if (job.is_closed) return "CLOSED";
  if (job.doc_status !== DOC_READY_STATUS) return "DRAFT";
  if (job.social_status !== SOCIAL_POSTED_STATUS) return "DOC_READY";
  if (
    job.notice_status !== NOTICE_SCHEDULED_STATUS &&
    job.notice_status !== NOTICE_SENT_STATUS
  ) {
    return "SOCIAL_POSTED";
  }
  return "NOTICE_SCHEDULED";
}

export function getNextAction(job: DashboardJobStatusSource): string {
  if (job.doc_status !== DOC_READY_STATUS) {
    return "สร้างเอกสาร";
  }
  if (job.social_status !== SOCIAL_POSTED_STATUS) {
    return "โพสต์ลง Social";
  }
  if (job.notice_status !== NOTICE_SCHEDULED_STATUS && !job.notice_date) {
    return "ตั้งเวลาแจ้งหนังสือ";
  }
  if (
    job.nakhon_status !== NAKHON_NOT_REQUIRED_STATUS &&
    !job.nakhon_notified_date
  ) {
    return "แจ้งศูนย์นคร";
  }
  if (!job.is_closed) {
    return "ปิดงาน";
  }
  return "ครบแล้ว";
}
