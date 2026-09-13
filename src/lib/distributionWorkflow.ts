import { isNoticeCompleted, isNoticeScheduled } from "./documentWorkflow.ts";
import {
  AONANG_RESPONSIBLE_UNIT,
  CONSTRUCTION_RESPONSIBLE_UNIT,
  isResponsibleUnit,
  OPERATIONS_RESPONSIBLE_UNIT,
  type ResponsibleUnit
} from "./jobMetadata.ts";

export const OPERATIONS_DISTRIBUTION_ASSIGNEE = "กะ 1";

export type DistributionRoute =
  | "OPERATIONS"
  | "DIRECT_CONSTRUCTION"
  | "DIRECT_AO_NANG"
  | "UNASSIGNED";

export type DistributionWorkflowSource = {
  responsible_unit?: unknown;
  notice_status?: string | null;
  notice_date?: string | null;
  notice_completed_at?: string | null;
  notice_by?: string | null;
};

export type ShiftOneDistributionPendingSource = DistributionWorkflowSource & {
  document_delivered_at?: string | null;
  is_closed?: boolean | null;
};

export type DistributionWorkflow = {
  route: DistributionRoute;
  responsibleUnit: ResponsibleUnit | null;
  assignmentLabel: string | null;
  completed: boolean;
  scheduled: boolean;
  requiresSchedule: boolean;
  reminderEligible: boolean;
  actionLabel: string;
  modalTitle: string;
};

export function getDistributionWorkflow(
  job: DistributionWorkflowSource
): DistributionWorkflow {
  const responsibleUnit = isResponsibleUnit(job.responsible_unit)
    ? job.responsible_unit
    : null;
  const completed = isNoticeCompleted(job);
  const scheduled = isNoticeScheduled(job);

  let route: DistributionRoute = "UNASSIGNED";
  let assignmentLabel: string | null = null;
  let actionLabel = "ระบุหน่วยงานก่อนแจกหนังสือ";
  let modalTitle = "ยังไม่สามารถมอบหมายการแจกหนังสือ";

  if (responsibleUnit === OPERATIONS_RESPONSIBLE_UNIT) {
    route = "OPERATIONS";
    assignmentLabel = OPERATIONS_DISTRIBUTION_ASSIGNEE;
    actionLabel = scheduled
      ? "ยืนยัน / แก้ไขการแจกหนังสือ"
      : "แจ้งหนังสือดับไฟ";
    modalTitle = "กำหนดการแจ้งหนังสือดับไฟ";
  } else if (responsibleUnit === CONSTRUCTION_RESPONSIBLE_UNIT) {
    route = "DIRECT_CONSTRUCTION";
    assignmentLabel = "แผนกก่อสร้าง";
    actionLabel = "แจ้งก่อสร้างแจกหนังสือ";
    modalTitle = "แจ้งก่อสร้างแจกหนังสือ";
  } else if (responsibleUnit === AONANG_RESPONSIBLE_UNIT) {
    route = "DIRECT_AO_NANG";
    assignmentLabel = "อ่าวนาง";
    actionLabel = "แจ้งอ่าวนางแจกหนังสือ";
    modalTitle = "แจ้งอ่าวนางแจกหนังสือ";
  }

  if (completed) {
    actionLabel = "ดู / แก้ไขผลการแจกหนังสือ";
    modalTitle = "ผลการแจกหนังสือดับไฟ";
  }

  return {
    route,
    responsibleUnit,
    assignmentLabel,
    completed,
    scheduled,
    requiresSchedule: route === "OPERATIONS" && !completed,
    reminderEligible: route === "OPERATIONS" && !completed,
    actionLabel,
    modalTitle
  };
}

export function isDirectDistributionRoute(route: DistributionRoute): boolean {
  return route === "DIRECT_CONSTRUCTION" || route === "DIRECT_AO_NANG";
}

export function isShiftOneDistributionPending(
  job: ShiftOneDistributionPendingSource
): boolean {
  const workflow = getDistributionWorkflow(job);

  return (
    workflow.route === "OPERATIONS" &&
    Boolean(job.document_delivered_at) &&
    !workflow.completed &&
    !job.is_closed
  );
}
