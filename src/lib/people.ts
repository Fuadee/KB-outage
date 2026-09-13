import {
  AONANG_RESPONSIBLE_UNIT,
  type ResponsibleUnit
} from "./jobMetadata.ts";

export type Person = {
  id: string;
  full_name: string;
  department: ResponsibleUnit;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PersonReference = Pick<
  Person,
  "id" | "full_name" | "department" | "is_active"
>;

export type PersonRelation =
  | PersonReference
  | PersonReference[]
  | null
  | undefined;

export function isWorkSupervisorDepartmentEligible(
  jobDepartment: ResponsibleUnit,
  personDepartment: ResponsibleUnit
): boolean {
  return (
    jobDepartment === AONANG_RESPONSIBLE_UNIT ||
    jobDepartment === personDepartment
  );
}

export function getPersonReference(
  relation: PersonRelation
): PersonReference | null {
  return (Array.isArray(relation) ? relation[0] : relation) ?? null;
}

function relationName(relation: PersonRelation): string | null {
  const person = getPersonReference(relation);
  return person?.full_name?.trim() || null;
}

export function getWorkSupervisorDisplayName(job: {
  work_supervisor_person_id?: string | null;
  work_supervisor_person?: PersonRelation;
  work_supervisor_name?: string | null;
}): string | null {
  return (
    (job.work_supervisor_person_id === null
      ? null
      : relationName(job.work_supervisor_person)) ||
    job.work_supervisor_name?.trim() ||
    null
  );
}

export function getNoticeDistributorDisplayName(job: {
  notice_by_person_id?: string | null;
  notice_by_person?: PersonRelation;
  notice_by?: string | null;
}): string | null {
  return (
    (job.notice_by_person_id === null
      ? null
      : relationName(job.notice_by_person)) ||
    job.notice_by?.trim() ||
    null
  );
}
