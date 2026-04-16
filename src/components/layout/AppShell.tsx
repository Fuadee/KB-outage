"use client";

import { ReactNode } from "react";
import AppNavbar from "@/components/layout/AppNavbar";
import { appBg } from "@/lib/theme";

interface AppShellProps {
  children: ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  return (
    <div className={appBg}>
      <div className="flex min-h-[100dvh] flex-col">
        <AppNavbar />
        <main className="flex-1 px-4 pb-10 pt-5 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
