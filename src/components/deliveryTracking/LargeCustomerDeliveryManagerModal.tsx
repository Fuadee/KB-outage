"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import LargeCustomerDeliverySummary from "./LargeCustomerDeliverySummary";
import LargeCustomerDeliveryList from "./LargeCustomerDeliveryList";
import EditLargeCustomerDeliveryItemModal from "./EditLargeCustomerDeliveryItemModal";
import CreateLargeCustomerDeliveryItemModal from "./CreateLargeCustomerDeliveryItemModal";
import { createEmptyTarget, toEditableTarget, type EditableTarget } from "./types";
import type { DeliveryStatus, DeliveryTarget, DeliveryTargetInput } from "@/types/deliveryTracking";

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
  const [targets, setTargets] = useState<EditableTarget[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deliveryLink, setDeliveryLink] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | DeliveryStatus>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creatingItem, setCreatingItem] = useState<EditableTarget | null>(null);

  const hasJobId = jobId.trim().length > 0;

  const summary = useMemo(() => {
    const total = targets.length;
    const delivered = targets.filter((item) => item.status === "delivered").length;
    return {
      total,
      delivered,
      pending: total - delivered
    };
  }, [targets]);

  const filteredTargets = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return targets.filter((item) => {
      const statusMatch = statusFilter === "all" ? true : item.status === statusFilter;
      if (!statusMatch) return false;
      if (!keyword) return true;
      return [item.company_name, item.contact_name, item.note]
        .map((value) => value?.toLowerCase() ?? "")
        .some((value) => value.includes(keyword));
    });
  }, [searchText, statusFilter, targets]);

  const editingItem = useMemo(
    () => targets.find((item) => item.tempId === editingId) ?? null,
    [targets, editingId]
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
    setTargets((prev) => prev.map((target) => (target.tempId === tempId ? { ...target, ...patch } : target)));
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
    return { nextErrors, latitudeParsed, longitudeParsed, mapLink };
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
        status: item.status
      });
    });
    return payload;
  };

  const loadExisting = async () => {
    if (!hasJobId) {
      setError("ต้องบันทึกกำหนดการก่อน");
      setTargets([]);
      return;
    }
    setError(null);
    const response = await fetch(`/api/jobs/${jobId}/delivery-batch`, { method: "GET" });
    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.ok) {
      setError(result?.error ?? "โหลดข้อมูลไม่สำเร็จ");
      setTargets([]);
      return;
    }

    const payload = result.data;
    const nextTargets = (payload?.targets ?? []).map((target: DeliveryTarget) => toEditableTarget(target));
    setTargets(nextTargets);

    if (payload?.batch?.access_token) {
      setDeliveryLink(`${window.location.origin}/delivery/${payload.batch.access_token}`);
    } else {
      setDeliveryLink(null);
    }
  };

  useEffect(() => {
    if (!open) return;
    loadExisting();
  }, [open, hasJobId]);

  const saveTargets = async (regenerateToken = false) => {
    if (!hasJobId) {
      setError("ต้องบันทึกกำหนดการก่อน");
      return false;
    }

    setIsSaving(true);
    setError(null);
    setFieldErrors({});

    const nextFieldErrors: Record<string, string> = {};
    targets.forEach((item) => {
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
      setIsSaving(false);
      return false;
    }

    const response = await fetch(`/api/jobs/${jobId}/delivery-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ regenerateToken, targets: mapPayload(targets) })
    });

    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) {
      setError(result?.error ?? "บันทึกไม่สำเร็จ");
      setIsSaving(false);
      return false;
    }

    const batch = result.data?.batch;
    const nextTargets = result.data?.targets ?? [];
    setTargets(nextTargets.map((target: DeliveryTarget) => toEditableTarget(target)));
    if (batch?.access_token) {
      setDeliveryLink(`${window.location.origin}/delivery/${batch.access_token}`);
    }

    setIsSaving(false);
    onSaved?.();
    return true;
  };

  const commitCreateItem = () => {
    if (!creatingItem) return;
    const validation = validateItem(creatingItem);
    if (Object.keys(validation.nextErrors).length > 0) {
      setFieldErrors((prev) => ({ ...prev, ...validation.nextErrors }));
      return;
    }
    setTargets((prev) => [...prev, creatingItem]);
    setCreatingItem(null);
  };

  const copyLink = async () => {
    if (!deliveryLink) return;
    await navigator.clipboard.writeText(deliveryLink);
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
            <LargeCustomerDeliverySummary {...summary} />

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
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-700 pt-3">
                {deliveryLink ? (
                  <>
                    <p className="text-xs text-slate-300">Public delivery link</p>
                    <code className="max-w-full flex-1 truncate rounded bg-slate-950 px-2 py-1 text-xs text-emerald-200">{deliveryLink}</code>
                    <Button type="button" size="sm" variant="secondary" className="!w-auto" onClick={copyLink}>
                      Copy link
                    </Button>
                  </>
                ) : (
                  <Button type="button" size="sm" onClick={() => saveTargets(true)} disabled={isSaving || isGenerating || !hasJobId} className="!w-auto">
                    สร้างลิงก์สำหรับทีมภายนอก
                  </Button>
                )}
              </div>
            </div>
          </div>

          <LargeCustomerDeliveryList
            items={filteredTargets}
            onEdit={(item) => setEditingId(item.tempId)}
            onDelete={(tempId) => setTargets((prev) => prev.filter((item) => item.tempId !== tempId))}
            onToggleStatus={(tempId) =>
              setTargets((prev) =>
                prev.map((item) =>
                  item.tempId === tempId
                    ? { ...item, status: item.status === "delivered" ? "pending" : "delivered" }
                    : item
                )
              )
            }
          />

          {error ? <div className="rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div> : null}

          <div className="mt-auto flex flex-wrap justify-end gap-2 border-t border-slate-700 pt-3">
            {!hasJobId ? <p className="mr-auto text-xs text-amber-300">ต้องบันทึกกำหนดการก่อน จึงจะตั้งค่าการติดตามได้</p> : null}
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>ปิด</Button>
            <Button type="button" onClick={() => saveTargets(false)} disabled={isSaving || isGenerating || !hasJobId}>
              {isSaving ? "กำลังบันทึก..." : "บันทึกการเปลี่ยนแปลง"}
            </Button>
            <Button
              type="button"
              onClick={async () => {
                setIsGenerating(true);
                await saveTargets(true);
                setIsGenerating(false);
              }}
              disabled={isSaving || isGenerating || !hasJobId}
            >
              {isGenerating ? "กำลังสร้าง..." : "สร้างลิงก์ใหม่"}
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
