import {
  isDocumentReady,
  isNoticeCompleted,
  isSocialPosted,
  type DocumentWorkflowSource
} from "./documentWorkflow.ts";

export const WORKFLOW_ROLLBACK_TARGETS = [
  "DOCUMENT_CREATED",
  "DOCUMENT_RECEIVED",
  "DOCUMENT_SENT",
  "DELIVERY_COMPLETED",
  "SOCIAL_POSTED"
] as const;

export type WorkflowRollbackTarget =
  (typeof WORKFLOW_ROLLBACK_TARGETS)[number];

export type WorkflowActualStep =
  | "DRAFT"
  | "DOCUMENT_CREATED"
  | "DOCUMENT_RECEIVED"
  | "DOCUMENT_SENT"
  | "DELIVERY_COMPLETED"
  | "SOCIAL_POSTED"
  | "CLOSED";

export type WorkflowRollbackSource = DocumentWorkflowSource & {
  document_received_at?: string | null;
  document_delivered_at?: string | null;
};

export type WorkflowRollbackOption = {
  target: WorkflowRollbackTarget;
  label: string;
  description: string;
  clears: string[];
  keeps: string[];
};

const STEP_RANK: Record<WorkflowActualStep, number> = {
  DRAFT: 0,
  DOCUMENT_CREATED: 1,
  DOCUMENT_RECEIVED: 2,
  DOCUMENT_SENT: 3,
  DELIVERY_COMPLETED: 4,
  SOCIAL_POSTED: 5,
  CLOSED: 6
};

export const WORKFLOW_ROLLBACK_OPTIONS: Record<
  WorkflowRollbackTarget,
  WorkflowRollbackOption
> = {
  DOCUMENT_CREATED: {
    target: "DOCUMENT_CREATED",
    label: "ย้อนก่อนรับเอกสาร",
    description: "คงเอกสารที่สร้างไว้ และยกเลิกสถานะตั้งแต่การรับเอกสารเป็นต้นไป",
    clears: [
      "การรับและส่งเอกสาร",
      "กำหนดการและผลการแจกหนังสือ",
      "สถานะ Social",
      "สถานะปิดงาน"
    ],
    keeps: ["ข้อมูลงาน", "เอกสารที่สร้างแล้ว", "พื้นที่ แผนที่ และจำนวนผู้ใช้ไฟ"]
  },
  DOCUMENT_RECEIVED: {
    target: "DOCUMENT_RECEIVED",
    label: "ย้อนก่อนส่งเอกสาร",
    description: "คงข้อมูลการรับเอกสาร และยกเลิกสถานะตั้งแต่การส่งเอกสารเป็นต้นไป",
    clears: [
      "การส่งเอกสาร",
      "กำหนดการและผลการแจกหนังสือ",
      "สถานะ Social",
      "สถานะปิดงาน"
    ],
    keeps: ["ข้อมูลงาน", "เอกสาร", "ข้อมูลการรับเอกสาร", "พื้นที่และแผนที่"]
  },
  DOCUMENT_SENT: {
    target: "DOCUMENT_SENT",
    label: "ย้อนก่อนแจกหนังสือ",
    description: "คงเอกสารและกำหนดการเดิมไว้ แต่ยกเลิกผลการแจกจริงและสถานะหลังจากนั้น",
    clears: [
      "สถานะแจกหนังสือแล้ว",
      "วันเวลาและผู้แจกจริง",
      "สถานะ Social",
      "สถานะปิดงาน"
    ],
    keeps: [
      "ข้อมูลงานและเอกสาร",
      "ข้อมูลรับ/ส่งเอกสาร",
      "วันที่กำหนดแจก (ยังแก้ไขได้)",
      "พื้นที่ แผนที่ และจำนวนผู้ใช้ไฟ"
    ]
  },
  DELIVERY_COMPLETED: {
    target: "DELIVERY_COMPLETED",
    label: "ย้อนก่อน Social",
    description: "คงผลการแจกหนังสือ และยกเลิก Social กับการปิดงาน",
    clears: ["ข้อความและสถานะ Social", "สถานะปิดงาน"],
    keeps: ["ข้อมูลงานและเอกสาร", "กำหนดการและผลการแจกหนังสือ"]
  },
  SOCIAL_POSTED: {
    target: "SOCIAL_POSTED",
    label: "ย้อนก่อนปิดงาน",
    description: "เปิดงานกลับมา โดยคง Workflow และ Social ไว้ทั้งหมด",
    clears: ["สถานะและวันเวลาปิดงาน"],
    keeps: ["ข้อมูลงาน เอกสาร การแจกหนังสือ และ Social"]
  }
};

export function getWorkflowActualStep(
  job: WorkflowRollbackSource
): WorkflowActualStep {
  if (job.is_closed) return "CLOSED";
  if (isSocialPosted(job)) return "SOCIAL_POSTED";
  if (isNoticeCompleted(job)) return "DELIVERY_COMPLETED";
  if (job.document_delivered_at) return "DOCUMENT_SENT";
  if (job.document_received_at) return "DOCUMENT_RECEIVED";
  if (isDocumentReady(job)) return "DOCUMENT_CREATED";
  return "DRAFT";
}

export function getAvailableWorkflowRollbackOptions(
  job: WorkflowRollbackSource
): WorkflowRollbackOption[] {
  const currentRank = STEP_RANK[getWorkflowActualStep(job)];
  return WORKFLOW_ROLLBACK_TARGETS.filter(
    (target) =>
      STEP_RANK[target] < currentRank &&
      (target !== "DOCUMENT_CREATED" || isDocumentReady(job)) &&
      (target !== "DOCUMENT_RECEIVED" || Boolean(job.document_received_at)) &&
      (target !== "DOCUMENT_SENT" || Boolean(job.document_delivered_at)) &&
      (target !== "DELIVERY_COMPLETED" || isNoticeCompleted(job)) &&
      (target !== "SOCIAL_POSTED" || isSocialPosted(job))
  ).map((target) => WORKFLOW_ROLLBACK_OPTIONS[target]);
}

export function isWorkflowRollbackTarget(
  value: unknown
): value is WorkflowRollbackTarget {
  return (
    typeof value === "string" &&
    WORKFLOW_ROLLBACK_TARGETS.includes(value as WorkflowRollbackTarget)
  );
}
