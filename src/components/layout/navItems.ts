export type NavItem = {
  label: string;
  href: string;
  match?: (pathname: string) => boolean;
};

export const appNavItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard"
  },
  {
    label: "Jobs",
    href: "/jobs",
    match: (pathname) =>
      pathname === "/jobs" ||
      pathname.startsWith("/jobs/") ||
      pathname.startsWith("/job/")
  },
  {
    label: "Calendar",
    href: "/calendar"
  },
  {
    label: "ผู้ป่วยติดเตียง",
    href: "/bedridden-patients"
  },
  {
    label: "กลุ่มเฝ้าระวังพิเศษ",
    href: "/special-watchlist"
  }
];
