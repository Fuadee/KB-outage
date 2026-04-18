import { useMemo } from "react";
import Button from "@/components/ui/Button";
import type { EditableTarget } from "./types";

type ExcelEditableTargetTableProps = {
  rows: EditableTarget[];
  fieldErrors: Record<string, string>;
  isSaving: boolean;
  onCellChange: (tempId: string, patch: Partial<EditableTarget>) => void;
  onPasteFromClipboard: () => Promise<void>;
  onClearAll: () => void;
  onAddRows: (count?: number) => void;
  onSaveAll: () => void;
};

type ColumnKey = "company_name" | "customerTypeInput" | "latitudeInput" | "longitudeInput";

const columns: Array<{ key: ColumnKey; label: string; width: string; placeholder: string }> = [
  { key: "company_name", label: "ชื่อ*", width: "min-w-[220px]", placeholder: "เช่น บริษัท เอ บี ซี" },
  { key: "customerTypeInput", label: "ประเภท", width: "min-w-[160px]", placeholder: "เช่น โรงงาน" },
  { key: "latitudeInput", label: "Latitude*", width: "min-w-[150px]", placeholder: "13.7563" },
  { key: "longitudeInput", label: "Longitude*", width: "min-w-[150px]", placeholder: "100.5018" }
];

export default function ExcelEditableTargetTable({
  rows,
  fieldErrors,
  isSaving,
  onCellChange,
  onPasteFromClipboard,
  onClearAll,
  onAddRows,
  onSaveAll
}: ExcelEditableTargetTableProps) {
  const errorCount = useMemo(() => Object.keys(fieldErrors).length, [fieldErrors]);

  const getError = (tempId: string, field: string) => fieldErrors[`${tempId}:${field}`];

  return (
    <section className="rounded-2xl border border-slate-700/80 bg-[#111827] p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-white">กรอกข้อมูลแบบตาราง (วางจาก Excel ได้)</h2>
          <p className="text-xs text-slate-300">
            รองรับการวางหลายแถวหลายคอลัมน์ตามลำดับ: ชื่อ, ประเภท, latitude, longitude
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" className="!w-auto" onClick={() => void onPasteFromClipboard()}>
            วางจาก Excel
          </Button>
          <Button type="button" variant="secondary" className="!w-auto" onClick={() => onAddRows(5)}>
            เพิ่มแถว
          </Button>
          <Button type="button" variant="secondary" className="!w-auto" onClick={onClearAll}>
            ล้างข้อมูล
          </Button>
          <Button type="button" className="!w-auto" onClick={onSaveAll} disabled={isSaving}>
            {isSaving ? "กำลังบันทึก..." : "บันทึกทั้งหมด"}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-700/80">
        <table className="w-full min-w-[760px] border-collapse text-sm text-slate-200">
          <thead className="bg-[#0B1220] text-xs uppercase tracking-wide text-slate-300">
            <tr>
              <th className="w-12 border-b border-slate-700/80 px-3 py-2 text-center">#</th>
              {columns.map((column) => (
                <th key={column.key} className={`border-b border-slate-700/80 px-3 py-2 text-left ${column.width}`}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.tempId} className="bg-[#111827] even:bg-[#0D1728]">
                <td className="border-b border-slate-800 px-3 py-2 text-center text-xs text-slate-400">{index + 1}</td>
                {columns.map((column) => {
                  const error = getError(row.tempId, column.key === "customerTypeInput" ? "note" : column.key.replace("Input", ""));
                  return (
                    <td key={column.key} className="border-b border-slate-800 p-1.5 align-top">
                      <input
                        value={String(row[column.key] ?? "")}
                        onChange={(event) => {
                          const value = event.target.value;
                          if (column.key === "company_name") {
                            onCellChange(row.tempId, { company_name: value });
                          } else if (column.key === "customerTypeInput") {
                            onCellChange(row.tempId, { customerTypeInput: value, note: value.trim() || null });
                          } else if (column.key === "latitudeInput") {
                            onCellChange(row.tempId, { latitudeInput: value });
                          } else {
                            onCellChange(row.tempId, { longitudeInput: value });
                          }
                        }}
                        placeholder={column.placeholder}
                        className={`h-10 w-full rounded-md border px-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 ${
                          error
                            ? "border-red-400/80 bg-red-500/20 focus:border-red-300 focus:ring-red-300"
                            : "border-slate-600 bg-[#0B1220] focus:border-blue-400 focus:ring-blue-400"
                        }`}
                      />
                      {error ? <p className="mt-1 text-xs text-red-300">{error}</p> : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <p className="text-slate-400">เคล็ดลับ: คัดลอกจาก Excel 4 คอลัมน์ แล้ววางได้ทันที ระบบจะเพิ่มแถวให้อัตโนมัติ</p>
        {errorCount > 0 ? <p className="text-red-300">พบข้อผิดพลาด {errorCount} จุด กรุณาแก้ก่อนบันทึก</p> : null}
      </div>
    </section>
  );
}
