import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { btnPrimaryGradient, btnSecondaryLight } from "@/lib/theme";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "closeWork" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

type ButtonStyleProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
};

const baseStyles =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap transition duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-60";

const variantStyles: Record<ButtonVariant, string> = {
  primary: btnPrimaryGradient,
  secondary: btnSecondaryLight,
  ghost:
    "inline-flex items-center justify-center rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium text-slate-500 transition duration-150 ease-out hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-slate-200",
  closeWork:
    "rounded-[var(--radius-control)] bg-[var(--primary)] text-white shadow-sm hover:bg-[var(--primary-hover)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-orange-200 focus-visible:ring-offset-2",
  danger:
    "rounded-[var(--radius-control)] border border-rose-200 bg-white font-semibold text-rose-700 shadow-sm hover:border-rose-300 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-rose-100 focus-visible:ring-offset-2"
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-2 text-xs",
  md: "px-4 py-2.5 text-sm",
  lg: "px-5 py-3 text-sm"
};

export function buttonStyles({
  variant = "primary",
  size = "md",
  className
}: ButtonStyleProps) {
  if (variant === "ghost") {
    return cn(variantStyles[variant], className);
  }

  return cn(baseStyles, variantStyles[variant], sizeStyles[size], className);
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & ButtonStyleProps;

export default function Button({
  className,
  variant,
  size,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={buttonStyles({ variant, size, className })}
    />
  );
}
