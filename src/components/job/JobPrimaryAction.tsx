import type { ReactElement } from "react";
import Button from "@/components/ui/Button";

type JobPrimaryActionProps = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loadingLabel?: string;
  loading?: boolean;
};

export default function JobPrimaryAction({
  label,
  onClick,
  disabled,
  loading,
  loadingLabel
}: JobPrimaryActionProps): ReactElement {
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      className="h-9 w-full justify-start rounded-md border-slate-500 bg-slate-800/80 px-3 text-xs font-semibold tracking-normal"
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading ? (loadingLabel ?? "กำลังดำเนินการ...") : label}
    </Button>
  );
}
