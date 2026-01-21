"use client";

import type { ReactElement, SyntheticEvent } from "react";
import { MapPin, Route } from "lucide-react";

type MapActionButtonsProps = {
  googleUrl?: string | null;
  myMapUrl?: string | null;
  variant?: "premium" | "compact";
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
  myMapUrl,
  variant = "premium",
  className = ""
}: MapActionButtonsProps): ReactElement | null {
  const googleMap = normalizeMapUrl(googleUrl);
  const myMap = normalizeMapUrl(myMapUrl);

  if (!googleMap && !myMap) return null;

  const sizeClasses =
    variant === "compact"
      ? "min-h-[36px] py-2 text-xs"
      : "min-h-[44px] py-3 text-sm";
  const iconClasses = variant === "compact" ? "h-3.5 w-3.5" : "h-4 w-4";
  const baseClasses = `relative z-10 inline-flex w-full items-center justify-center gap-2 rounded-2xl font-semibold transition-all duration-200 ease-out ${sizeClasses} active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2`;

  const primaryClasses = `${baseClasses} bg-gradient-to-r from-purple-600 via-violet-600 to-indigo-600 text-white shadow-[0_12px_30px_rgba(124,58,237,0.35)] hover:brightness-110`;
  const secondaryClasses = `${baseClasses} border border-purple-200/70 bg-white/70 text-purple-700 backdrop-blur hover:bg-white/90 dark:border-white/15 dark:bg-white/10 dark:text-white dark:hover:bg-white/15`;

  const hasBoth = Boolean(googleMap && myMap);
  const wrapperClassName = className ? ` ${className}` : "";

  const renderButton = (
    url: string,
    label: string,
    icon: ReactElement,
    isPrimary: boolean
  ) => (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={stopPropagation}
      onPointerDownCapture={stopPropagation}
      className={isPrimary ? primaryClasses : secondaryClasses}
    >
      {icon}
      <span>{label}</span>
    </a>
  );

  return (
    <div
      className={`grid gap-2 ${
        hasBoth ? "grid-cols-2" : "grid-cols-1"
      }${wrapperClassName}`}
    >
      {googleMap
        ? renderButton(
            googleMap,
            "เปิด Google Map",
            <MapPin className={iconClasses} aria-hidden="true" />,
            true
          )
        : null}
      {myMap
        ? renderButton(
            myMap,
            "เปิด My Map",
            <Route className={iconClasses} aria-hidden="true" />,
            !googleMap
          )
        : null}
    </div>
  );
}
