import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { AUTH_DISABLED } from "@/lib/authConfig";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY;

const ADMIN_ROUTE_PREFIXES = [
  "/dashboard",
  "/jobs",
  "/calendar",
  "/gis-issues",
  "/new",
  "/job",
  "/admin",
  "/manage"
] as const;

const createSupabaseClient = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  return createClient(supabaseUrl, supabaseAnonKey);
};

const isAdminRoute = (pathname: string) => {
  if (pathname === "/") return true;
  return ADMIN_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
};

export async function middleware(request: NextRequest) {
  if (AUTH_DISABLED) {
    if (request.nextUrl.pathname === "/login") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  if (!isAdminRoute(request.nextUrl.pathname)) {
    // Public routes (e.g. /delivery/[token]) must be accessible immediately.
    return NextResponse.next();
  }

  const accessToken = request.cookies.get("sb-access-token")?.value;

  if (!accessToken) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const supabase = createSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser(accessToken);

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/dashboard/:path*", "/jobs/:path*", "/calendar/:path*", "/gis-issues/:path*", "/new", "/job/:path*", "/admin/:path*", "/manage/:path*"]
};
