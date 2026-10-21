export type DocumentReceiptSource = {
  document_received_at?: string | null;
  document_received_by?: string | null;
};

export function getDocumentReceiptDetail(job: DocumentReceiptSource): string {
  if (!job.document_received_at) return "รอรับเอกสารฉบับจริง";
  const date = new Date(job.document_received_at);
  const timestamp = Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("th-TH", {
    dateStyle: "medium", timeStyle: "short"
  });
  const legacyName = job.document_received_by?.trim();
  return `${legacyName ? "รับเอกสารแล้ว" : "รับเอกสารและจัดเข้าแฟ้มแล้ว"} · ${timestamp}${legacyName ? ` · ${legacyName}` : ""}`;
}
