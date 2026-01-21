import type { InputHTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition focus:border-fuchsia-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-200",
        className
      )}
      {...props}
    />
  )
);

Input.displayName = "Input";

export default Input;
