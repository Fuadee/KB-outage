import type { ReactElement } from "react";
import { Clock3, FileText, MapPin, TriangleAlert } from "lucide-react";
import MapActionButtons from "@/components/job/MapActionButtons";
import JobPrimaryAction from "@/components/job/JobPrimaryAction";
import JobStatusStepper, { type JobStep } from "@/components/job/JobStatusStepper";
import StatusBadge from "@/components/StatusBadge";
import Button from "@/components/ui/Button";
import type { OutageJob } from "@/lib/jobsRepo";
import type { UrgencyColor } from "@/lib/dateUtils";
import { parseLocalDate } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";

export type JobAction = {
  id: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
};

type JobCardProps = {
  job: OutageJob;
  urgency: { color: UrgencyColor; label: string; daysLeft: number };
  stepper: JobStep[];
  nextActionLabel: string;
  primaryAction?: JobAction;
  secondaryActions: JobAction[];
  tertiaryItems: string[];
  onOpenDetail: () => void;
};

export default function JobCard({
  job,
  urgency,
  stepper,
  nextActionLabel,
  primaryAction,
  secondaryActions,
  tertiaryItems,
  onOpenDetail
}: JobCardProps): ReactElement {
  const isClosed = job.is_closed ?? false;
  const outageDate = parseLocalDate(job.outage_date);
  const highlightDay = urgency.daysLeft === 0 || urgency.daysLeft === 1;

  return (
    <article
      className={cn(
        "rounded-xl border border-slate-600 bg-[#111827] shadow-[0_10px_30px_-24px_rgba(2,6,23,0.9)]",
        isClosed && "border-slate-700 bg-[#0f172a] opacity-85"
      )}
    >
      <div className="grid gap-3 p-3 md:p-4 xl:grid-cols-[220px_minmax(0,1fr)_220px_220px]">
        <section className="space-y-2 border-b border-slate-700 pb-3 xl:border-b-0 xl:border-r xl:pb-0 xl:pr-3">
          <p className={cn("text-xs font-semibold uppercase tracking-[0.08em] text-slate-300", highlightDay && "text-orange-300")}>
            {outageDate.toLocaleDateString("th-TH", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
          </p>
          <div className="flex items-center gap-2">
            <p className="text-lg font-semibold text-slate-100">{job.equipment_code}</p>
            <StatusBadge status={urgency.color} label={urgency.color} compact />
          </div>
          <p className={cn("text-xs font-medium", urgency.color === "RED" ? "text-red-300" : urgency.color === "YELLOW" ? "text-amber-300" : "text-emerald-300")}>{urgency.label}</p>
          {isClosed ? (
            <p className="text-[11px] text-slate-400">
              ปิดงาน: {job.closed_at ? new Date(job.closed_at).toLocaleString("th-TH") : "-"}
            </p>
          ) : null}
        </section>

        <section className="space-y-2 border-b border-slate-700 pb-3 xl:border-b-0 xl:border-r xl:pb-0 xl:pr-3">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <Clock3 className="h-3.5 w-3.5" />
            <span>
              {job.doc_time_start && job.doc_time_end ? `${job.doc_time_start} - ${job.doc_time_end}` : "ยังไม่กำหนดช่วงเวลา"}
            </span>
          </div>
          <p className="line-clamp-2 text-sm text-slate-100">{job.doc_area_title || job.doc_purpose || "ยังไม่มีรายละเอียดงาน"}</p>
          <p className="line-clamp-2 text-xs text-slate-400">{job.note?.trim() || "ไม่มีหมายเหตุเพิ่มเติม"}</p>
          <MapActionButtons googleUrl={job.map_link} className="mt-3" />
        </section>

        <section className="space-y-2 border-b border-slate-700 pb-3 xl:border-b-0 xl:border-r xl:pb-0 xl:pr-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Workflow</div>
          <JobStatusStepper steps={stepper} />
          <p className="flex items-center gap-1 text-[11px] text-orange-300">
            <TriangleAlert className="h-3 w-3" /> ขั้นตอนถัดไป: {nextActionLabel}
          </p>
        </section>

        <section className="flex flex-col gap-2">
          {primaryAction && !isClosed ? (
            <JobPrimaryAction id={primaryAction.id} label={primaryAction.label} onClick={primaryAction.onClick} disabled={primaryAction.disabled} />
          ) : null}

          {secondaryActions.map((action) => (
            <Button
              key={action.id}
              type="button"
              size="sm"
              variant={action.id === "close_job" || action.label === "ปิดงาน" ? "closeWork" : "secondary"}
              className="w-full justify-start"
              onClick={action.onClick}
              disabled={action.disabled}
            >
              {action.id.includes("doc") ? <FileText className="h-3.5 w-3.5" /> : action.id.includes("map") ? <MapPin className="h-3.5 w-3.5" /> : null}
              {action.label}
            </Button>
          ))}

          {tertiaryItems.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {tertiaryItems.map((item) => (
                <span key={item} className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-[10px] font-medium text-slate-300">
                  {item}
                </span>
              ))}
            </div>
          ) : null}

          <Button type="button" size="sm" variant="ghost" className="mt-auto justify-start text-slate-300 hover:text-white" onClick={onOpenDetail}>
            ดูรายละเอียดเพิ่มเติม
          </Button>
        </section>
      </div>
    </article>
  );
}
