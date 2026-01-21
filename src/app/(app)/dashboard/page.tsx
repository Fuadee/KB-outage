export default function DashboardPage() {
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
        {[
          {
            title: "Active Jobs",
            value: "12",
            description: "งานที่กำลังดำเนินการ"
          },
          {
            title: "Pending Approval",
            value: "3",
            description: "รายการรอการอนุมัติ"
          },
          {
            title: "Scheduled Notices",
            value: "5",
            description: "หนังสือแจ้งที่ตั้งเวลาไว้"
          }
        ].map((card) => (
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
