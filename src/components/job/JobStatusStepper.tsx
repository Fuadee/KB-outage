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
  done: "border-emerald-500 bg-emerald-500",
  current: "border-orange-500 bg-orange-500",
  pending: "border-slate-500 bg-slate-700",
  locked: "border-slate-600 bg-slate-800"
};

const textTone: Record<JobStepState, string> = {
  done: "text-slate-100",
  current: "text-orange-300",
  pending: "text-slate-300",
  locked: "text-slate-500"
};

export default function JobStatusStepper({
  steps,
  className
}: JobStatusStepperProps): ReactElement {
  return (
    <ol className={cn("space-y-2", className)}>
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        return (
          <li key={step.id} className="relative flex items-start gap-2.5 pb-2 last:pb-0">
            <div className="relative mt-0.5 flex w-4 shrink-0 justify-center">
              <span className={cn("h-2.5 w-2.5 rounded-sm border", stepTone[step.state])} />
              {!isLast ? (
                <span className="absolute top-3 h-4 w-px bg-slate-600" aria-hidden="true" />
              ) : null}
            </div>
            <span className={cn("text-xs font-medium", textTone[step.state])}>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
