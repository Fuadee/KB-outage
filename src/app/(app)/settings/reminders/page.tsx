"use client";

import { FormEvent, useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { labelText, subtitleText, titleText } from "@/lib/theme";

type ReminderSettings = {
  timezone: string;
  lead_reminder_enabled: boolean;
  lead_reminder_days: number;
  lead_reminder_time: string;
  same_day_reminder_enabled: boolean;
  same_day_reminder_time: string;
};

const defaultSettings: ReminderSettings = {
  timezone: "Asia/Bangkok",
  lead_reminder_enabled: true,
  lead_reminder_days: 5,
  lead_reminder_time: "08:00",
  same_day_reminder_enabled: true,
  same_day_reminder_time: "14:30",
};

export default function ReminderSettingsPage() {
  const [settings, setSettings] = useState<ReminderSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    setIsLoading(true);

    fetch("/api/settings/reminders", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || !body.ok) {
          throw new Error(body?.error ?? "โหลดการตั้งค่าไม่สำเร็จ");
        }

        if (!isActive) return;
        setSettings(body.settings);
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (!isActive) return;
        const message =
          loadError instanceof Error ? loadError.message : "โหลดการตั้งค่าไม่สำเร็จ";
        setError(message);
      })
      .finally(() => {
        if (!isActive) return;
        setIsLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSaving(true);

    try {
      const response = await fetch("/api/settings/reminders", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(settings),
      });

      const body = await response.json();
      if (!response.ok || !body.ok) {
        throw new Error(body?.error ?? "บันทึกการตั้งค่าไม่สำเร็จ");
      }

      setSettings(body.settings);
      setSuccess("บันทึกการตั้งค่าเรียบร้อยแล้ว");
    } catch (saveError: unknown) {
      const message =
        saveError instanceof Error ? saveError.message : "บันทึกการตั้งค่าไม่สำเร็จ";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2 pb-1">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
          Settings
        </p>
        <h1 className={cn(titleText, "text-3xl")}>Reminder Settings</h1>
        <p className={subtitleText}>ตั้งค่าเปิด/ปิดการแจ้งเตือนและจำนวนวันล่วงหน้า</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>ตั้งค่าการแจ้งเตือน LINE (รายวัน)</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="grid gap-4 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4 sm:grid-cols-2">
              <label className={cn("flex items-center gap-3", labelText)}>
                <input
                  type="checkbox"
                  checked={settings.lead_reminder_enabled}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      lead_reminder_enabled: event.target.checked,
                    }))
                  }
                />
                เปิดแจ้งเตือนล่วงหน้า
              </label>

              <label className={cn("flex flex-col gap-2", labelText)}>
                จำนวนวันล่วงหน้า
                <Input
                  type="number"
                  min={0}
                  max={30}
                  value={settings.lead_reminder_days}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      lead_reminder_days: Number(event.target.value || 0),
                    }))
                  }
                  disabled={isLoading}
                />
              </label>

            </div>

            <div className="grid gap-4 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4 sm:grid-cols-2">
              <label className={cn("flex items-center gap-3", labelText)}>
                <input
                  type="checkbox"
                  checked={settings.same_day_reminder_enabled}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      same_day_reminder_enabled: event.target.checked,
                    }))
                  }
                />
                เปิดแจ้งเตือนวันจริง
              </label>

            </div>

            <p className="text-xs text-slate-500">
              ระบบส่งด้วย Vercel Cron วันละครั้ง (เวลา deploy คงที่) และอิง Asia/Bangkok
            </p>

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            ) : null}
            {success ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {success}
              </div>
            ) : null}

            <div>
              <Button type="submit" disabled={isLoading || isSaving} className="w-auto px-5">
                {isLoading ? "กำลังโหลด..." : isSaving ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
