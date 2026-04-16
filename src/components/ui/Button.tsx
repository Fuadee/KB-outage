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
  "inline-flex items-center justify-center gap-2 whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-60";

const variantStyles: Record<ButtonVariant, string> = {
  primary: btnPrimaryGradient,
  secondary: btnSecondaryLight,
  ghost:
    "inline-flex items-center justify-center rounded-md px-3 py-2 text-sm text-slate-500 transition hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
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
