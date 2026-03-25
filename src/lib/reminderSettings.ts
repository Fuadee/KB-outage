import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { BANGKOK_TIMEZONE, REMINDER_LEAD_DAYS, parseTimeHHmm } from "./reminder.ts";

export const REMINDER_SETTINGS_ID = 1;
export const MAX_LEAD_REMINDER_DAYS = 30;

export type ReminderSettings = {
  id: number;
  timezone: string;
  lead_reminder_enabled: boolean;
  lead_reminder_days: number;
  lead_reminder_time: string;
  same_day_reminder_enabled: boolean;
  same_day_reminder_time: string;
  created_at: string;
  updated_at: string;
};

export type ReminderSettingsInput = {
  timezone?: string;
  lead_reminder_enabled?: boolean;
  lead_reminder_days?: number;
  lead_reminder_time?: string;
  same_day_reminder_enabled?: boolean;
  same_day_reminder_time?: string;
};

export type ReminderSettingsValidationResult =
  | { ok: true; value: ReminderSettingsInput }
  | { ok: false; error: string };

const defaultReminderSettingsInput: ReminderSettingsInput = {
  timezone: BANGKOK_TIMEZONE,
  lead_reminder_enabled: true,
  lead_reminder_days: REMINDER_LEAD_DAYS,
  lead_reminder_time: "08:00",
  same_day_reminder_enabled: true,
  same_day_reminder_time: "08:00",
};

export function validateReminderSettingsInput(
  payload: unknown,
  mode: "partial" | "full" = "full"
): ReminderSettingsValidationResult {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { ok: false, error: "Invalid payload" };
  }

  const record = payload as Record<string, unknown>;
  const value: ReminderSettingsInput = {};

  const timezone = record.timezone;
  if (timezone !== undefined) {
    if (timezone !== BANGKOK_TIMEZONE) {
      return { ok: false, error: `timezone must be ${BANGKOK_TIMEZONE}` };
    }
    value.timezone = BANGKOK_TIMEZONE;
  }

  const leadEnabled = record.lead_reminder_enabled;
  if (leadEnabled !== undefined) {
    if (typeof leadEnabled !== "boolean") {
      return { ok: false, error: "lead_reminder_enabled must be boolean" };
    }
    value.lead_reminder_enabled = leadEnabled;
  }

  const leadDays = record.lead_reminder_days;
  if (leadDays !== undefined) {
    if (
      typeof leadDays !== "number" ||
      !Number.isInteger(leadDays) ||
      leadDays < 0 ||
      leadDays > MAX_LEAD_REMINDER_DAYS
    ) {
      return {
        ok: false,
        error: `lead_reminder_days must be integer between 0 and ${MAX_LEAD_REMINDER_DAYS}`,
      };
    }
    value.lead_reminder_days = leadDays;
  }

  const leadTime = record.lead_reminder_time;
  if (leadTime !== undefined) {
    if (typeof leadTime !== "string" || !parseTimeHHmm(leadTime)) {
      return { ok: false, error: "lead_reminder_time must be HH:mm" };
    }
    value.lead_reminder_time = leadTime;
  }

  const sameDayEnabled = record.same_day_reminder_enabled;
  if (sameDayEnabled !== undefined) {
    if (typeof sameDayEnabled !== "boolean") {
      return { ok: false, error: "same_day_reminder_enabled must be boolean" };
    }
    value.same_day_reminder_enabled = sameDayEnabled;
  }

  const sameDayTime = record.same_day_reminder_time;
  if (sameDayTime !== undefined) {
    if (typeof sameDayTime !== "string" || !parseTimeHHmm(sameDayTime)) {
      return { ok: false, error: "same_day_reminder_time must be HH:mm" };
    }
    value.same_day_reminder_time = sameDayTime;
  }

  if (mode === "full") {
    const merged = {
      ...defaultReminderSettingsInput,
      ...value,
    };

    return { ok: true, value: merged };
  }

  return { ok: true, value };
}

function createServiceRoleClient(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

async function insertDefaultReminderSettings(
  supabase: SupabaseClient
): Promise<ReminderSettings> {
  const { data, error } = await supabase
    .from("reminder_settings")
    .insert({
      id: REMINDER_SETTINGS_ID,
      ...defaultReminderSettingsInput,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as ReminderSettings;
}

export async function getOrCreateReminderSettings(
  supabase: SupabaseClient = createServiceRoleClient()
): Promise<ReminderSettings> {
  const { data, error } = await supabase
    .from("reminder_settings")
    .select("*")
    .eq("id", REMINDER_SETTINGS_ID)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (data) {
    return data as ReminderSettings;
  }

  try {
    return await insertDefaultReminderSettings(supabase);
  } catch {
    const fallback = await supabase
      .from("reminder_settings")
      .select("*")
      .eq("id", REMINDER_SETTINGS_ID)
      .single();

    if (fallback.error) {
      throw new Error(fallback.error.message);
    }

    return fallback.data as ReminderSettings;
  }
}

export async function getReminderSettings(
  supabase: SupabaseClient = createServiceRoleClient()
): Promise<ReminderSettings> {
  return getOrCreateReminderSettings(supabase);
}

export async function updateReminderSettings(
  input: ReminderSettingsInput,
  supabase: SupabaseClient = createServiceRoleClient()
): Promise<ReminderSettings> {
  const merged = {
    ...(await getOrCreateReminderSettings(supabase)),
    ...input,
    timezone: BANGKOK_TIMEZONE,
  };

  const { data, error } = await supabase
    .from("reminder_settings")
    .update({
      timezone: merged.timezone,
      lead_reminder_enabled: merged.lead_reminder_enabled,
      lead_reminder_days: merged.lead_reminder_days,
      lead_reminder_time: merged.lead_reminder_time,
      same_day_reminder_enabled: merged.same_day_reminder_enabled,
      same_day_reminder_time: merged.same_day_reminder_time,
    })
    .eq("id", REMINDER_SETTINGS_ID)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as ReminderSettings;
}
