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
  const [localTargets, setLocalTargets] = useState<EditableTarget[]>([]);
  const [persistedTargets, setPersistedTargets] = useState<EditableTarget[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingToken, setIsCreatingToken] = useState(false);
  const [isRegeneratingToken, setIsRegeneratingToken] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [currentToken, setCurrentToken] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | DeliveryStatus>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creatingItem, setCreatingItem] = useState<EditableTarget | null>(null);

  const hasJobId = jobId.trim().length > 0;

  const summary = useMemo(() => {
    const total = localTargets.length;
    const delivered = localTargets.filter((item) => item.status === "delivered").length;
    return {
      total,
      delivered,
      pending: total - delivered
    };
  }, [localTargets]);

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

  const deliveryLink = useMemo(() => {
    if (!currentToken) return null;
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    return origin ? `${origin}/delivery/${currentToken}` : null;
  }, [currentToken]);

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

  const hydrateFromServer = (payload: { batch?: { access_token?: string | null }; targets?: DeliveryTarget[] } | null) => {
    const mappedTargets = (payload?.targets ?? []).map((target) => toEditableTarget(target));
    setPersistedTargets(mappedTargets);
    setLocalTargets(mappedTargets);

    const token = payload?.batch?.access_token ?? null;
    setCurrentToken(token);
    setHasToken(Boolean(token));
  };

  const loadExisting = async () => {
    if (!hasJobId) {
      setError("ต้องบันทึกกำหนดการก่อน");
      setLocalTargets([]);
      setPersistedTargets([]);
      setCurrentToken(null);
      setHasToken(false);
      return;
    }

    setError(null);
    setSuccess(null);
    setIsRefreshing(true);

    const response = await fetch(`/api/jobs/${jobId}/delivery-batch`, { method: "GET" });
    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.ok) {
      setError(result?.error ?? "โหลดข้อมูลไม่สำเร็จ");
      setLocalTargets([]);
      setPersistedTargets([]);
      setCurrentToken(null);
      setHasToken(false);
      setIsRefreshing(false);
      return;
    }

    hydrateFromServer(result.data);
    setIsRefreshing(false);
  };

  useEffect(() => {
    if (!open) return;
    loadExisting();
  }, [open, hasJobId]);

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

    if (!hasToken) {
      setError("ต้องสร้างลิงก์ก่อน จึงจะบันทึกรายการได้");
      return false;
    }

    setFieldErrors({});
    setError(null);
    setSuccess(null);

    if (!validateBeforeSave()) {
      return false;
    }

    setIsSaving(true);

    const response = await fetch(`/api/jobs/${jobId}/delivery-batch/targets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targets: mapPayload(localTargets) })
    });

    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) {
      setError(result?.error ?? "บันทึกไม่สำเร็จ");
      setIsSaving(false);
      return false;
    }

    const nextTargets = (result.data?.targets ?? []).map((target: DeliveryTarget) => toEditableTarget(target));
    setPersistedTargets(nextTargets);
    setLocalTargets(nextTargets);
    setSuccess("บันทึกรายการสำเร็จ");
    setIsSaving(false);
    onSaved?.();
    return true;
  };

  const createToken = async () => {
    if (!hasJobId) {
      setError("ต้องบันทึกกำหนดการก่อน");
      return;
    }

    setError(null);
    setSuccess(null);
    setIsCreatingToken(true);

    const response = await fetch(`/api/jobs/${jobId}/delivery-batch/token`, { method: "POST" });
    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.ok) {
      setError(result?.error ?? "ไม่สามารถสร้างลิงก์ได้");
      setIsCreatingToken(false);
      return;
    }

    const token = result.data?.batch?.access_token ?? null;
    setCurrentToken(token);
    setHasToken(Boolean(token));
    setSuccess("สร้างลิงก์สำเร็จ สามารถคัดลอกลิงก์ได้ทันที");
    setIsCreatingToken(false);
    onSaved?.();
  };

  const regenerateToken = async () => {
    if (!hasJobId) {
      setError("ต้องบันทึกกำหนดการก่อน");
      return;
    }

    if (!hasToken) {
      setError("ยังไม่มีลิงก์เดิมให้รีเซ็ต กรุณากด “สร้างลิงก์” ก่อน");
      return;
    }

    const confirmed = window.confirm("ลิงก์เดิมจะใช้งานไม่ได้ ต้องการสร้างใหม่หรือไม่?");
    if (!confirmed) return;

    setError(null);
    setSuccess(null);
    setIsRegeneratingToken(true);

    const response = await fetch(`/api/jobs/${jobId}/delivery-batch/token/regenerate`, { method: "POST" });
    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.ok) {
      setError(result?.error ?? "ไม่สามารถสร้างลิงก์ใหม่ได้");
      setIsRegeneratingToken(false);
      return;
    }

    const token = result.data?.batch?.access_token ?? null;
    setCurrentToken(token);
    setHasToken(Boolean(token));
    setSuccess("สร้างลิงก์ใหม่สำเร็จ ลิงก์เดิมถูกรีเซ็ตแล้ว");
    setIsRegeneratingToken(false);
    onSaved?.();
  };

  const commitCreateItem = () => {
    if (!creatingItem) return;
    const validation = validateItem(creatingItem);
    if (Object.keys(validation.nextErrors).length > 0) {
      setFieldErrors((prev) => ({ ...prev, ...validation.nextErrors }));
      return;
    }
    setLocalTargets((prev) => [...prev, creatingItem]);
    setCreatingItem(null);
  };

  const copyLink = async () => {
    if (!deliveryLink || !hasToken) return;
    await navigator.clipboard.writeText(deliveryLink);
    setSuccess("คัดลอกลิงก์เรียบร้อย");
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
                <Button
                  type="button"
                  variant="secondary"
                  className="!w-auto"
                  onClick={loadExisting}
                  disabled={isRefreshing || isSaving || isCreatingToken || isRegeneratingToken || !hasJobId}
                >
                  {isRefreshing ? "กำลังรีเฟรช..." : "รีเฟรชข้อมูล"}
                </Button>
              </div>

              <div className="mt-3 grid gap-2 border-t border-slate-700 pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="!w-auto"
                    onClick={createToken}
                    disabled={isSaving || isCreatingToken || isRegeneratingToken || !hasJobId}
                  >
                    {isCreatingToken ? "กำลังสร้าง..." : "สร้างลิงก์"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="!w-auto border border-red-500/60 text-red-200 hover:bg-red-500/10"
                    onClick={regenerateToken}
                    disabled={isSaving || isCreatingToken || isRegeneratingToken || !hasJobId || !hasToken}
                  >
                    {isRegeneratingToken ? "กำลังสร้าง..." : "สร้างลิงก์ใหม่ (รีเซ็ตลิงก์เดิม)"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="!w-auto"
                    onClick={copyLink}
                    disabled={!hasToken || !deliveryLink}
                  >
                    Copy link
                  </Button>
                </div>
                {deliveryLink ? (
                  <code className="max-w-full truncate rounded bg-slate-950 px-2 py-1 text-xs text-emerald-200">{deliveryLink}</code>
                ) : (
                  <p className="text-xs text-slate-400">ยังไม่มีลิงก์ กรุณากด “สร้างลิงก์”</p>
                )}
              </div>
            </div>
          </div>

          <LargeCustomerDeliveryList
            items={filteredTargets}
            onEdit={(item) => setEditingId(item.tempId)}
            onDelete={(tempId) => setLocalTargets((prev) => prev.filter((item) => item.tempId !== tempId))}
            onToggleStatus={async (tempId) => {
              const toggled: EditableTarget[] = localTargets.map((item) =>
                item.tempId === tempId
                  ? {
                      ...item,
                      status: (item.status === "delivered" ? "pending" : "delivered") as DeliveryStatus
                    }
                  : item
              );

              setLocalTargets(toggled);
              if (!hasToken) {
                setError("ต้องสร้างลิงก์ก่อน จึงจะอัปเดตสถานะได้");
                return;
              }

              setError(null);
              setSuccess(null);
              const response = await fetch(`/api/jobs/${jobId}/delivery-batch/targets`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ targets: mapPayload(toggled) })
              });
              const result = await response.json().catch(() => null);

              if (!response.ok || !result?.ok) {
                setError(result?.error ?? "ไม่สามารถบันทึกสถานะได้");
                setLocalTargets(persistedTargets);
                return;
              }

              const nextTargets = (result.data?.targets ?? []).map((target: DeliveryTarget) => toEditableTarget(target));
              setPersistedTargets(nextTargets);
              setLocalTargets(nextTargets);
              setSuccess("อัปเดตสถานะเรียบร้อย");
            }}
          />

          {error ? <div className="rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div> : null}
          {success ? <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{success}</div> : null}

          <div className="mt-auto flex flex-wrap justify-end gap-2 border-t border-slate-700 pt-3">
            {!hasJobId ? <p className="mr-auto text-xs text-amber-300">ต้องบันทึกกำหนดการก่อน จึงจะตั้งค่าการติดตามได้</p> : null}
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>ปิด</Button>
            <Button type="button" onClick={saveTargets} disabled={isSaving || isCreatingToken || isRegeneratingToken || !hasJobId || !hasToken}>
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
