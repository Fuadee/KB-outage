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
  vulnerable_check_status: string | null;
  vulnerable_check_count: number;
  vulnerable_check_checked_at: string | null;
  vulnerable_check_error: string | null;
  vulnerable_patient_ids: string[];
  special_watchlist_check_status: string | null;
  special_watchlist_check_count: number;
  special_watchlist_check_checked_at: string | null;
  special_watchlist_check_error: string | null;
  special_watchlist_customer_ids: string[];
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
  notice_scheduled_at: string | null;
  is_closed: boolean;
  closed_at: string | null;
  closed_by: string | null;
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
    .select(
      "id, outage_date, equipment_code, note, nakhon_status, nakhon_notified_date, nakhon_memo_no, doc_issue_date, doc_purpose, doc_area_title, doc_time_start, doc_time_end, doc_area_detail, map_link, vulnerable_check_status, vulnerable_check_count, vulnerable_check_checked_at, vulnerable_check_error, vulnerable_patient_ids, special_watchlist_check_status, special_watchlist_check_count, special_watchlist_check_checked_at, special_watchlist_check_error, special_watchlist_customer_ids, doc_status, doc_url, doc_generated_at, doc_requested_at, social_status, social_post_text, social_posted_at, social_approved_at, notice_status, notice_date, notice_by, notice_scheduled_at, is_closed, closed_at, closed_by, created_at, updated_at"
    )
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
