import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY;

let browserClient: SupabaseClient | null = null;
let authListenerRegistered = false;

const ensureEnv = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
};

const syncSessionToServer = async (
  accessToken: string | null,
  refreshToken: string | null
) => {
  if (typeof window === "undefined") return;
  if (accessToken && refreshToken) {
    await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken, refreshToken })
    });
  } else {
    await fetch("/api/auth/session", { method: "DELETE" });
  }
};

export const createClient = () => {
  ensureEnv();

  if (!browserClient) {
    browserClient = createSupabaseClient(supabaseUrl!, supabaseAnonKey!);
  }

  if (!authListenerRegistered && typeof window !== "undefined") {
    authListenerRegistered = true;
    browserClient.auth.onAuthStateChange((_event, session) => {
      syncSessionToServer(
        session?.access_token ?? null,
        session?.refresh_token ?? null
      );
    });
  }

  return browserClient;
};

export const syncSession = async (session: {
  access_token: string;
  refresh_token: string;
}) => {
  await syncSessionToServer(session.access_token, session.refresh_token);
};
