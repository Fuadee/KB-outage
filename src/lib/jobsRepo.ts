import { supabase } from "./supabaseClient";

export type OutageJob = {
  id: string;
  outage_date: string;
  equipment_code: string;
  note: string | null;
  created_at: string;
  updated_at: string;
  nakhon_status: "PENDING" | "NOTIFIED" | "NOT_REQUIRED";
  nakhon_notified_date: string | null;
  nakhon_memo_no: string | null;
  doc_status: "PENDING" | "REQUESTED" | "GENERATED";
  doc_requested_at: string | null;
};

export type NewOutageJob = {
  outage_date: string;
  equipment_code: string;
  note?: string | null;
};

export async function listJobs() {
  return supabase
    .from("outage_jobs")
    .select("*")
    .order("outage_date", { ascending: true });
}

export async function getJob(id: string) {
  return supabase
    .from("outage_jobs")
    .select("*")
    .eq("id", id)
    .single();
}

export async function createJob(data: NewOutageJob) {
  return supabase.from("outage_jobs").insert({
    outage_date: data.outage_date,
    equipment_code: data.equipment_code,
    note: data.note ?? null
  });
}

export async function updateJob(
  id: string,
  patch: Partial<NewOutageJob>
) {
  return supabase
    .from("outage_jobs")
    .update({
      outage_date: patch.outage_date,
      equipment_code: patch.equipment_code,
      note: patch.note ?? null
    })
    .eq("id", id);
}

export async function deleteJob(id: string) {
  return supabase.from("outage_jobs").delete().eq("id", id);
}

export async function setNakhonNotified(
  id: string,
  { date, memoNo }: { date: string; memoNo: string }
) {
  return supabase
    .from("outage_jobs")
    .update({
      nakhon_status: "NOTIFIED",
      nakhon_notified_date: date,
      nakhon_memo_no: memoNo
    })
    .eq("id", id);
}

export async function setNakhonNotRequired(id: string) {
  return supabase
    .from("outage_jobs")
    .update({
      nakhon_status: "NOT_REQUIRED",
      nakhon_notified_date: null,
      nakhon_memo_no: null
    })
    .eq("id", id);
}

export async function requestDoc(id: string) {
  return supabase
    .from("outage_jobs")
    .update({
      doc_status: "REQUESTED",
      doc_requested_at: new Date().toISOString()
    })
    .eq("id", id);
}
