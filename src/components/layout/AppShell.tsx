"use client";

import { ReactNode } from "react";
import AppNavbar from "@/components/layout/AppNavbar";
import { appBg } from "@/lib/theme";

interface AppShellProps {
  children: ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  return (
    <div className={`${appBg} h-dvh overflow-hidden`}>
      <div className="flex h-full min-h-0 flex-col">
        <AppNavbar />
        <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-12 pt-6 sm:px-6 sm:pt-8 lg:px-8">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
