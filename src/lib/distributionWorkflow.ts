import { isNoticeCompleted, isNoticeScheduled } from "./documentWorkflow.ts";
import { isResponsibleUnit, type ResponsibleUnit } from "./jobMetadata.ts";

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

  if (responsibleUnit === "แผนกปฏิบัติการ") {
    route = "OPERATIONS";
    assignmentLabel = OPERATIONS_DISTRIBUTION_ASSIGNEE;
    actionLabel = scheduled
      ? "ยืนยัน / แก้ไขการแจกหนังสือ"
      : "แจ้งหนังสือดับไฟ";
    modalTitle = "กำหนดการแจ้งหนังสือดับไฟ";
  } else if (responsibleUnit === "แผนกก่อสร้าง") {
    route = "DIRECT_CONSTRUCTION";
    assignmentLabel = "แผนกก่อสร้าง";
    actionLabel = "แจ้งก่อสร้างแจกหนังสือ";
    modalTitle = "แจ้งก่อสร้างแจกหนังสือ";
  } else if (responsibleUnit === "กฟส.อ่าวนาง") {
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
