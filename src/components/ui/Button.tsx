import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { btnPrimaryGradient, btnSecondaryLight } from "@/lib/theme";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

type ButtonStyleProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
};

const baseStyles =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition disabled:cursor-not-allowed disabled:opacity-60";

const variantStyles: Record<ButtonVariant, string> = {
  primary: btnPrimaryGradient,
  secondary: btnSecondaryLight,
  ghost:
    "inline-flex items-center justify-center rounded-2xl px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100/80 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2"
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-2 text-xs",
  md: "px-4 py-3 text-sm",
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
