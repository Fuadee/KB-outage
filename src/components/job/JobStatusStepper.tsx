import type { ReactElement } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type JobStepState = "done" | "current" | "pending" | "locked";

export type JobStep = {
  id: string;
  label: string;
  state: JobStepState;
};

type JobStatusStepperProps = {
  steps: JobStep[];
  className?: string;
};

const stepTone: Record<JobStepState, string> = {
  done: "border-emerald-600 bg-emerald-600 text-white",
  current: "border-orange-500 bg-orange-500 text-white ring-2 ring-orange-100",
  pending: "border-slate-300 bg-white text-slate-400",
  locked: "border-slate-300 bg-slate-50 text-slate-400"
};

const textTone: Record<JobStepState, string> = {
  done: "text-slate-700",
  current: "font-medium text-orange-700",
  pending: "text-slate-500",
  locked: "text-slate-500"
};

export default function JobStatusStepper({
  steps,
  className
}: JobStatusStepperProps): ReactElement {
  return (
    <div className={cn("overflow-x-auto pb-1", className)}>
      <ol className="flex min-w-[620px] items-center" aria-label="สถานะ Workflow">
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;
          return (
            <li
              key={step.id}
              className={cn(
                "flex min-w-0 items-center",
                isLast ? "shrink-0" : "flex-1"
              )}
              aria-current={step.state === "current" ? "step" : undefined}
            >
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                  stepTone[step.state]
                )}
                aria-hidden="true"
              >
                {step.state === "done" ? (
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                ) : step.state === "current" ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-white" />
                ) : null}
              </span>
              <span
                className={cn(
                  "ml-1.5 whitespace-nowrap text-[11px] leading-4",
                  textTone[step.state]
                )}
              >
                {step.label}
              </span>
              {!isLast ? (
                <span
                  className={cn(
                    "mx-2 h-px min-w-3 flex-1",
                    step.state === "done" ? "bg-emerald-300" : "bg-slate-200"
                  )}
                  aria-hidden="true"
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
