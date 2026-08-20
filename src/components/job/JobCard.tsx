import type { ReactElement } from "react";
import { CircleCheck, Clock3, FileText, MapPin, TriangleAlert } from "lucide-react";
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
  gisIssueCount?: number;
  onReportGisIssue?: () => void;
  onOpenGisIssues?: () => void;
  onOpenDetail: () => void;
};

export default function JobCard({
  job,
  urgency,
  stepper,
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
  gisIssueCount = 0,
  onReportGisIssue,
  onOpenGisIssues,
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
          className: "border-amber-200 bg-amber-50 text-amber-800",
          message: `พบผู้ป่วยติดเตียงในพื้นที่ดับไฟ ${count} ราย`
        }
      : status === "NOT_FOUND_IN_POLYGON"
        ? {
          className: "border-transparent bg-emerald-50/65 text-emerald-800",
          message: "ตรวจแล้ว ไม่พบผู้ป่วยติดเตียงในพื้นที่ดับไฟ"
          }
        : status === "KML_FETCH_FAILED"
          ? {
              className: "border-amber-200 bg-amber-50 text-amber-800",
            message: "ตรวจสอบไม่ได้: โหลดข้อมูลแผนที่ไม่สำเร็จ"
            }
          : status === "NO_POLYGON_FOUND"
            ? {
                className: "border-amber-200 bg-amber-50 text-amber-800",
                message: "ตรวจสอบไม่ได้: ไม่พบ Polygon ใน My Maps"
              }
            : {
                className: "border-slate-200 bg-slate-50 text-slate-600",
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
          className: "border-amber-200 bg-amber-50 text-amber-800",
          message: `พบกลุ่มเฝ้าระวังพิเศษในพื้นที่ดับไฟ ${specialCount} ราย`
        }
      : specialStatus === "NOT_FOUND_IN_POLYGON"
        ? {
            className: "border-transparent bg-emerald-50/65 text-emerald-800",
            message: "ตรวจแล้ว ไม่พบกลุ่มเฝ้าระวังพิเศษในพื้นที่ดับไฟ"
          }
        : specialStatus === "KML_FETCH_FAILED" || specialStatus === "NO_POLYGON_FOUND"
          ? {
              className: "border-amber-200 bg-amber-50 text-amber-800",
              message: `ตรวจสอบกลุ่มเฝ้าระวังพิเศษไม่ได้: ${specialWatchlistCheckError || "โหลดข้อมูลแผนที่ไม่สำเร็จ"}`
            }
          : {
              className: "border-slate-200 bg-slate-50 text-slate-600",
              message: "ยังไม่ได้ตรวจสอบกลุ่มเฝ้าระวังพิเศษ"
            };

  return (
    <article
      className={cn(
        "rounded-[15px] border border-slate-200/80 bg-[#fffefd] shadow-[var(--shadow-card)] transition duration-150 ease-out hover:border-slate-300/80",
        isClosed && "bg-slate-50/80 opacity-90"
      )}
    >
      <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[200px_minmax(0,1fr)_230px] lg:gap-5">
        <section className="min-w-0 space-y-2 border-b border-[#e8ecf2] pb-5 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-5">
          <p className={cn("text-xs font-medium text-slate-500", highlightDay && "font-semibold text-orange-700")}>
            {outageDate.toLocaleDateString("th-TH", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
          </p>
          <div className="flex flex-nowrap items-center gap-2">
            <p className="whitespace-nowrap text-xl font-semibold tracking-tight text-slate-900">{job.equipment_code}</p>
            <StatusBadge status={urgency.color} label={urgency.color} compact />
          </div>
          <p className={cn("text-xs font-medium", urgency.color === "RED" ? "text-red-700" : urgency.color === "YELLOW" ? "text-amber-700" : "text-emerald-700")}>{urgency.label}</p>
          {isClosed ? (
            <p className="text-[11px] text-slate-500">
              ปิดงาน: {job.closed_at ? new Date(job.closed_at).toLocaleString("th-TH") : "-"}
            </p>
          ) : null}
        </section>

        <section className="min-w-0 space-y-3 border-b border-[#e8ecf2] pb-5 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-5">
          <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-baseline sm:gap-3">
            <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-medium text-slate-600">
              <Clock3 className="h-3.5 w-3.5" />
              {job.doc_time_start && job.doc_time_end
                ? `${job.doc_time_start}–${job.doc_time_end}`
                : "ยังไม่กำหนดช่วงเวลา"}
            </span>
            <p className="min-w-0 text-sm font-semibold leading-6 text-slate-800 sm:truncate">
              {job.doc_area_title || job.doc_purpose || "ยังไม่มีรายละเอียดงาน"}
            </p>
          </div>
          {job.note?.trim() ? (
            <p className="line-clamp-2 text-xs leading-5 text-slate-600">{job.note.trim()}</p>
          ) : null}

          <JobStatusStepper steps={stepper} className="pt-0.5" />

          <div className="grid gap-2 xl:grid-cols-2">
            <div className={cn("rounded-[9px] border px-3 py-2 text-xs leading-5", vulnerableUi.className)}>
              <p className="font-medium">ตรวจสอบผู้ป่วยติดเตียง</p>
              <p className="mt-0.5 flex items-start gap-1.5">
                {status === "NOT_FOUND_IN_POLYGON" ? (
                  <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                ) : status ? (
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                ) : null}
                <span>
                  {vulnerableUi.message}
                  {status === "FOUND_IN_POLYGON" && canOpenVulnerableList && onOpenVulnerableList ? (
                    <button type="button" onClick={onOpenVulnerableList} className="ml-2 underline underline-offset-2">
                      ดูรายชื่อ
                    </button>
                  ) : null}
                </span>
              </p>
              {checkedAtText ? (
                <p className="mt-1 text-[11px] text-slate-500">ตรวจเมื่อ: {checkedAtText}</p>
              ) : null}
              {vulnerableCheckError ? (
                <p className="mt-1 text-[11px] text-slate-500">{vulnerableCheckError}</p>
              ) : null}
            </div>
            <div className={cn("rounded-[9px] border px-3 py-2 text-xs leading-5", specialUi.className)}>
              <p className="font-medium">ตรวจสอบกลุ่มเฝ้าระวังพิเศษ</p>
              <p className="mt-0.5 flex items-start gap-1.5">
                {specialStatus === "NOT_FOUND_IN_POLYGON" ? (
                  <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                ) : specialStatus ? (
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                ) : null}
                <span>
                  {specialUi.message}
                  {specialStatus === "FOUND_IN_POLYGON" && canOpenSpecialWatchlist && onOpenSpecialWatchlist ? (
                    <button type="button" onClick={onOpenSpecialWatchlist} className="ml-2 underline underline-offset-2">
                      ดูรายชื่อ
                    </button>
                  ) : null}
                </span>
              </p>
              {specialCheckedAtText ? <p className="mt-1 text-[11px] text-slate-500">ตรวจเมื่อ: {specialCheckedAtText}</p> : null}
            </div>
          </div>
          <div className="mt-1">
            <button
              type="button"
              onClick={onRecheckImpactGroups}
              disabled={impactGroupsChecking}
              className="inline-flex items-center justify-start rounded-[7px] px-2 py-1.5 text-xs font-medium text-slate-600 transition duration-150 ease-out hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {impactGroupsChecking ? "กำลังตรวจสอบกลุ่มผลกระทบ..." : "ตรวจสอบอีกครั้ง"}
            </button>
          </div>
          <MapActionButtons googleUrl={job.map_link} className="mt-2" />
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
              className="min-h-9 w-full justify-start"
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
                <span key={item} className="rounded-full bg-emerald-50/70 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                  {item}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-1 grid gap-1.5">
            {gisIssueCount > 0 && onOpenGisIssues ? (
              <button
                type="button"
                onClick={onOpenGisIssues}
                className="inline-flex items-center justify-center gap-1.5 rounded-[9px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
              >
                <TriangleAlert className="h-3.5 w-3.5" /> GIS Issues {gisIssueCount}
              </button>
            ) : null}
            {onReportGisIssue ? (
              <button
                type="button"
                onClick={onReportGisIssue}
                className="inline-flex items-center justify-center gap-1.5 rounded-[9px] px-3 py-2 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              >
                <TriangleAlert className="h-3.5 w-3.5" /> พบปัญหาข้อมูล GIS
              </button>
            ) : null}
          </div>

          <Button type="button" size="sm" variant="ghost" className="mt-auto justify-start" onClick={onOpenDetail}>
            ดูรายละเอียดเพิ่มเติม
          </Button>
        </section>
      </div>
    </article>
  );
}
