import {
  getDocumentWorkflowAction,
  getDocumentWorkflowActionLabel,
  getDocumentWorkflowStage,
  type DocumentWorkflowSource,
  type DocumentWorkflowStage
} from "./documentWorkflow";

export type DashboardStep = DocumentWorkflowStage;

export type DashboardJobStatusSource = DocumentWorkflowSource & {
  nakhon_status?: string | null;
  nakhon_notified_date?: string | null;
};

export function getDashboardStep(job: DashboardJobStatusSource): DashboardStep {
  return getDocumentWorkflowStage(job);
}

export function getNextAction(job: DashboardJobStatusSource): string {
  return getDocumentWorkflowActionLabel(getDocumentWorkflowAction(job));
}
