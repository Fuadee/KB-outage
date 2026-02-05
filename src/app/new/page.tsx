"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Button, { buttonStyles } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { createJob } from "@/lib/jobsRepo";
import { cn } from "@/lib/utils";
import { inputLight, labelText, subtitleText, titleText } from "@/lib/theme";

const textareaStyles = `${inputLight} min-h-[96px]`;

export default function NewJobPage() {
  const router = useRouter();
  const [outageDate, setOutageDate] = useState("");
  const [equipmentCode, setEquipmentCode] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!outageDate || !equipmentCode.trim()) {
      setError("กรุณากรอกวันที่และรหัสอุปกรณ์");
      return;
    }

    setLoading(true);
    const { error: insertError } = await createJob({
      outage_date: outageDate,
      equipment_code: equipmentCode.trim(),
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
    <div className="flex flex-col gap-6">
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
  );
}
