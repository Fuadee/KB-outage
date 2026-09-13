import { supabase } from "./supabaseClient";
import type { PostgrestError } from "@supabase/supabase-js";
import type { ResponsibleUnit } from "./jobMetadata";

export type OutageJob = {
  id: string;
  outage_date: string;
  equipment_code: string;
  responsible_unit: ResponsibleUnit | null;
  work_supervisor_name: string | null;
  has_switching: boolean | null;
  customer_count: number | null;
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
  document_received_at: string | null;
  document_received_by: string | null;
  document_delivered_at: string | null;
  document_delivered_by: string | null;
  document_delivery_note: string | null;
  social_status: "DRAFT" | "PENDING_APPROVAL" | "POSTED";
  social_post_text: string | null;
  social_posted_at: string | null;
  social_approved_at: string | null;
  notice_status: "NONE" | "SCHEDULED" | "COMPLETED";
  notice_date: string | null;
  notice_by: string | null;
  notice_scheduled_at: string | null;
  notice_completed_at: string | null;
  is_closed: boolean;
  closed_at: string | null;
  closed_by: string | null;
  created_at: string;
  updated_at: string;
};

export type NewOutageJob = {
  outage_date: string;
  equipment_code: string;
  responsible_unit: ResponsibleUnit;
  work_supervisor_name: string | null;
  has_switching: boolean;
  customer_count: number | null;
  note?: string | null;
};

export type UpdateOutageJob = {
  outage_date: string;
  equipment_code: string;
  responsible_unit: ResponsibleUnit | null;
  work_supervisor_name: string | null;
  has_switching: boolean | null;
  customer_count: number | null;
  note?: string | null;
};

const JOB_SELECT =
  "id, outage_date, equipment_code, responsible_unit, work_supervisor_name, has_switching, customer_count, note, nakhon_status, nakhon_notified_date, nakhon_memo_no, doc_issue_date, doc_purpose, doc_area_title, doc_time_start, doc_time_end, doc_area_detail, map_link, vulnerable_check_status, vulnerable_check_count, vulnerable_check_checked_at, vulnerable_check_error, vulnerable_patient_ids, special_watchlist_check_status, special_watchlist_check_count, special_watchlist_check_checked_at, special_watchlist_check_error, special_watchlist_customer_ids, doc_status, doc_url, doc_generated_at, doc_requested_at, document_received_at, document_received_by, document_delivered_at, document_delivered_by, document_delivery_note, social_status, social_post_text, social_posted_at, social_approved_at, notice_status, notice_date, notice_by, notice_scheduled_at, notice_completed_at, is_closed, closed_at, closed_by, created_at, updated_at";

const LEGACY_JOB_SELECT = JOB_SELECT.replace(", notice_completed_at", "");

type JobsQueryResult = {
  data: OutageJob[] | null;
  error: PostgrestError | null;
};

export async function listJobs(): Promise<JobsQueryResult> {
  const response = await supabase
    .from("outage_jobs")
    .select(JOB_SELECT)
    .order("outage_date", { ascending: true });

  if (
    response.error?.code === "42703" &&
    /notice_completed_at/i.test(response.error.message)
  ) {
    const legacyResponse = await supabase
      .from("outage_jobs")
      .select(LEGACY_JOB_SELECT)
      .order("outage_date", { ascending: true });
    return legacyResponse as unknown as JobsQueryResult;
  }

  return response as unknown as JobsQueryResult;
}

export async function getJob(id: string) {
  return supabase
    .from("outage_jobs")
    .select("*")
    .eq("id", id)
    .single();
}

export async function createJob(data: NewOutageJob) {
  try {
    const response = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.ok) {
      return {
        data: null,
        error: new Error(result?.error ?? "ไม่สามารถสร้างงานได้")
      };
    }
    if (result.data?.work_supervisor_name !== data.work_supervisor_name) {
      return {
        data: null,
        error: new Error("ระบบตอบกลับไม่ตรงกับชื่อผู้ควบคุมงานที่บันทึก กรุณาลองใหม่")
      };
    }

    return { data: result.data, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error("ไม่สามารถสร้างงานได้")
    };
  }
}

export async function updateJob(
  id: string,
  patch: UpdateOutageJob
) {
  try {
    const response = await fetch(`/api/jobs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    });
    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.ok) {
      return {
        data: null,
        error: new Error(result?.error ?? "ไม่สามารถแก้ไขงานได้")
      };
    }
    if (result.data?.responsible_unit !== patch.responsible_unit) {
      return {
        data: null,
        error: new Error("ระบบตอบกลับไม่ตรงกับหน่วยงานที่บันทึก กรุณาลองใหม่")
      };
    }
    if (result.data?.work_supervisor_name !== patch.work_supervisor_name) {
      return {
        data: null,
        error: new Error("ระบบตอบกลับไม่ตรงกับชื่อผู้ควบคุมงานที่บันทึก กรุณาลองใหม่")
      };
    }
    if (result.data?.customer_count !== patch.customer_count) {
      return {
        data: null,
        error: new Error("ระบบตอบกลับไม่ตรงกับจำนวนผู้ใช้ไฟฟ้าที่บันทึก กรุณาลองใหม่")
      };
    }
    if (result.data?.has_switching !== patch.has_switching) {
      return {
        data: null,
        error: new Error("ระบบตอบกลับไม่ตรงกับข้อมูล Switching ที่บันทึก กรุณาลองใหม่")
      };
    }

    return { data: result.data, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error("ไม่สามารถแก้ไขงานได้")
    };
  }
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
