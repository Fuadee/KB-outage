import type { InputHTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { inputLight } from "@/lib/theme";

const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        inputLight,
        type === "date" && "[color-scheme:light]",
        className
      )}
      {...props}
    />
  )
);

Input.displayName = "Input";

export default Input;
