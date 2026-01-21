export default function DashboardLoading() {
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
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={`dashboard-card-${index}`}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
            <div className="mt-3 h-8 w-16 animate-pulse rounded bg-slate-200" />
            <div className="mt-2 h-4 w-32 animate-pulse rounded bg-slate-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
