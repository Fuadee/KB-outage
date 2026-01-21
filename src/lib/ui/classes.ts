import type { UrgencyColor } from "@/lib/dateUtils";

export const pageBg = "min-h-screen bg-slate-50";

export const cardBase =
  "rounded-2xl border border-slate-200/60 bg-white/80 shadow-sm transition hover:shadow-md";

export const primaryPurpleBtn =
  "text-white bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 " +
  "shadow-[0_10px_24px_rgba(124,58,237,0.25)] " +
  "hover:brightness-110 active:scale-[0.98] " +
  "focus-visible:ring-violet-300";


export const purpleBadge =
  "border border-violet-200/70 bg-gradient-to-b from-white to-violet-50 text-violet-700";


export const primaryBtn =
  `inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${primaryPurpleBtn}`;

export const secondaryBtn =
  "inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-100/60 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2";

export const ghostBtn =
  "inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium text-slate-600 transition hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2";

export const inputBase =
  "rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition " +
  "focus:border-purple-400 focus-visible:ring-2 focus-visible:ring-purple-200";


export const linkBase =
  "text-sm font-medium text-purple-600 underline-offset-4 transition hover:text-violet-700 hover:underline";


export const statusBadgeClasses = (status: UrgencyColor) => {
  switch (status) {
    case "RED":
      return "border border-rose-200/80 bg-rose-50 text-rose-700";
    case "YELLOW":
      return "border border-amber-200/80 bg-amber-50 text-amber-700";
    default:
      return "border border-emerald-200/80 bg-emerald-50 text-emerald-700";
  }
};
