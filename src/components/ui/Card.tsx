import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { cardDark, subtitleText, titleText } from "@/lib/theme";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn(cardDark, className)} />;
}

export function CardHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn("px-5 pt-5 sm:px-6 sm:pt-6", className)} />;
}

export function CardTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 {...props} className={cn(titleText, className)} />;
}

export function CardDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return <p {...props} className={cn(subtitleText, className)} />;
}

export function CardContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn("px-5 pb-5 sm:px-6 sm:pb-6", className)} />;
}

export function CardFooter({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn("px-5 pb-5 sm:px-6 sm:pb-6", className)} />;
}
