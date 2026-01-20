import { supabase } from "./supabaseClient";

export type OutageJob = {
  id: string;
  outage_date: string;
  equipment_code: string;
  note: string | null;
  nakhon_status: "PENDING" | "NOTIFIED" | "NOT_REQUIRED";
  nakhon_notified_date: string | null;
  nakhon_memo_no: string | null;
  doc_issue_date: string | null;
  doc_purpose: string | null;
  doc_area_title: string | null;
  doc_time_start: string | null;
  doc_time_end: string | null;
  doc_area_detail: string | null;
  map_link: string | null;
  doc_status: "PENDING" | "GENERATING" | "GENERATED" | "ERROR";
  doc_url: string | null;
  doc_generated_at: string | null;
  doc_requested_at: string | null;
  social_status: "DRAFT" | "PENDING_APPROVAL" | "POSTED";
  social_post_text: string | null;
  social_posted_at: string | null;
  social_approved_at: string | null;
  notice_status: "NONE" | "SCHEDULED";
  notice_date: string | null;
  notice_by: string | null;
  mymaps_url: string | null;
  notice_scheduled_at: string | null;
  created_at: string;
  updated_at: string;
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
  payload: { date: string; memoNo: string }
) {
  return supabase
    .from("outage_jobs")
    .update({
      nakhon_status: "NOTIFIED",
      nakhon_notified_date: payload.date,
      nakhon_memo_no: payload.memoNo
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
