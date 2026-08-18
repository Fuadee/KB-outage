import type { ReactElement } from "react";
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
  done: "border-emerald-600 bg-emerald-600",
  current: "border-orange-500 bg-orange-500 ring-2 ring-orange-100",
  pending: "border-slate-300 bg-white",
  locked: "border-slate-200 bg-slate-100"
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
    <ol className={cn("space-y-0.5", className)}>
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        return (
          <li key={step.id} className="relative flex items-start gap-2.5 pb-3 last:pb-0">
            <div className="relative mt-1 flex w-4 shrink-0 justify-center">
              <span className={cn("z-10 h-2.5 w-2.5 rounded-full border", stepTone[step.state])} />
              {!isLast ? (
                <span className="absolute top-3 h-6 w-px bg-slate-200/80" aria-hidden="true" />
              ) : null}
            </div>
            <span className={cn("text-xs leading-5", textTone[step.state])}>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
