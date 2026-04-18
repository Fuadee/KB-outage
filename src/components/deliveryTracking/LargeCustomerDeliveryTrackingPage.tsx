"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import LargeCustomerDeliverySummary from "./LargeCustomerDeliverySummary";
import LargeCustomerDeliveryList from "./LargeCustomerDeliveryList";
import CustomerMapSection from "./CustomerMapSection";
import ExcelEditableTargetTable from "./ExcelEditableTargetTable";
import EditLargeCustomerDeliveryItemModal from "./EditLargeCustomerDeliveryItemModal";
import CreateLargeCustomerDeliveryItemModal from "./CreateLargeCustomerDeliveryItemModal";
import { fetchDeliveryTargetsByJobId, persistDeliveryTargetsByJobId } from "./service";
import { createEmptyTarget, type EditableTarget } from "./types";
import type { DeliveryStatus, DeliveryTargetInput } from "@/types/deliveryTracking";
import { getJob } from "@/lib/jobsRepo";

type JobContext = {
  id: string;
  equipment_code: string;
  outage_date: string;
};

type DeliveryTrackingPageProps = {
  jobId: string;
  initialJob?: JobContext | null;
};

const parseCoordinate = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return { value: null as number | null, error: null as string | null };
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return { value: null, error: "พิกัดต้องเป็นตัวเลข" };
  }
  return { value: parsed, error: null };
};

const formatThaiDate = (value?: string) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
};

