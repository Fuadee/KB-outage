import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import type { NextResponse } from "next/server";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY;

const ensureEnv = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
};

export const createServerClient = () => {
  ensureEnv();
  return createClient(supabaseUrl!, supabaseAnonKey!);
};

export const getAuthTokens = () => {
  const cookieStore = cookies();
  return {
    accessToken: cookieStore.get("sb-access-token")?.value ?? null,
    refreshToken: cookieStore.get("sb-refresh-token")?.value ?? null
  };
};

export const setAuthCookies = (
  response: NextResponse,
  tokens: { accessToken: string; refreshToken: string }
) => {
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/"
  };

  response.cookies.set("sb-access-token", tokens.accessToken, cookieOptions);
  response.cookies.set("sb-refresh-token", tokens.refreshToken, cookieOptions);
};

export const clearAuthCookies = (response: NextResponse) => {
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  };

  response.cookies.set("sb-access-token", "", cookieOptions);
  response.cookies.set("sb-refresh-token", "", cookieOptions);
};
