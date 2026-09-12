import { createClient } from "@supabase/supabase-js";
import { ensureSystemCertificateAuthorities } from "@/lib/serverTls";

type ErrorWithCause = Error & {
  cause?: unknown;
  code?: unknown;
};

function getRequestLocation(input: RequestInfo | URL) {
  try {
    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const url = new URL(rawUrl);
    return { origin: url.origin, pathname: url.pathname };
  } catch {
    return { origin: "unknown", pathname: "unknown" };
  }
}

function getSafeErrorDetails(error: unknown) {
  const outer = error instanceof Error ? (error as ErrorWithCause) : null;
  const cause =
    outer?.cause instanceof Error
      ? (outer.cause as ErrorWithCause)
      : null;

  return {
    name: outer?.name ?? "UnknownError",
    message: outer?.message ?? String(error),
    code: typeof outer?.code === "string" ? outer.code : null,
    cause: cause
      ? {
          name: cause.name,
          message: cause.message,
          code: typeof cause.code === "string" ? cause.code : null
        }
      : null
  };
}

const fetchDashboardDependency: typeof fetch = async (input, init) => {
  try {
    return await fetch(input, { ...init, cache: "no-store" });
  } catch (error) {
    console.error("[dashboard-supabase] request failed", {
      ...getRequestLocation(input),
      method: init?.method ?? "GET",
      error: getSafeErrorDetails(error)
    });
    throw error;
  }
};

export function createDashboardSupabaseClient() {
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("Missing SUPABASE_URL env var.");
  }
  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY env var.");
  }

  // Node on Windows does not reliably load the Windows trust store. This must
  // run before the first Supabase request so dashboard availability is not
  // dependent on another API route having configured the process first.
  ensureSystemCertificateAuthorities();

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: fetchDashboardDependency }
  });
}

