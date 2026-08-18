import type { ReactElement } from "react";
import Button from "@/components/ui/Button";

type JobPrimaryActionProps = {
  id?: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loadingLabel?: string;
  loading?: boolean;
};

export default function JobPrimaryAction({
  id,
  label,
  onClick,
  disabled,
  loading,
  loadingLabel
}: JobPrimaryActionProps): ReactElement {
  const isCloseWorkAction = id === "close_job" || label === "ปิดงาน";

  return (
    <Button
      type="button"
      size="sm"
      variant={isCloseWorkAction ? "closeWork" : "primary"}
      className="min-h-9 w-full"
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading ? (loadingLabel ?? "กำลังดำเนินการ...") : label}
    </Button>
  );
}
