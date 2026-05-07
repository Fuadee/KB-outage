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
  vulnerableCheckStatus?: string | null;
  vulnerableCheckCount?: number | null;
  vulnerableCheckedAt?: string | null;
  vulnerableCheckError?: string | null;
  specialWatchlistCheckStatus?: string | null;
  specialWatchlistCheckCount?: number | null;
  specialWatchlistCheckedAt?: string | null;
  specialWatchlistCheckError?: string | null;
  canOpenSpecialWatchlist?: boolean;
  onOpenSpecialWatchlist?: () => void;
  canOpenVulnerableList?: boolean;
  onOpenVulnerableList?: () => void;
  onRecheckImpactGroups?: () => void;
  impactGroupsChecking?: boolean;
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
  vulnerableCheckStatus,
  vulnerableCheckCount,
  vulnerableCheckedAt,
  vulnerableCheckError,
  specialWatchlistCheckStatus,
  specialWatchlistCheckCount,
  specialWatchlistCheckedAt,
  specialWatchlistCheckError,
  canOpenSpecialWatchlist,
  onOpenSpecialWatchlist,
  canOpenVulnerableList,
  onOpenVulnerableList,
  onRecheckImpactGroups,
  impactGroupsChecking,
  onOpenDetail
}: JobCardProps): ReactElement {
  const isClosed = job.is_closed ?? false;
  const outageDate = parseLocalDate(job.outage_date);
  const highlightDay = urgency.daysLeft === 0 || urgency.daysLeft === 1;
  const status = vulnerableCheckStatus?.trim() || null;
  const count = Number(vulnerableCheckCount ?? 0);
  const checkedAt = vulnerableCheckedAt ? new Date(vulnerableCheckedAt) : null;
  const checkedAtText =
    checkedAt && !Number.isNaN(checkedAt.getTime())
      ? checkedAt.toLocaleString("en-GB", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false
        })
      : null;

  const vulnerableUi =
    status === "FOUND_IN_POLYGON"
      ? {
          className: "border-amber-500/50 bg-amber-500/10 text-amber-200",
          message: `⚠️ พบผู้ป่วยติดเตียงในพื้นที่ดับไฟ ${count} ราย`
        }
      : status === "NOT_FOUND_IN_POLYGON"
        ? {
            className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
            message: "✅ ตรวจแล้ว ไม่พบผู้ป่วยติดเตียงในพื้นที่ดับไฟ"
          }
        : status === "KML_FETCH_FAILED"
          ? {
              className: "border-slate-500/50 bg-slate-800/80 text-amber-200",
              message: "⚠️ ตรวจสอบไม่ได้: โหลดข้อมูลแผนที่ไม่สำเร็จ"
            }
          : status === "NO_POLYGON_FOUND"
            ? {
                className: "border-slate-500/50 bg-slate-800/80 text-amber-200",
                message: "⚠️ ตรวจสอบไม่ได้: ไม่พบ Polygon ใน My Maps"
              }
            : {
                className: "border-slate-600 bg-slate-800 text-slate-300",
                message: "ยังไม่ได้ตรวจสอบผู้ป่วยติดเตียง"
              };

  const specialStatus = specialWatchlistCheckStatus?.trim() || null;
  const specialCount = Number(specialWatchlistCheckCount ?? 0);
  const specialCheckedAt = specialWatchlistCheckedAt
    ? new Date(specialWatchlistCheckedAt)
    : null;
  const specialCheckedAtText =
    specialCheckedAt && !Number.isNaN(specialCheckedAt.getTime())
      ? specialCheckedAt.toLocaleString("en-GB", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false
        })
      : null;
  const specialUi =
    specialStatus === "FOUND_IN_POLYGON"
      ? {
          className: "border-amber-500/50 bg-amber-500/10 text-amber-200",
          message: `⚠️ พบกลุ่มเฝ้าระวังพิเศษในพื้นที่ดับไฟ ${specialCount} ราย`
        }
      : specialStatus === "NOT_FOUND_IN_POLYGON"
        ? {
            className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
            message: "✅ ตรวจแล้ว ไม่พบกลุ่มเฝ้าระวังพิเศษในพื้นที่ดับไฟ"
          }
        : specialStatus === "KML_FETCH_FAILED" || specialStatus === "NO_POLYGON_FOUND"
          ? {
              className: "border-slate-500/50 bg-slate-800/80 text-amber-200",
              message: `⚠️ ตรวจสอบกลุ่มเฝ้าระวังพิเศษไม่ได้: ${specialWatchlistCheckError || "โหลดข้อมูลแผนที่ไม่สำเร็จ"}`
            }
          : {
              className: "border-slate-600 bg-slate-800 text-slate-300",
              message: "ยังไม่ได้ตรวจสอบกลุ่มเฝ้าระวังพิเศษ"
            };

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
          <div className={cn("mt-2 rounded-md border px-2 py-1 text-xs", vulnerableUi.className)}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em]">ตรวจสอบผู้ป่วยติดเตียง</p>
            <p className="mt-0.5">
              {vulnerableUi.message}
              {status === "FOUND_IN_POLYGON" && canOpenVulnerableList && onOpenVulnerableList ? (
                <button type="button" onClick={onOpenVulnerableList} className="ml-2 underline underline-offset-2">
                  ดูรายชื่อ
                </button>
              ) : null}
            </p>
            {checkedAtText ? (
              <p className="mt-1 text-[11px] text-slate-300">ตรวจเมื่อ: {checkedAtText}</p>
            ) : null}
            {vulnerableCheckError ? (
              <p className="mt-1 text-[11px] text-slate-300">{vulnerableCheckError}</p>
            ) : null}
          </div>
          <div className={cn("mt-2 rounded-md border px-2 py-1 text-xs", specialUi.className)}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em]">ตรวจสอบกลุ่มเฝ้าระวังพิเศษ</p>
            <p className="mt-0.5">
              {specialUi.message}
              {specialStatus === "FOUND_IN_POLYGON" && canOpenSpecialWatchlist && onOpenSpecialWatchlist ? (
                <button type="button" onClick={onOpenSpecialWatchlist} className="ml-2 underline underline-offset-2">
                  ดูรายชื่อ
                </button>
              ) : null}
            </p>
            {specialCheckedAtText ? <p className="mt-1 text-[11px] text-slate-300">ตรวจเมื่อ: {specialCheckedAtText}</p> : null}
          </div>
          <div className="mt-2">
            <button
              type="button"
              onClick={onRecheckImpactGroups}
              disabled={impactGroupsChecking}
              className="inline-flex w-full items-center justify-center rounded-md border border-cyan-400/60 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {impactGroupsChecking ? "กำลังตรวจสอบกลุ่มผลกระทบ..." : "ตรวจสอบอีกครั้ง"}
            </button>
          </div>
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
