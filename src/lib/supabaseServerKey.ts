export function decodeSupabaseJwtPayload(token: string) {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = Buffer.from(parts[1], "base64url").toString("utf8");
    return JSON.parse(payload) as { role?: string };
  } catch {
    return null;
  }
}

export function isPrivilegedSupabaseServerKey(value: string) {
  if (value.startsWith("sb_secret_")) return true;
  return decodeSupabaseJwtPayload(value)?.role === "service_role";
}

