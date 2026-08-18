import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AUTH_DISABLED, AUTH_DISABLED_ACTOR_NAME } from "@/lib/authConfig";
import { authorizeServerRequest } from "@/lib/serverAuth";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const GIS_NOAUTH_RPC_SECRET = process.env.GIS_NOAUTH_RPC_SECRET;

export type AuthenticatedGisContext = {
  actorId: string | null;
  admin: SupabaseClient;
  actorName: string;
  rpcSecret: string | null;
};

export class GisAuthError extends Error {}

export const getAuthenticatedGisContext = async (): Promise<AuthenticatedGisContext> => {
  const { authorized, user } = await authorizeServerRequest();
  if (!authorized) throw new GisAuthError("UNAUTHENTICATED");

  if (!SUPABASE_URL) {
    throw new Error("Missing Supabase URL.");
  }

  if (AUTH_DISABLED) {
    if (!SUPABASE_ANON_KEY || !GIS_NOAUTH_RPC_SECRET) {
      throw new Error("Missing GIS no-auth RPC server configuration.");
    }
    return {
      actorId: null,
      admin: createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
      }),
      actorName: AUTH_DISABLED_ACTOR_NAME,
      rpcSecret: GIS_NOAUTH_RPC_SECRET
    };
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase service role key.");
  }

  const actorName = user
    ? (typeof user.user_metadata?.full_name === "string" &&
      user.user_metadata.full_name.trim()) ||
    (typeof user.user_metadata?.name === "string" &&
      user.user_metadata.name.trim()) ||
    user.email ||
    "ผู้ใช้งาน"
    : AUTH_DISABLED_ACTOR_NAME;

  return {
    actorId: user?.id ?? null,
    admin: createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
    actorName,
    rpcSecret: null
  };
};

export const logGisError = (scope: string, error: unknown) => {
  if (process.env.NODE_ENV === "development" && error && typeof error === "object") {
    const details = error as {
      message?: unknown;
      code?: unknown;
      details?: unknown;
      hint?: unknown;
    };
    console.error(scope, {
      message: details.message ?? null,
      code: details.code ?? null,
      details: details.details ?? null,
      hint: details.hint ?? null
    });
    return;
  }
  console.error(scope, error);
};

export const normalizeOptionalText = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

export const isValidOptionalUrl = (value: string | null) => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};
