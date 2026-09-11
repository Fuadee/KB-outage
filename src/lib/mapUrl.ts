export function normalizeGoogleMapsUrl(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const normalized = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    const isGoogleMaps =
      (hostname.includes("google.") && pathname.includes("map")) ||
      hostname === "maps.app.goo.gl";

    return isGoogleMaps ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function normalizeGoogleMyMapsViewerUrl(
  value?: string | null
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const normalized = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    const isGoogleMyMaps =
      parsed.hostname.toLowerCase() === "www.google.com" &&
      /^\/maps\/d(?:\/u\/\d+)?\/(?:edit|viewer)\/?$/i.test(parsed.pathname);
    const mid = parsed.searchParams.get("mid")?.trim();

    if (!isGoogleMyMaps || !mid) return parsed.toString();

    const viewerUrl = new URL("https://www.google.com/maps/d/u/0/viewer");
    viewerUrl.searchParams.set("mid", mid);
    return viewerUrl.toString();
  } catch {
    return null;
  }
}
