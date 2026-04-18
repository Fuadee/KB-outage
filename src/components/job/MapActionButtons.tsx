"use client";

import type { ReactElement, SyntheticEvent } from "react";
import { MapPin } from "lucide-react";
import { buttonStyles } from "@/components/ui/Button";
import CopyNoticeButton from "@/components/job/CopyNoticeButton";
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
    "h-9 !w-auto rounded-md px-3.5 text-xs font-semibold"
  );

  const handleCopyLink = async (event: SyntheticEvent) => {
    stopPropagation(event);
    try {
      await navigator.clipboard.writeText(googleMap);
    } catch (error) {
      console.error("Failed to copy Google Maps link", error);
    }
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <a
        href={googleMap}
        target="_blank"
        rel="noopener noreferrer"
        onClick={stopPropagation}
        onPointerDownCapture={stopPropagation}
        className={mapButtonClasses}
        title="เปิดแผนที่"
        aria-label="เปิดแผนที่"
      >
        <MapPin className={iconClasses} aria-hidden="true" />
        <span className="whitespace-nowrap">เปิดแผนที่</span>
      </a>
      <CopyNoticeButton
        onCopy={handleCopyLink}
        label="คัดลอกลิงก์"
        copiedLabel="คัดลอกแล้ว"
        title="คัดลอกลิงก์แผนที่"
        className="shrink-0"
      />
    </div>
  );
}
