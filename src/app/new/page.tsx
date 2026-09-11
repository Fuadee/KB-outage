"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import Button, { buttonStyles } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { createJob } from "@/lib/jobsRepo";
import {
  MAX_CUSTOMER_COUNT,
  parseCustomerCount,
  RESPONSIBLE_UNITS,
  type ResponsibleUnit
} from "@/lib/jobMetadata";
import { cn } from "@/lib/utils";
import { inputLight, labelText, subtitleText, titleText } from "@/lib/theme";

const textareaStyles = `${inputLight} min-h-[96px]`;

export default function NewJobPage() {
  const router = useRouter();
  const [outageDate, setOutageDate] = useState("");
  const [equipmentCode, setEquipmentCode] = useState("");
  const [responsibleUnit, setResponsibleUnit] = useState<ResponsibleUnit | "">("");
  const [customerCount, setCustomerCount] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!outageDate || !equipmentCode.trim() || !responsibleUnit) {
      setError("กรุณากรอกวันที่ รหัสอุปกรณ์ และเลือกหน่วยงานผู้รับผิดชอบ");
      return;
    }

    const parsedCustomerCount = parseCustomerCount(customerCount);
    if (!parsedCustomerCount.success) {
      setError(parsedCustomerCount.error);
      return;
    }

    setLoading(true);
    const { error: insertError } = await createJob({
      outage_date: outageDate,
      equipment_code: equipmentCode.trim(),
      responsible_unit: responsibleUnit,
      customer_count: parsedCustomerCount.value,
      note: note.trim() ? note.trim() : null
    });

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    router.push("/");
  };

  return (
    <AppShell>
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className={cn(titleText, "text-2xl")}>สร้างงานใหม่</h1>
        <p className={subtitleText}>ระบุรายละเอียดสำหรับงานดับไฟที่จะมาถึง</p>
      </header>

      <Card>
        <CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <label className={cn("flex flex-col gap-2", labelText)}>
              วันที่ดับไฟ
              <Input
                type="date"
                value={outageDate}
                onChange={(event) => setOutageDate(event.target.value)}
                required
              />
            </label>
            <label className={cn("flex flex-col gap-2", labelText)}>
              รหัสอุปกรณ์
              <Input
                type="text"
                value={equipmentCode}
                onChange={(event) => setEquipmentCode(event.target.value)}
                placeholder="เช่น TR-001"
                required
              />
            </label>
            <label className={cn("flex flex-col gap-2", labelText)}>
              หน่วยงานผู้รับผิดชอบ
              <select
                value={responsibleUnit}
                onChange={(event) =>
                  setResponsibleUnit(event.target.value as ResponsibleUnit | "")
                }
                className={inputLight}
                required
              >
                <option value="" disabled>
                  เลือกหน่วยงาน
                </option>
                {RESPONSIBLE_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </label>
            <label className={cn("flex flex-col gap-2", labelText)}>
              จำนวนผู้ใช้ไฟฟ้า
              <div className="relative">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={MAX_CUSTOMER_COUNT}
                  step={1}
                  value={customerCount}
                  onChange={(event) => setCustomerCount(event.target.value)}
                  placeholder="350"
                  className="pr-12"
                  aria-describedby="new-job-customer-count-helper"
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-500">
                  ราย
                </span>
              </div>
              <span
                id="new-job-customer-count-helper"
                className="text-xs font-normal text-slate-500"
              >
                ไม่บังคับ ระบุเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป
              </span>
            </label>
            <label className={cn("flex flex-col gap-2", labelText)}>
              หมายเหตุเพิ่มเติม
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={4}
                placeholder="กรอกรายละเอียดเพิ่มเติม (ถ้ามี)"
                className={textareaStyles}
              />
            </label>

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={loading} className="w-auto px-5">
                {loading ? "กำลังบันทึก..." : "บันทึก"}
              </Button>
              <Link href="/" className={buttonStyles({ variant: "secondary", className: "w-auto px-5" })}>
                ยกเลิก
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
    </AppShell>
  );
}
