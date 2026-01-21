type DashboardSummary = {
  ok: true;
  activeJobs: number;
  pendingApproval: number;
  scheduledNotices: number;
};

type DashboardSummaryError = {
  ok: false;
  error: string;
};

async function getDashboardSummary() {
  try {
    const response = await fetch("/api/dashboard/summary", {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("Failed to load dashboard summary");
    }

    const data = (await response.json()) as
      | DashboardSummary
      | DashboardSummaryError;

    if (!data.ok) {
      return { data: null, error: data.error };
    }

    return { data, error: null };
  } catch (error) {
    console.error("Failed to load dashboard summary", error);
    return {
      data: null,
      error: "ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่"
    };
  }
}

export default async function DashboardPage() {
  const { data, error } = await getDashboardSummary();
  const hasFallback = !data;
  const cards = [
    {
      title: "Active Jobs",
      value: data
        ? (data.activeJobs ?? 0).toLocaleString("en-US")
        : "—",
      description: "งานที่กำลังดำเนินการ"
    },
    {
      title: "Pending Approval",
      value: data
        ? (data.pendingApproval ?? 0).toLocaleString("en-US")
        : "—",
      description: "รายการรอการอนุมัติ"
    },
    {
      title: "Scheduled Notices",
      value: data
        ? (data.scheduledNotices ?? 0).toLocaleString("en-US")
        : "—",
      description: "หนังสือแจ้งที่ตั้งเวลาไว้"
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-400">
          Overview
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">
          Dashboard
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          สรุปภาพรวมงานล่าสุดและสถานะที่ต้องติดตาม
        </p>
      </div>
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          {error}
        </div>
      ) : null}
      {hasFallback ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
          แสดงผลแบบ fallback เนื่องจากไม่สามารถโหลดข้อมูลได้
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <div
            key={card.title}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-sm font-medium text-slate-500">
              {card.title}
            </p>
            <p className="mt-3 text-2xl font-semibold text-slate-900">
              {card.value}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              {card.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
