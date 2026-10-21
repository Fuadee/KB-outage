import { useState } from "react";
import { getDocumentDeliverySenderLabel, type DocumentDeliveryAudit, type DocumentDeliverySnapshot } from "@/lib/documentDelivery";

function Snapshot({ value }: { value: DocumentDeliverySnapshot | null }) {
  if (!value) return <p>ยังไม่มีข้อมูลการส่ง</p>;
  return <div className="space-y-1 break-words">
    <p>{getDocumentDeliverySenderLabel(value)}</p>
    {value.document_delivered_at ? <p>เวลาส่ง: {new Date(value.document_delivered_at).toLocaleString("th-TH")}</p> : null}
    {value.document_delivery_unknown_reason ? <p>เหตุผล: {value.document_delivery_unknown_reason}</p> : null}
    {value.document_delivery_note ? <p>หมายเหตุ: {value.document_delivery_note}</p> : null}
    {value.document_delivery_confirmed_at ? <p>บันทึกการยืนยันว่าส่งจริง: {new Date(value.document_delivery_confirmed_at).toLocaleString("th-TH")}</p> : null}
  </div>;
}

export default function DocumentDeliveryHistory({ jobId }: { jobId: string }) {
  const [history, setHistory] = useState<DocumentDeliveryAudit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    if (history || loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/jobs/${jobId}/document-workflow`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error ?? "โหลดประวัติไม่สำเร็จ");
      setHistory(result.history ?? []);
    } catch (error) {
      setError(error instanceof Error ? error.message : "โหลดประวัติไม่สำเร็จ");
    } finally { setLoading(false); }
  }
  return <details className="rounded-lg border border-slate-200 p-3 text-xs text-slate-600"
    onToggle={(event) => { if (event.currentTarget.open) void load(); }}>
    <summary className="cursor-pointer font-medium">ประวัติการแก้ไขข้อมูลการส่ง (50 รายการล่าสุด)</summary>
    <p className="my-2">ระบบไม่มีการยืนยันตัวตน จึงไม่สามารถยืนยันตัวผู้แก้ไขได้</p>
    {loading ? <p>กำลังโหลด...</p> : null}
    {error ? <p role="alert">{error} <button type="button" className="underline" onClick={() => void load()}>ลองใหม่</button></p> : null}
    {history?.length === 0 ? <p>ยังไม่มีประวัติหลังติดตั้งระบบบันทึกประวัติ</p> : null}
    <ol className="space-y-3">{history?.map((entry) => <li key={entry.id} className="space-y-2 border-t border-slate-200 pt-2">
      <p>บันทึกเมื่อ {new Date(entry.created_at).toLocaleString("th-TH")}</p>
      <div><p className="font-medium">ก่อนแก้ไข</p><Snapshot value={entry.before_state} /></div>
      <div><p className="font-medium">หลังแก้ไข</p><Snapshot value={entry.after_state} /></div>
    </li>)}</ol>
  </details>;
}
