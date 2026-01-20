"use client";

import type { ReactElement } from "react";

type ExternalMapLinkProps = {
  url?: string;
  label?: string;
  className?: string;
};

type MapLinkState =
  | { status: "empty" }
  | { status: "invalid" }
  | { status: "valid"; url: string };

const normalizeMapUrl = (value?: string): MapLinkState => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return { status: "empty" };
  }

  const normalized = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { status: "invalid" };
    }
    return { status: "valid", url: parsed.toString() };
  } catch {
    return { status: "invalid" };
  }
};

export default function ExternalMapLink({
  url,
  label = "เปิด My Map",
  className = ""
}: ExternalMapLinkProps): ReactElement {
  const result = normalizeMapUrl(url);
  const sharedClassName = className ? ` ${className}` : "";

  if (result.status === "valid") {
    return (
      <a
        href={result.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center text-sm font-medium text-blue-600 underline transition hover:text-blue-700${sharedClassName}`}
      >
        {label}
      </a>
    );
  }

  const fallbackLabel =
    result.status === "empty" ? "ไม่มีลิงก์แผนที่" : "ลิงก์ไม่ถูกต้อง";

  return (
    <span
      className={`text-sm text-slate-400${sharedClassName}`}
    >
      {fallbackLabel}
    </span>
  );
}
