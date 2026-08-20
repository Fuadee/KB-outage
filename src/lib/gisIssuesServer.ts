import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AUTH_DISABLED_ACTOR_NAME } from "@/lib/authConfig";
import { ensureSystemCertificateAuthorities } from "@/lib/serverTls";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
export type GisContext = {
  admin: SupabaseClient;
  actorName: string;
};

export const getGisContext = async (): Promise<GisContext> => {
  if (!SUPABASE_URL) {
    throw new Error("Missing Supabase URL.");
  }
  if (!SUPABASE_ANON_KEY) {
    throw new Error("Missing Supabase anon key for GIS no-auth access.");
  }

  ensureSystemCertificateAuthorities();
  return {
    admin: createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    }),
    actorName: AUTH_DISABLED_ACTOR_NAME
  };
};

export const logGisError = (scope: string, error: unknown) => {
  const details =
    error && typeof error === "object"
      ? (error as {
          name?: unknown;
          message?: unknown;
          code?: unknown;
          details?: unknown;
          hint?: unknown;
          cause?: unknown;
        })
      : null;
  const cause = details?.cause;
  console.error(scope, {
    name: details?.name ?? null,
    message: details?.message ?? String(error),
    code: details?.code ?? null,
    details: details?.details ?? null,
    hint: details?.hint ?? null,
    cause:
      cause instanceof Error
        ? { name: cause.name, message: cause.message }
        : cause ?? null
  });
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
