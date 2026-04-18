"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import LargeCustomerDeliverySummary from "./LargeCustomerDeliverySummary";
import LargeCustomerDeliveryList from "./LargeCustomerDeliveryList";
import EditLargeCustomerDeliveryItemModal from "./EditLargeCustomerDeliveryItemModal";
import CreateLargeCustomerDeliveryItemModal from "./CreateLargeCustomerDeliveryItemModal";
import { calculateDeliverySummary } from "./summary";
import { fetchDeliveryTargetsByJobId, persistDeliveryTargetsByJobId } from "./service";
import { createEmptyTarget, type EditableTarget } from "./types";
import type { DeliveryStatus, DeliveryTargetInput } from "@/types/deliveryTracking";

type DeliveryTrackingModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  onSaved?: () => void;
};

const normalizeOptionalText = (value?: string | null) => {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
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

const normalizeMapLink = (value?: string | null) => {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return { value: null as string | null, error: null as string | null };
  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(normalized);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { value: null, error: "รูปแบบ map link ไม่ถูกต้อง" };
    }
    return { value: normalized, error: null };
  } catch {
    return { value: null, error: "รูปแบบ map link ไม่ถูกต้อง" };
  }
};

export default function LargeCustomerDeliveryManagerModal({
  open,
  onOpenChange,
  jobId,
  onSaved
}: DeliveryTrackingModalProps) {
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

  const hasJobId = jobId.trim().length > 0;
  const summary = useMemo(() => calculateDeliverySummary(localTargets), [localTargets]);

  const filteredTargets = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return localTargets.filter((item) => {
      const statusMatch = statusFilter === "all" ? true : item.status === statusFilter;
      if (!statusMatch) return false;
      if (!keyword) return true;
      return [item.company_name, item.contact_name, item.note]
        .map((value) => value?.toLowerCase() ?? "")
        .some((value) => value.includes(keyword));
    });
  }, [localTargets, searchText, statusFilter]);

  const editingItem = useMemo(
    () => localTargets.find((item) => item.tempId === editingId) ?? null,
    [localTargets, editingId]
  );

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
    setLocalTargets((prev) => prev.map((target) => (target.tempId === tempId ? { ...target, ...patch } : target)));
  };

  const validateItem = (item: EditableTarget) => {
    const nextErrors: Record<string, string> = {};
    if (!item.company_name.trim()) {
      nextErrors[`${item.tempId}:company_name`] = "กรุณากรอกชื่อบริษัท/สถานที่";
    }
    const latitudeParsed = parseCoordinate(item.latitudeInput);
    const longitudeParsed = parseCoordinate(item.longitudeInput);
    if (latitudeParsed.error) {
      nextErrors[`${item.tempId}:latitude`] = latitudeParsed.error;
    }
    if (longitudeParsed.error) {
      nextErrors[`${item.tempId}:longitude`] = longitudeParsed.error;
    }
    const mapLink = normalizeMapLink(item.map_link);
    if (mapLink.error) {
      nextErrors[`${item.tempId}:map_link`] = mapLink.error;
    }
    return { nextErrors };
  };

  const mapPayload = (items: EditableTarget[]): DeliveryTargetInput[] => {
    const payload: DeliveryTargetInput[] = [];
    items.forEach((item, index) => {
      const companyName = item.company_name.trim();
      if (!companyName) return;
      const latitudeParsed = parseCoordinate(item.latitudeInput);
      const longitudeParsed = parseCoordinate(item.longitudeInput);
      const mapLink = normalizeMapLink(item.map_link);

      payload.push({
        id: item.id,
        company_name: companyName,
        contact_name: normalizeOptionalText(item.contact_name),
        note: normalizeOptionalText(item.note),
        latitude: latitudeParsed.value,
        longitude: longitudeParsed.value,
        map_link: mapLink.value,
        sort_order: index,
        status: item.status,
        proof_image_url: item.proof_image_url ?? null,
        delivered_at: item.delivered_at ?? null
      });
    });
    return payload;
  };

  const syncFromServer = (targets: EditableTarget[]) => {
    setLocalTargets(targets);
  };

  const loadExisting = async () => {
    if (!hasJobId) {
      setError("ต้องบันทึกกำหนดการก่อน");
      setLocalTargets([]);
      return;
    }

    setError(null);
    setSuccess(null);
    setIsRefreshing(true);

    try {
      const targets = await fetchDeliveryTargetsByJobId(jobId);
      console.info("[delivery-tracking] refetch success", { jobId, count: targets.length });
      syncFromServer(targets);
    } catch (loadError) {
      console.error("[delivery-tracking] refetch failed", { jobId, error: loadError });
      setError(loadError instanceof Error ? loadError.message : "โหลดข้อมูลไม่สำเร็จ");
      setLocalTargets([]);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void loadExisting();
  }, [open, hasJobId]);

  useEffect(() => {
    if (!open) return;
    console.info("[delivery-tracking] modal opened with N items", { jobId, count: localTargets.length });
  }, [open, jobId, localTargets.length]);

  useEffect(() => {
    if (!open) return;
    console.info("[delivery-tracking] final rendered counts", {
      jobId,
      total: summary.total,
      delivered: summary.delivered,
      pending: summary.pending,
      progress: summary.progress
    });
  }, [open, jobId, summary]);

  const validateBeforeSave = () => {
    const nextFieldErrors: Record<string, string> = {};
    localTargets.forEach((item) => {
      const validation = validateItem(item);
      Object.assign(nextFieldErrors, validation.nextErrors);
      const hasOtherContent =
        item.contact_name?.trim() ||
        item.note?.trim() ||
        item.latitudeInput.trim() ||
        item.longitudeInput.trim() ||
        item.map_link?.trim();
      if (hasOtherContent && !item.company_name.trim()) {
        nextFieldErrors[`${item.tempId}:company_name`] = "กรุณากรอกชื่อบริษัท/สถานที่";
      }
    });

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setError("กรุณาตรวจสอบข้อมูลรายการที่มีข้อผิดพลาด");
      return false;
    }

    return true;
  };

  const saveTargets = async () => {
    if (!hasJobId) {
      setError("ต้องบันทึกกำหนดการก่อน");
      return false;
    }

    setFieldErrors({});
    setError(null);
    setSuccess(null);

    if (!validateBeforeSave()) {
      return false;
    }

    setIsSaving(true);
    console.info("[delivery-tracking] save started", { jobId, localCount: localTargets.length });

    try {
      const payload = mapPayload(localTargets);
      console.info("[delivery-tracking] save payload", { jobId, payloadCount: payload.length, payload });
      const nextTargets = await persistDeliveryTargetsByJobId(jobId, payload);
      console.info("[delivery-tracking] save success", { jobId, count: nextTargets.length });
      syncFromServer(nextTargets);
      setSuccess("บันทึกรายการสำเร็จ");
      onSaved?.();
      return true;
    } catch (saveError) {
      console.error("[delivery-tracking] save failed", { jobId, error: saveError });
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
    console.info("[delivery-tracking] add item", { jobId, tempId: creatingItem.tempId });
    setLocalTargets((prev) => [...prev, creatingItem]);
    setCreatingItem(null);
  };

  const markItemAsNotified = (tempId: string) => {
    const nowIso = new Date().toISOString();
    const target = localTargets.find((item) => item.tempId === tempId);
    if (!target || target.status === "delivered") return;

    console.info("[delivery-tracking] mark item notified", { jobId, tempId });
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
    <>
      <Modal
        isOpen={open}
        onClose={() => onOpenChange(false)}
        title="ติดตามการแจ้งผู้ใช้ไฟฟ้ารายใหญ่"
        panelClassName="max-w-6xl"
      >
        <div className="flex max-h-[82vh] flex-col gap-4">
          <div className="sticky top-0 z-10 grid gap-3 bg-[#111827] pb-1">
            <LargeCustomerDeliverySummary total={summary.total} delivered={summary.delivered} pending={summary.pending} />

            <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="text"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="ค้นหารายการ / ลูกค้า / ผู้รับผิดชอบ"
                  className="min-w-[220px] flex-1"
                />
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as "all" | DeliveryStatus)}
                  className="h-10 rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100"
                >
                  <option value="all">ทุกสถานะ</option>
                  <option value="delivered">แจ้งแล้ว</option>
                  <option value="pending">ยังไม่แจ้ง</option>
                </select>
                <Button type="button" variant="secondary" className="!w-auto" onClick={() => setCreatingItem(createEmptyTarget())}>
                  เพิ่มรายการ
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="!w-auto"
                  onClick={loadExisting}
                  disabled={isRefreshing || isSaving || !hasJobId}
                >
                  {isRefreshing ? "กำลังรีเฟรช..." : "รีเฟรชข้อมูล"}
                </Button>
              </div>
            </div>
          </div>

          <LargeCustomerDeliveryList
            items={filteredTargets}
            onEdit={(item) => {
              console.info("[delivery-tracking] edit item", { jobId, tempId: item.tempId });
              setEditingId(item.tempId);
            }}
            onDelete={(tempId) => {
              console.info("[delivery-tracking] delete item", { jobId, tempId });
              setLocalTargets((prev) => prev.filter((item) => item.tempId !== tempId));
            }}
            onMarkNotified={markItemAsNotified}
          />

          {error ? <div className="rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div> : null}
          {success ? <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{success}</div> : null}

          <div className="mt-auto flex flex-wrap justify-end gap-2 border-t border-slate-700 pt-3">
            {!hasJobId ? <p className="mr-auto text-xs text-amber-300">ต้องบันทึกกำหนดการก่อน จึงจะตั้งค่าการติดตามได้</p> : null}
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>ปิด</Button>
            <Button type="button" onClick={saveTargets} disabled={isSaving || !hasJobId}>
              {isSaving ? "กำลังบันทึก..." : "บันทึกรายการ"}
            </Button>
          </div>
        </div>
      </Modal>

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
    </>
  );
}
