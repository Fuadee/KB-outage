"use client";

import { useEffect, useState, type ReactElement, type SyntheticEvent } from "react";
import { Clipboard, ClipboardCheck } from "lucide-react";
import Button from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type CopyNoticeButtonProps = {
  onCopy: (event: SyntheticEvent) => Promise<void> | void;
  label?: string;
  copiedLabel?: string;
  title?: string;
  className?: string;
};

export default function CopyNoticeButton({
  onCopy,
  label = "คัดลอกข้อความ",
  copiedLabel = "คัดลอกแล้ว",
  title = "คัดลอกข้อความแจ้งเตือน",
  className
}: CopyNoticeButtonProps): ReactElement {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleCopy = async (event: SyntheticEvent) => {
    await onCopy(event);
    setCopied(true);
  };

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      title={title}
      aria-label={title}
      onClick={(event) => void handleCopy(event)}
      className={cn(
        "h-8 !w-auto rounded-md border-slate-600 bg-transparent px-2.5 py-1.5 text-[11px] font-medium text-slate-300 hover:border-slate-500 hover:bg-slate-800/60 hover:text-slate-100",
        "focus-visible:ring-orange-300",
        className
      )}
    >
      {copied ? <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" /> : <Clipboard className="h-3.5 w-3.5" aria-hidden="true" />}
      <span className="whitespace-nowrap">{copied ? copiedLabel : label}</span>
    </Button>
  );
}
