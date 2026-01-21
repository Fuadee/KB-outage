import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

type ButtonStyleProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
};

const baseStyles =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-r from-fuchsia-500 via-purple-500 to-pink-500 text-white shadow-[0_16px_30px_rgba(236,72,153,0.25)] hover:brightness-110",
  secondary:
    "border border-slate-200/80 bg-white text-slate-700 shadow-sm hover:bg-slate-50",
  ghost: "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-sm"
};

export function buttonStyles({
  variant = "primary",
  size = "md",
  className
}: ButtonStyleProps) {
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
