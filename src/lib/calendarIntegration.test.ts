import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const calendarPage = readFileSync(
  new URL("../app/(app)/calendar/page.tsx", import.meta.url),
  "utf8"
);
const calendarRoute = readFileSync(
  new URL("../app/api/jobs/calendar/route.ts", import.meta.url),
  "utf8"
);
const jobsRoute = readFileSync(
  new URL("../app/api/jobs/route.ts", import.meta.url),
  "utf8"
);

test("calendar API reads the existing responsible unit and reuses status resolver", () => {
  assert.match(calendarRoute, /outage_date, responsible_unit, has_switching,/);
  assert.match(calendarRoute, /getLegacyCalendarStatus\(job\)/);
  assert.match(calendarRoute, /buildCalendarSummary/);
  assert.match(calendarRoute, /ensureSystemCertificateAuthorities\(\)/);
  assert.match(calendarRoute, /dynamic = "force-dynamic"/);
  assert.match(calendarRoute, /cache: "no-store"/);
  assert.match(calendarRoute, /"Cache-Control": "no-store, max-age=0"/);
  assert.doesNotMatch(calendarRoute, /department2|calendar_department|unit_name/);
});

test("calendar exposes all unit filters and applies them to day details", () => {
  assert.match(calendarPage, /label: "ทั้งหมด"/);
  assert.match(calendarPage, /label: "ผปบ\."/);
  assert.match(calendarPage, /label: "ผกส\."/);
  assert.match(calendarPage, /label: "อ่าวนาง"/);
  assert.match(calendarPage, /visibleDayJobs/);
  assert.match(calendarPage, /matchesResponsibleUnitFilter/);
  assert.match(jobsRoute, /id, outage_date, equipment_code, responsible_unit,/);
  assert.match(jobsRoute, /has_switching: job\.has_switching \?\? null/);
  assert.match(jobsRoute, /responsible_unit: job\.responsible_unit \?\? null/);
  assert.match(jobsRoute, /work_supervisor_name: job\.work_supervisor_name \?\? null/);
  assert.match(jobsRoute, /equipment_code: job\.equipment_code/);
  assert.match(jobsRoute, /area_title: job\.doc_area_title \?\? null/);
  assert.match(jobsRoute, /display_area: job\.doc_area_title \?\? job\.doc_purpose \?\? null/);
});

test("calendar keeps month navigation, today navigation, and caps summaries at three rows", () => {
  assert.match(calendarPage, /handlePreviousMonth/);
  assert.match(calendarPage, /prev\.getMonth\(\) - 1/);
  assert.match(calendarPage, /handleToday/);
  assert.match(calendarPage, /setCurrentMonth\(new Date\(\)\)/);
  assert.match(calendarPage, /handleNextMonth/);
  assert.match(calendarPage, /prev\.getMonth\(\) \+ 1/);
  assert.match(calendarPage, /entries\.slice\(0, 3\)/);
  assert.match(calendarPage, /\+ อีก \{hiddenJobCount\} งาน/);
});

test("responsible units use distinct, high-contrast filled chips", () => {
  assert.match(calendarPage, /border-blue-900 bg-blue-900 text-white/);
  assert.match(calendarPage, /border-teal-700 bg-teal-700 text-white/);
  assert.match(calendarPage, /border-purple-800 bg-purple-800 text-white/);
  assert.match(calendarPage, /border-slate-500 bg-slate-500 text-white/);
  assert.match(calendarPage, /getResponsibleUnitChipStyle\(entry\.responsible_unit\)/);
  assert.match(calendarPage, /h-5 max-w-full shrink-0/);
  assert.match(calendarPage, /text-\[11px\] font-semibold leading-none/);
  assert.match(calendarPage, /items-center gap-1\.5 leading-5/);
});

test("workflow steps and status dots share the same semantic colors", () => {
  assert.match(calendarPage, /Doc: \{ dot: "bg-amber-500" \}/);
  assert.match(calendarPage, /Posted: \{ dot: "bg-sky-500" \}/);
  assert.match(calendarPage, /Notice: \{ dot: "bg-violet-500" \}/);
  assert.match(calendarPage, /Done: \{ dot: "bg-emerald-500" \}/);
  assert.equal(
    (calendarPage.match(/border-amber-500 bg-amber-500 text-white/g) ?? [])
      .length,
    3
  );
  assert.match(calendarPage, /border-violet-500 bg-violet-500 text-white/);
  assert.match(calendarPage, /border-sky-500 bg-sky-500 text-white/);
  assert.match(calendarPage, /border-emerald-500 bg-emerald-500 text-white/);
  assert.match(calendarPage, /h-2 w-2 shrink-0 rounded-full/);
});