export default function LargeCustomerDeliveryTrackingPage({
  jobId,
  initialJob
}: DeliveryTrackingPageProps) {
  const router = useRouter();
  const [job, setJob] = useState<JobContext | null>(initialJob ?? null);
  const [jobError, setJobError] = useState<string | null>(null);

  const [localTargets, setLocalTargets] = useState<EditableTarget[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | DeliveryStatus>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creatingItem, setCreatingItem] = useState<EditableTarget | null>(null);
  const [selectedTempId, setSelectedTempId] = useState<string | null>(null);
  const [entryMode, setEntryMode] = useState<"table" | "legacy">("legacy");
  const [pageMode, setPageMode] = useState<"setup" | "field">("field");

  const isEmptyRow = (item: EditableTarget) =>
    !item.company_name.trim() &&
    !item.customerTypeInput.trim() &&
    !item.latitudeInput.trim() &&
    !item.longitudeInput.trim();

  const summary = useMemo(() => {
    const nonEmptyTargets = localTargets.filter((item) => !isEmptyRow(item));
    const delivered = nonEmptyTargets.filter((item) => item.status === "delivered").length;
    const total = nonEmptyTargets.length;
    return {
      total,
      delivered,
      pending: total - delivered
    };
  }, [localTargets]);

  const filteredTargets = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return localTargets.filter((item) => {
      if (isEmptyRow(item)) return false;
      const statusMatch = statusFilter === "all" ? true : item.status === statusFilter;
      if (!statusMatch) return false;
      if (!keyword) return true;
      return [item.company_name]
        .map((value) => value?.toLowerCase() ?? "")
        .some((value) => value.includes(keyword));
    });
  }, [localTargets, searchText, statusFilter]);

  const editingItem = useMemo(
    () => localTargets.find((item) => item.tempId === editingId) ?? null,
    [localTargets, editingId]
  );

  useEffect(() => {
    if (!selectedTempId) return;
    const stillVisible = filteredTargets.some((item) => item.tempId === selectedTempId);
    if (!stillVisible) {
      setSelectedTempId(null);
    }
  }, [filteredTargets, selectedTempId]);

  const clearFieldErrors = (tempId: string) => {
    setFieldErrors((prev) => {
      const next = { ...prev };
      Object.keys(next)
        .filter((key) => key.startsWith(`${tempId}:`))
        .forEach((key) => delete next[key]);
      return next;
    });
  };

  const patchTarget = (tempId: string, patch: Partial<EditableTarget>) => {
    clearFieldErrors(tempId);
    setLocalTargets((prev) =>
      prev.map((target) => (target.tempId === tempId ? { ...target, ...patch } : target))
    );
  };

  const validateItem = (item: EditableTarget) => {
    const nextErrors: Record<string, string> = {};
    if (isEmptyRow(item)) {
      return { nextErrors };
    }
    if (!item.company_name.trim()) {
      nextErrors[`${item.tempId}:company_name`] = "กรุณากรอกชื่อบริษัท/สถานที่";
    }
    const latitudeParsed = parseCoordinate(item.latitudeInput);
    const longitudeParsed = parseCoordinate(item.longitudeInput);
    if (!item.latitudeInput.trim()) {
      nextErrors[`${item.tempId}:latitude`] = "กรุณากรอก Latitude";
    } else if (latitudeParsed.error) {
      nextErrors[`${item.tempId}:latitude`] = latitudeParsed.error;
    }
    if (!item.longitudeInput.trim()) {
      nextErrors[`${item.tempId}:longitude`] = "กรุณากรอก Longitude";
    } else if (longitudeParsed.error) {
      nextErrors[`${item.tempId}:longitude`] = longitudeParsed.error;
    }
    return { nextErrors };
  };

  const mapPayload = (items: EditableTarget[]): DeliveryTargetInput[] => {
    const payload: DeliveryTargetInput[] = [];
    items.forEach((item, index) => {
      if (isEmptyRow(item)) return;
      const companyName = item.company_name.trim();
      const latitudeParsed = parseCoordinate(item.latitudeInput);
      const longitudeParsed = parseCoordinate(item.longitudeInput);
      if (!companyName || latitudeParsed.value === null || longitudeParsed.value === null) return;

      payload.push({
        id: item.id,
        company_name: companyName,
        note: item.customerTypeInput.trim() || null,
        latitude: latitudeParsed.value,
        longitude: longitudeParsed.value,
        sort_order: index,
        status: item.status,
        proof_image_url: item.proof_image_url ?? null,
        delivered_at: item.delivered_at ?? null
      });
    });
    return payload;
  };

  const loadExisting = async () => {
    setError(null);
    setSuccess(null);
    setIsRefreshing(true);

    try {
      const targets = await fetchDeliveryTargetsByJobId(jobId);
      console.info("[delivery-tracking-page] data loaded N items", {
        jobId,
        count: targets.length
      });
      console.info("[delivery-tracking-page] refetch success", { jobId, count: targets.length });
      setLocalTargets(targets.length > 0 ? targets : [createEmptyTarget()]);
    } catch (loadError) {
      console.error("[delivery-tracking-page] load failed", { jobId, error: loadError });
      setError(loadError instanceof Error ? loadError.message : "โหลดข้อมูลไม่สำเร็จ");
      setLocalTargets([createEmptyTarget()]);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    console.info("[delivery-tracking-page] tracking page opened for job X", { jobId });
  }, [jobId]);

  useEffect(() => {
    void loadExisting();
  }, [jobId]);

  useEffect(() => {
    if (initialJob) return;
    let mounted = true;
    const loadJob = async () => {
      setJobError(null);
      try {
        const { data, error } = await getJob(jobId);
        if (!mounted) return;
        if (error || !data) {
          throw new Error(error?.message ?? "โหลดข้อมูลงานไม่สำเร็จ");
        }
        setJob({
          id: data.id,
          equipment_code: data.equipment_code,
          outage_date: data.outage_date
        });
      } catch (loadError) {
        if (!mounted) return;
        setJobError(loadError instanceof Error ? loadError.message : "โหลดข้อมูลงานไม่สำเร็จ");
      }
    };

    void loadJob();

    return () => {
      mounted = false;
    };
  }, [jobId, initialJob]);

  const validateBeforeSave = () => {
    const nextFieldErrors: Record<string, string> = {};
    localTargets.forEach((item) => {
      const validation = validateItem(item);
      Object.assign(nextFieldErrors, validation.nextErrors);
    });

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setError("กรุณาตรวจสอบข้อมูลรายการที่มีข้อผิดพลาด");
      return false;
    }

    return true;
  };

  const addRows = (count = 1) => {
    setLocalTargets((prev) => [...prev, ...Array.from({ length: count }, () => createEmptyTarget())]);
  };

  const clearAllRows = () => {
    setFieldErrors({});
    setLocalTargets([createEmptyTarget()]);
  };

  const pasteFromExcel = async () => {
    setError(null);
    setSuccess(null);
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setError("ไม่พบข้อมูลในคลิปบอร์ด");
        return;
      }
      const lines = text
        .replace(/\r\n/g, "\n")
        .split("\n")
        .map((line) => line.trimEnd())
        .filter((line) => line.trim().length > 0);

      if (lines.length === 0) {
        setError("ไม่พบข้อมูลที่วางได้");
        return;
      }

      const pastedRows = lines.map((line) => {
        const [companyName = "", customerType = "", latitude = "", longitude = ""] = line.split("\t");
        return {
          ...createEmptyTarget(),
          company_name: companyName.trim(),
          customerTypeInput: customerType.trim(),
          note: customerType.trim() || null,
          latitudeInput: latitude.trim(),
          longitudeInput: longitude.trim()
        };
      });

      setLocalTargets((prev) => {
        const hasOnlyBlankSeed = prev.length === 1 && isEmptyRow(prev[0]);
        return hasOnlyBlankSeed ? pastedRows : [...prev, ...pastedRows];
      });
      setSuccess(`วางข้อมูลสำเร็จ ${pastedRows.length} แถว`);
    } catch (clipboardError) {
      console.error("[delivery-tracking-page] paste failed", { clipboardError });
      setError("วางข้อมูลไม่สำเร็จ กรุณาอนุญาตสิทธิ์คลิปบอร์ด");
    }
  };

  const saveTargets = async () => {
    setFieldErrors({});
    setError(null);
    setSuccess(null);

    if (!validateBeforeSave()) {
      return false;
    }

    setIsSaving(true);
    console.info("[delivery-tracking-page] save started", { jobId, localCount: localTargets.length });

    try {
      const payload = mapPayload(localTargets);
      await persistDeliveryTargetsByJobId(jobId, payload);
      console.info("[delivery-tracking-page] save success", { jobId });

      const refetchedTargets = await fetchDeliveryTargetsByJobId(jobId);
      console.info("[delivery-tracking-page] refetch success", { jobId, count: refetchedTargets.length });
      setLocalTargets(refetchedTargets.length > 0 ? refetchedTargets : [createEmptyTarget()]);
      setSuccess("บันทึกรายการสำเร็จ");
      return true;
    } catch (saveError) {
      console.error("[delivery-tracking-page] save failed", { jobId, error: saveError });
      setError(saveError instanceof Error ? saveError.message : "บันทึกไม่สำเร็จ");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const commitCreateItem = () => {
    if (!creatingItem) return;
    const validation = validateItem(creatingItem);
    if (Object.keys(validation.nextErrors).length > 0) {
      setFieldErrors((prev) => ({ ...prev, ...validation.nextErrors }));
      return;
    }
    console.info("[delivery-tracking-page] add item", { jobId, tempId: creatingItem.tempId });
    setLocalTargets((prev) => [...prev, creatingItem]);
    setCreatingItem(null);
  };

  const markItemAsNotified = (tempId: string) => {
    const nowIso = new Date().toISOString();
    console.info("[delivery-tracking-page] mark item notified", { jobId, tempId });
    setLocalTargets((prev) =>
      prev.map((item) =>
        item.tempId === tempId
          ? {
              ...item,
              status: "delivered",
              delivered_at: item.delivered_at ?? nowIso
            }
          : item
      )
    );
    setSuccess("อัปเดตสถานะเป็นแจ้งแล้ว (รอบันทึกลงฐานข้อมูล)");
    setError(null);
  };

  return (
    <div className="space-y-4 bg-[#0B1220] pb-6 text-gray-300">
      <header className="rounded-2xl border border-slate-700/80 bg-[#111827] p-3.5 sm:p-4">
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.18em] text-gray-400">Major Customers</p>
            <h1 className="text-lg font-semibold leading-6 text-white sm:text-xl">ติดตามการแจ้งผู้ใช้ไฟฟ้ารายใหญ่</h1>
            <p className="text-xs text-gray-300 sm:text-sm">
              งาน {job?.equipment_code ?? jobId} • วันที่ดับไฟ {formatThaiDate(job?.outage_date)}
            </p>
            {jobError ? <p className="text-xs text-amber-300">{jobError}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
            <Button type="button" variant="secondary" className="!w-auto px-3 py-1.5 text-xs" onClick={() => router.push(`/job/${jobId}`)}>
              ย้อนกลับหน้างาน
            </Button>
            <Link href={`/job/${jobId}`} className="text-xs text-gray-300 underline underline-offset-2 hover:text-white">
              เปิดรายละเอียดงาน
            </Link>
          </div>
        </div>
      </header>

      <LargeCustomerDeliverySummary total={summary.total} delivered={summary.delivered} pending={summary.pending} />

      <div className="rounded-xl border border-slate-700/80 bg-[#111827] p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant={pageMode === "setup" ? "primary" : "secondary"}
              className="min-h-11 !w-full text-sm sm:!w-auto"
              onClick={() => setPageMode("setup")}
            >
              หน้า Setup (จัดการลูกค้า)
            </Button>
            <Button
              type="button"
              variant={pageMode === "field" ? "primary" : "secondary"}
              className="min-h-11 !w-full text-sm sm:!w-auto"
              onClick={() => setPageMode("field")}
            >
              หน้า Field (ถ่ายรูป/แจ้งแล้ว)
            </Button>
          </div>
          <Button type="button" variant="secondary" className="min-h-10 !w-full text-xs sm:!w-auto sm:text-sm" onClick={loadExisting} disabled={isRefreshing || isSaving}>
            {isRefreshing ? "กำลังรีเฟรช..." : "รีเฟรชข้อมูล"}
          </Button>
        </div>
      </div>

      {pageMode === "setup" ? (
        <>
          <div className="rounded-xl border border-slate-700/80 bg-[#111827] p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant={entryMode === "legacy" ? "primary" : "secondary"}
                  className="min-h-11 !w-full text-sm sm:!w-auto"
                  onClick={() => setEntryMode("legacy")}
                >
                  กรอกทีละรายการ (แนะนำ)
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className={`min-h-11 !w-full rounded-lg border px-3 py-2 text-sm ${
                    entryMode === "table"
                      ? "border-slate-500 bg-slate-700/40 text-slate-100"
                      : "border-slate-700 bg-transparent text-slate-300 hover:border-slate-500 hover:text-white"
                  } sm:!w-auto`}
                  onClick={() => setEntryMode("table")}
                >
                  วางจาก Excel (ขั้นสูง)
                </Button>
              </div>
            </div>
          </div>

          {entryMode === "table" ? (
            <ExcelEditableTargetTable
              rows={localTargets}
              fieldErrors={fieldErrors}
              isSaving={isSaving}
              onCellChange={patchTarget}
              onPasteFromClipboard={pasteFromExcel}
              onClearAll={clearAllRows}
              onAddRows={addRows}
              onSaveAll={saveTargets}
            />
          ) : (
            <>
              <div className="rounded-xl border border-slate-700/80 bg-[#111827] p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    type="text"
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    placeholder="ค้นหาชื่อลูกค้า"
                    className="min-w-[220px] flex-1"
                  />
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as "all" | DeliveryStatus)}
                    className="h-10 rounded-lg border border-slate-600 bg-[#0B1220] px-3 text-sm text-gray-200"
                  >
                    <option value="all">ทุกสถานะ</option>
                    <option value="delivered">แจ้งแล้ว</option>
                    <option value="pending">ยังไม่แจ้ง</option>
                  </select>
                  <Button type="button" variant="secondary" className="min-h-10 !w-full sm:!w-auto" onClick={() => setCreatingItem(createEmptyTarget())}>
                    เพิ่มรายการ
                  </Button>
                </div>
              </div>

              <LargeCustomerDeliveryList
                jobId={jobId}
                items={filteredTargets}
                selectedTempId={selectedTempId}
                onRowSelect={setSelectedTempId}
                onEdit={(item) => {
                  console.info("[delivery-tracking-page] edit item", { jobId, tempId: item.tempId });
                  setEditingId(item.tempId);
                }}
                onDelete={(tempId) => {
                  console.info("[delivery-tracking-page] delete item", { jobId, tempId });
                  setLocalTargets((prev) => prev.filter((item) => item.tempId !== tempId));
                }}
                onMarkNotified={markItemAsNotified}
                onProofSaved={(tempId, patch) => {
                  setLocalTargets((prev) =>
                    prev.map((item) => (item.tempId === tempId ? { ...item, ...patch } : item))
                  );
                  setSuccess("บันทึกรูปหลักฐานสำเร็จ");
                  setError(null);
                }}
              />
            </>
          )}

          <div className="rounded-xl border border-slate-700/80 bg-[#111827] p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" className="min-h-10 !w-full rounded-xl px-3 py-2.5 sm:!w-auto" onClick={() => router.push(`/job/${jobId}`)}>
                ย้อนกลับ
              </Button>
              <Button type="button" className="min-h-10 !w-full rounded-xl px-3 py-2.5 sm:!w-auto" onClick={saveTargets} disabled={isSaving}>
                {isSaving ? "กำลังบันทึก..." : "💾 บันทึกข้อมูลลูกค้า"}
              </Button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="rounded-xl border border-slate-700/80 bg-[#111827] p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                type="text"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="ค้นหาชื่อลูกค้า"
                className="min-w-[220px] flex-1"
              />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as "all" | DeliveryStatus)}
                className="h-10 rounded-lg border border-slate-600 bg-[#0B1220] px-3 text-sm text-gray-200"
              >
                <option value="all">ทุกสถานะ</option>
                <option value="delivered">แจ้งแล้ว</option>
                <option value="pending">ยังไม่แจ้ง</option>
              </select>
            </div>
            <p className="mt-2 text-xs text-slate-400">โหมดหน้างานสำหรับถ่ายรูป/แจ้งแล้วเท่านั้น (ซ่อนปุ่มบันทึกข้อมูลลูกค้า)</p>
          </div>

          <div className="relative z-20">
            <LargeCustomerDeliveryList
              jobId={jobId}
              items={filteredTargets}
              selectedTempId={selectedTempId}
              onRowSelect={setSelectedTempId}
              onEdit={(item) => {
                console.info("[delivery-tracking-page] edit item", { jobId, tempId: item.tempId });
                setPageMode("setup");
                setEditingId(item.tempId);
              }}
              onDelete={(tempId) => {
                console.info("[delivery-tracking-page] delete item", { jobId, tempId });
                setPageMode("setup");
                setError("กรุณาไปที่หน้า Setup หากต้องการลบรายการลูกค้า");
              }}
              onMarkNotified={markItemAsNotified}
              onProofSaved={(tempId, patch) => {
                setLocalTargets((prev) =>
                  prev.map((item) => (item.tempId === tempId ? { ...item, ...patch } : item))
                );
                setSuccess("บันทึกรูปหลักฐานสำเร็จ");
                setError(null);
              }}
            />
          </div>

          <div className="rounded-xl border border-slate-700/80 bg-[#111827] p-3">
            <Button type="button" variant="secondary" className="min-h-10 !w-full rounded-xl px-3 py-2.5 sm:!w-auto" onClick={() => router.push(`/job/${jobId}`)}>
              ย้อนกลับ
            </Button>
          </div>
        </>
      )}

      <div className="relative z-0">
        <CustomerMapSection items={filteredTargets} selectedTempId={selectedTempId} onMarkerSelect={setSelectedTempId} />
      </div>

      {error ? <div className="rounded-xl border border-red-500/40 bg-red-500/20 px-3 py-2 text-sm text-red-300">{error}</div> : null}
      {success ? <div className="rounded-xl border border-green-500/40 bg-green-500/20 px-3 py-2 text-sm text-green-300">{success}</div> : null}

      <EditLargeCustomerDeliveryItemModal
        open={Boolean(editingItem)}
        item={editingItem}
        onClose={() => setEditingId(null)}
        onChange={(patch) => {
          if (!editingId) return;
          patchTarget(editingId, patch);
        }}
        onSubmit={() => setEditingId(null)}
        fieldErrors={fieldErrors}
      />

      <CreateLargeCustomerDeliveryItemModal
        open={Boolean(creatingItem)}
        item={creatingItem}
        onClose={() => setCreatingItem(null)}
        onChange={(patch) => {
          if (!creatingItem) return;
          const tempId = creatingItem.tempId;
          clearFieldErrors(tempId);
          setCreatingItem((prev) => (prev ? { ...prev, ...patch } : prev));
        }}
        onSubmit={commitCreateItem}
        fieldErrors={fieldErrors}
      />
    </div>
  );
}
