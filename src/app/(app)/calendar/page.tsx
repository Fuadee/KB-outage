const summaryCards = [
  {
    title: "Total outages this month",
    value: "18",
    description: "รายการที่ถูกบันทึกไว้ในเดือนนี้"
  },
  {
    title: "Pending documents",
    value: "4",
    description: "เอกสารที่ยังรอการจัดเตรียม"
  },
  {
    title: "Completed",
    value: "12",
    description: "งานที่ปิดสำเร็จแล้ว"
  }
];

export default function CalendarPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-400">
          Schedule
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">
          Calendar
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          ภาพรวมปฏิทินงานและการติดตามเอกสารในเดือนนี้
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Month view
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">
              January 2026
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Previous
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {summaryCards.map((card) => (
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
      </section>

      <section className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-600">
            Month grid placeholder
          </p>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm">
            Coming in Step 3
          </span>
        </div>
        <div className="mt-5 grid grid-cols-7 gap-3">
          {Array.from({ length: 21 }).map((_, index) => (
            <div
              key={`cell-${index}`}
              className="h-16 rounded-xl border border-slate-200 bg-white/70"
            />
          ))}
        </div>
      </section>
    </div>
  );
}
