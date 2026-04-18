"use client";

import type { ReactElement, SyntheticEvent } from "react";
import { MapPin } from "lucide-react";
import { buttonStyles } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type MapActionButtonsProps = {
  googleUrl?: string | null;
  className?: string;
};

const normalizeMapUrl = (value?: string | null): string | null => {
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
    if (!isGoogleMaps) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
};

const stopPropagation = (event: SyntheticEvent) => {
  event.stopPropagation();
};

export default function MapActionButtons({
  googleUrl,
  className = ""
}: MapActionButtonsProps): ReactElement | null {
  const googleMap = normalizeMapUrl(googleUrl);

  if (!googleMap) return null;

  const iconClasses = "h-3.5 w-3.5";
  const mapButtonClasses = cn(
    buttonStyles({ variant: "primary", size: "sm" }),
    "!inline-flex !w-fit !max-w-max !shrink-0 !flex-none justify-center !px-4 !py-2"
  );

  return (
    <div className={cn("w-full", className)}>
      <div className="flex w-full justify-center">
        <a
          href={googleMap}
          target="_blank"
          rel="noopener noreferrer"
          onClick={stopPropagation}
          onPointerDownCapture={stopPropagation}
          className={mapButtonClasses}
        >
          <MapPin className={iconClasses} aria-hidden="true" />
          <span className="whitespace-nowrap">📍 เปิดแผนที่</span>
        </a>
      </div>
    </div>
  );
}
