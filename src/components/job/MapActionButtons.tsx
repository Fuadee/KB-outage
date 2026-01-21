"use client";

import type { ReactElement, SyntheticEvent } from "react";
import { MapPin, Route } from "lucide-react";
import { buttonStyles } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

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

  const iconClasses = "h-4 w-4 text-fuchsia-500";
  const mapButtonClasses = cn(
    buttonStyles({ variant: "secondary", size: "sm" }),
    "w-full justify-center md:w-auto"
  );

  const hasBoth = Boolean(googleMap && myMap);
  const wrapperClassName = className ? ` ${className}` : "";
  const layoutClasses = hasBoth
    ? "grid grid-cols-2 gap-2 mt-2 md:mt-1 md:justify-items-start"
    : "mt-2 md:mt-1";

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
      className={mapButtonClasses}
    >
      {icon}
      <span className="whitespace-nowrap text-slate-700">{label}</span>
    </a>
  );

  return (
    <div className={`${layoutClasses}${wrapperClassName}`}>
      {googleMap
        ? renderButton(
            googleMap,
            "Google Map",
            <MapPin className={iconClasses} aria-hidden="true" />,
            true
          )
        : null}
      {myMap
        ? renderButton(
            myMap,
            "My Map",
            <Route className={iconClasses} aria-hidden="true" />,
            !googleMap
          )
        : null}
    </div>
  );
}