test("calendar renders Thai presentation helpers and the explanatory flow", () => {
  assert.match(calendarPage, /formatThaiCalendarMonth\(currentMonth\)/);
  assert.match(calendarPage, /THAI_CALENDAR_DAY_LABELS\.map/);
  assert.match(calendarPage, /getCalendarStatusLabel\(entry\.status\)/);
  assert.match(calendarPage, /CALENDAR_FLOW_STEPS\.map/);
  assert.match(calendarPage, /ปฏิทินงานดับไฟ/);
  assert.match(calendarPage, /ก่อนหน้า/);
  assert.match(calendarPage, /วันนี้/);
  assert.match(calendarPage, /ถัดไป/);
});

test("calendar prioritizes the month grid with compact flow and date hierarchy", () => {
  assert.match(calendarPage, /min-h-12 rounded-lg/);
  assert.match(calendarPage, /grid-cols-3 gap-x-1 gap-y-2 md:flex/);
  assert.match(calendarPage, /min-h-\[112px\]/);
  assert.match(calendarPage, /const isToday = isSameDate/);
  assert.match(calendarPage, /border-orange-400 bg-orange-50\/60/);
  assert.match(calendarPage, /const isWeekend =/);
  assert.match(calendarPage, /bg-slate-50\/70/);
});

test("mobile keeps a seven-column month overview and moves detail below it", () => {
  assert.match(calendarPage, /space-y-3 lg:hidden/);
  assert.match(calendarPage, /grid grid-cols-7 gap-1/);
  assert.match(calendarPage, /min-h-\[52px\]/);
  assert.match(calendarPage, /handleMobileDayClick\(date\)/);
  assert.match(calendarPage, /aria-pressed=\{isSelected\}/);
  assert.match(calendarPage, /งาน\{formatThaiCalendarDate\(selectedDate\)\}/);
  assert.match(calendarPage, /visibleDayJobs\.length/);
  assert.match(calendarPage, /<MobileSelectedDayJobCard/);
  assert.match(calendarPage, /ไม่มีงานในวันนี้/);
  assert.match(calendarPage, /fixed inset-0 z-50 hidden justify-end lg:flex/);
  assert.doesNotMatch(calendarPage, /window\.innerWidth|matchMedia/);
});

test("mobile cells show only status dots and counts while reusing filtered summary", () => {
  assert.match(calendarPage, /const daySummary = summaryByDate\.get\(dateKey\)/);
  assert.match(calendarPage, /const mobileStatuses = CALENDAR_STATUS_ORDER\.filter/);
  assert.match(calendarPage, /statusStyles\[status\]\.dot/);
  assert.match(calendarPage, /\{daySummary\.total\}/);
  assert.match(calendarPage, />\s*SW\s*</);
  assert.match(calendarPage, /setDayRequestRevision/);
  assert.match(calendarPage, /fetch\(`\/api\/jobs\?date=\$\{dateKey\}`\)/);
});

test("mobile selected-day detail renders actual compact jobs without drill-down", () => {
  const componentStart = calendarPage.indexOf(
    "function MobileSelectedDayJobCard"
  );
  const componentEnd = calendarPage.indexOf(
    "const responsibleUnitFilters",
    componentStart
  );
  const mobileCard = calendarPage.slice(componentStart, componentEnd);

  assert.match(mobileCard, /data-mobile-selected-job/);
  assert.match(mobileCard, /getResponsibleUnitShortLabel\(job\.responsible_unit\)/);
  assert.match(mobileCard, /getCalendarStatusLabel\(job\.status\)/);
  assert.match(mobileCard, /job\.equipment_code/);
  assert.match(mobileCard, /job\.display_area/);
  assert.match(mobileCard, /job\.work_supervisor_name \|\| "ยังไม่ระบุ"/);
  assert.match(mobileCard, /<UserRound/);
  assert.match(mobileCard, /break-words text-sm leading-5/);
  assert.doesNotMatch(mobileCard, /formatTimeRange|<Link|href=|onClick|chevron/i);
  assert.match(calendarPage, /visibleDayJobs\.map\(\(job\) =>/);
  assert.doesNotMatch(
    calendarPage.slice(
      calendarPage.indexOf('<section\n          aria-live="polite"'),
      calendarPage.indexOf("</section>", calendarPage.indexOf('<section\n          aria-live="polite"'))
    ),
    /selectedDaySummary|CalendarSummaryRow/
  );
});

test("mobile controls stay compact while wide tablet and desktop keep full presentation", () => {
  assert.match(calendarPage, /w-full max-w-full md:w-auto md:max-w-\[22rem\]/);
  assert.match(calendarPage, /grid w-full grid-cols-3 gap-2 md:flex/);
  assert.match(calendarPage, /min-h-10 w-full md:min-h-0 md:w-auto/);
  assert.match(calendarPage, /hidden min-w-0 max-w-full.*lg:block/);
  assert.match(calendarPage, /min-w-\[960px\] grid-cols-7/);
  assert.match(calendarPage, /xl:min-w-\[1240px\]/);
});
