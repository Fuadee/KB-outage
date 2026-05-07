export function extractGoogleMyMapsMid(mapLink: string): string | null {
  const trimmed = mapLink.trim();
  if (!trimmed) return null;

  const normalized = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const parsed = new URL(normalized);
    const mid = parsed.searchParams.get("mid");
    if (!mid?.trim()) return null;
    return mid.trim();
  } catch {
    return null;
  }
}
