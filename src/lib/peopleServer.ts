import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResponsibleUnit } from "./jobMetadata";
import {
  isWorkSupervisorDepartmentEligible,
  type PersonReference
} from "./people.ts";

export const PERSON_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizePersonId(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const id = value.trim();
  return PERSON_ID_PATTERN.test(id) ? id : undefined;
}

export async function findPersonById(
  client: SupabaseClient,
  personId: string
): Promise<PersonReference | null> {
  const { data, error } = await client
    .from("people")
    .select("id, full_name, department, is_active")
    .eq("id", personId)
    .maybeSingle();

  if (error) throw error;
  return (data as PersonReference | null) ?? null;
}

export async function findActivePersonForDepartment(
  client: SupabaseClient,
  personId: string,
  department: ResponsibleUnit
): Promise<PersonReference | null> {
  const person = await findPersonById(client, personId);
  return person?.is_active && person.department === department ? person : null;
}

export async function findActiveWorkSupervisor(
  client: SupabaseClient,
  personId: string,
  jobDepartment: ResponsibleUnit
): Promise<PersonReference | null> {
  const person = await findPersonById(client, personId);
  return person?.is_active &&
    isWorkSupervisorDepartmentEligible(jobDepartment, person.department)
    ? person
    : null;
}
