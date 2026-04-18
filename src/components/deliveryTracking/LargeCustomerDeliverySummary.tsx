type LargeCustomerDeliverySummaryProps = {
  total: number;
  delivered: number;
  pending: number;
};

export default function LargeCustomerDeliverySummary({
  total,
  delivered,
  pending
}: LargeCustomerDeliverySummaryProps) {
  const progress = total > 0 ? Math.round((delivered / total) * 100) : 0;

  return (
    <div className="rounded-xl border border-slate-700/80 bg-[#111827] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-white">สรุปสถานะการแจ้งผู้ใช้ไฟฟ้ารายใหญ่</h3>
        <span className="text-xs text-gray-300">ความคืบหน้า {progress}%</span>
      </div>

      <div className="grid gap-2 text-xs text-gray-300 sm:grid-cols-3 sm:text-sm">
        <div className="rounded-lg border border-slate-700/80 bg-[#0B1220] px-3 py-2">ทั้งหมด {total} ราย</div>
        <div className="rounded-lg border border-green-500/40 bg-green-500/20 px-3 py-2 text-green-400">แจ้งแล้ว {delivered} ราย</div>
        <div className="rounded-lg border border-red-500/40 bg-red-500/20 px-3 py-2 text-red-400">ยังไม่แจ้ง {pending} ราย</div>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-700/70">
        <div className="h-full rounded-full bg-green-400 transition-all" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
