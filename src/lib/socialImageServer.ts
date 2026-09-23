import { createClient } from "@supabase/supabase-js";
import type { SocialImageAsset } from "./socialImage";
export const SOCIAL_BUCKET = "social-announcements";
export function socialServerClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase server configuration");
  return createClient(url, key, { auth: { persistSession: false } });
}
export async function latestSocialImage(client: ReturnType<typeof socialServerClient>, jobId: string) {
  const { data, error } = await client.from("social_announcement_images").select("*").eq("job_id", jobId).order("generated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data as SocialImageAsset | null;
}
