import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Krabi Outage Tracker",
  description: "Track planned outages in Krabi."
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>
        <div className="min-h-screen">
          <main className="mx-auto flex w-full max-w-5xl flex-col px-4 py-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
