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
      variant="primary"
      className="w-full uppercase tracking-wide"
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading ? (loadingLabel ?? "กำลังดำเนินการ...") : label}
    </Button>
  );
}
