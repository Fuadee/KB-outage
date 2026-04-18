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
    <div className="rounded-2xl border border-slate-700/80 bg-[#111827] p-3 sm:p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-white">สรุปสถานะการแจ้งผู้ใช้ไฟฟ้ารายใหญ่</h3>
        <span className="text-xs font-medium text-gray-200">ความคืบหน้า {progress}%</span>
      </div>

      <div className="grid grid-cols-1 gap-2.5 text-sm sm:grid-cols-3">
        <div className="rounded-xl border border-slate-700/80 bg-[#0B1220] px-3 py-2.5">
          <p className="text-xs text-slate-300">ทั้งหมด</p>
          <p className="text-xl font-semibold text-white">{total} ราย</p>
        </div>
        <div className="rounded-xl border border-green-500/40 bg-green-500/15 px-3 py-2.5">
          <p className="text-xs text-green-200">แจ้งแล้ว</p>
          <p className="text-xl font-semibold text-green-300">{delivered} ราย</p>
        </div>
        <div className="rounded-xl border border-red-500/40 bg-red-500/15 px-3 py-2.5">
          <p className="text-xs text-red-200">ยังไม่แจ้ง</p>
          <p className="text-xl font-semibold text-red-300">{pending} ราย</p>
        </div>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-700/80">
        <div className="h-full rounded-full bg-gradient-to-r from-green-400 to-emerald-300 transition-all" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
