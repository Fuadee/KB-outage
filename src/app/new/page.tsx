"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createJob } from "@/lib/jobsRepo";

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
        <h1 className="text-2xl font-semibold">สร้างงานใหม่</h1>
        <p className="text-sm text-slate-500">
          ระบุรายละเอียดสำหรับงานดับไฟที่จะมาถึง
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-6 rounded-2xl bg-white p-6 shadow-sm"
      >
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          วันที่ดับไฟ
          <input
            type="date"
            value={outageDate}
            onChange={(event) => setOutageDate(event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400"
            required
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          รหัสอุปกรณ์
          <input
            type="text"
            value={equipmentCode}
            onChange={(event) => setEquipmentCode(event.target.value)}
            placeholder="เช่น TR-001"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400"
            required
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          หมายเหตุเพิ่มเติม
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={4}
            placeholder="กรอกรายละเอียดเพิ่มเติม (ถ้ามี)"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400"
          />
        </label>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "กำลังบันทึก..." : "บันทึก"}
          </button>
          <Link
            href="/"
            className="rounded-xl border border-slate-200 px-5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100"
          >
            ยกเลิก
          </Link>
        </div>
      </form>
    </div>
  );
}
