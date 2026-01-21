"use client";

import type { ReactElement, SyntheticEvent } from "react";
import { MapPin, Route } from "lucide-react";

type MapActionButtonsProps = {
  googleUrl?: string | null;
  myMapUrl?: string | null;
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
  className = ""
}: MapActionButtonsProps): ReactElement | null {
  const googleMap = normalizeMapUrl(googleUrl);
  const myMap = normalizeMapUrl(myMapUrl);

  if (!googleMap && !myMap) return null;

  const iconClasses = "h-4 w-4";
  const baseClasses =
    "flex items-center justify-center gap-2 w-full rounded-2xl py-3 text-sm font-semibold transition-all duration-200 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 relative z-10 select-none";

  const primaryClasses = `${baseClasses} text-white bg-gradient-to-r from-purple-600 via-violet-600 to-indigo-600 shadow-[0_12px_30px_rgba(124,58,237,0.35)] hover:brightness-110`;
  const twinPrimaryClasses = `${baseClasses} text-white bg-gradient-to-r from-indigo-600 via-purple-600 to-violet-600 shadow-[0_12px_30px_rgba(99,102,241,0.30)] hover:brightness-110`;

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
      className={isPrimary ? primaryClasses : twinPrimaryClasses}
    >
      {icon}
      <span>{label}</span>
    </a>
  );

  return (
    <div
      className={`${hasBoth ? "grid grid-cols-2 gap-2" : ""} mt-2${wrapperClassName}`}
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
