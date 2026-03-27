import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { reminderConfig } from "@/lib/reminderConfig";
import { cn } from "@/lib/utils";
import { subtitleText, titleText } from "@/lib/theme";

export default function ReminderSettingsPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-2 pb-1">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Settings</p>
        <h1 className={cn(titleText, "text-3xl")}>Reminder Settings</h1>
        <p className={subtitleText}>หน้านี้เป็นแบบอ่านอย่างเดียว (read-only) เพื่อให้ behavior ตรงกับ cron จริง</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Reminder ถูกกำหนดจาก code โดยตรง</CardTitle>
          <p className="text-sm text-slate-500">
            ระบบไม่อ่าน reminder settings จากฐานข้อมูลอีกต่อไป และไม่มีการแก้ไขผ่านหน้าเว็บ
          </p>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-700">
          <p>
            โซนเวลา: <span className="font-semibold">{reminderConfig.timezone}</span>
          </p>
          <p>
            cron รันเวลา: <span className="font-semibold">{reminderConfig.cronRunTimeDisplay} น.</span> ทุกวัน
          </p>
          <p>
            lead reminder: <span className="font-semibold">{reminderConfig.leadReminderEnabled ? "เปิด" : "ปิด"}</span>
            {" "}(ล่วงหน้า {reminderConfig.leadReminderDays} วัน)
          </p>
          <p>
            same-day reminder: <span className="font-semibold">{reminderConfig.sameDayReminderEnabled ? "เปิด" : "ปิด"}</span>
            {" "}(วันปฏิบัติงาน)
          </p>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
            ไม่มีปุ่ม Save/Edit เพื่อหลีกเลี่ยงความสับสนระหว่างเวลาบน UI กับเวลาที่ cron รันจริง
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
