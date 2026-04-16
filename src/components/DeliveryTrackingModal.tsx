"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import type { DeliveryTargetInput } from "@/types/deliveryTracking";

type DeliveryTrackingModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  onSaved?: () => void;
};

type EditableTarget = DeliveryTargetInput & {
  tempId: string;
};

const createEmptyTarget = (): EditableTarget => ({
  tempId: crypto.randomUUID(),
  company_name: "",
  contact_name: "",
  note: "",
  latitude: null,
  longitude: null,
  map_link: ""
});

export default function DeliveryTrackingModal({
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
  const [summary, setSummary] = useState<{ total: number; delivered: number; pending: number } | null>(null);

  const activeTargets = useMemo(
    () => targets.filter((target) => target.company_name.trim().length > 0),
    [targets]
  );

  const loadExisting = async () => {
    setError(null);
    const response = await fetch(`/api/jobs/${jobId}/delivery-batch`, {
      method: "GET"
    });
    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.ok) {
      setError(result?.error ?? "โหลดข้อมูลไม่สำเร็จ");
      setTargets([createEmptyTarget()]);
      return;
    }

    const payload = result.data;
    const nextTargets = (payload?.targets ?? []).map((target: DeliveryTargetInput & { id: string }) => ({
      tempId: target.id,
      ...target,
      map_link: target.map_link ?? ""
    }));

    setTargets(nextTargets.length > 0 ? nextTargets : [createEmptyTarget()]);

    if (payload?.batch?.access_token) {
      setDeliveryLink(`${window.location.origin}/delivery/${payload.batch.access_token}`);
    } else {
      setDeliveryLink(null);
    }

    const delivered = (payload?.targets ?? []).filter((item: { status?: string }) => item.status === "delivered").length;
    const total = (payload?.targets ?? []).length;
    setSummary({ total, delivered, pending: total - delivered });
  };

  useEffect(() => {
    if (!open) return;
    loadExisting();
  }, [open]);

  const patchTarget = (tempId: string, patch: Partial<EditableTarget>) => {
    setTargets((prev) => prev.map((target) => (target.tempId === tempId ? { ...target, ...patch } : target)));
  };

  const removeTarget = (tempId: string) => {
    setTargets((prev) => {
      const next = prev.filter((target) => target.tempId !== tempId);
      return next.length > 0 ? next : [createEmptyTarget()];
    });
  };

  const saveTargets = async (regenerateToken = false) => {
    setIsSaving(true);
    setError(null);

    const payloadTargets = activeTargets.map((target, index) => ({
      id: target.id,
      company_name: target.company_name,
      contact_name: target.contact_name,
      note: target.note,
      latitude:
        typeof target.latitude === "number" ? target.latitude : target.latitude ? Number(target.latitude) : null,
      longitude:
        typeof target.longitude === "number" ? target.longitude : target.longitude ? Number(target.longitude) : null,
      map_link: target.map_link,
      sort_order: index
    }));

    const response = await fetch(`/api/jobs/${jobId}/delivery-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        regenerateToken,
        targets: payloadTargets
      })
    });

    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) {
      setError(result?.error ?? "บันทึกไม่สำเร็จ");
      setIsSaving(false);
      return false;
    }

    const batch = result.data?.batch;
    const nextTargets = result.data?.targets ?? [];
    setTargets(
      nextTargets.length > 0
        ? nextTargets.map((target: DeliveryTargetInput & { id: string }) => ({
            tempId: target.id,
            ...target,
            map_link: target.map_link ?? ""
          }))
        : [createEmptyTarget()]
    );

    if (batch?.access_token) {
      setDeliveryLink(`${window.location.origin}/delivery/${batch.access_token}`);
    }

    const delivered = nextTargets.filter((item: { status?: string }) => item.status === "delivered").length;
    const total = nextTargets.length;
    setSummary({ total, delivered, pending: total - delivered });

    setIsSaving(false);
    onSaved?.();
    return true;
  };

  const handleGenerateLink = async () => {
    setIsGenerating(true);
    const ok = await saveTargets(true);
    setIsGenerating(false);
    if (!ok) return;
  };

  const copyLink = async () => {
    if (!deliveryLink) return;
    await navigator.clipboard.writeText(deliveryLink);
  };

  return (
    <Modal
      isOpen={open}
      title="ติดตามการแจ้งผู้ใช้ไฟรายใหญ่"
      onClose={() => onOpenChange(false)}
    >
      <div className="flex max-h-[80vh] flex-col gap-4 overflow-y-auto pr-1">
        {summary ? (
          <div className="rounded-xl border border-slate-700/80 bg-slate-900/40 p-3 text-sm text-slate-200">
            สถานะการแจ้งผู้ใช้ไฟรายใหญ่: แจ้งแล้ว {summary.delivered} / {summary.total} (คงเหลือ {summary.pending})
          </div>
        ) : null}

        {targets.map((target, index) => (
          <div key={target.tempId} className="rounded-xl border border-slate-700/70 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-slate-100">รายการที่ {index + 1}</p>
              <Button type="button" size="sm" variant="ghost" onClick={() => removeTarget(target.tempId)}>
                ลบ
              </Button>
            </div>

            <div className="grid gap-2">
              <Input
                type="text"
                value={target.company_name}
                onChange={(event) => patchTarget(target.tempId, { company_name: event.target.value })}
                placeholder="ชื่อบริษัท / สถานที่"
              />
              <Input
                type="text"
                value={target.contact_name ?? ""}
                onChange={(event) => patchTarget(target.tempId, { contact_name: event.target.value })}
                placeholder="ผู้รับผิดชอบ (ถ้ามี)"
              />
              <Input
                type="text"
                value={target.note ?? ""}
                onChange={(event) => patchTarget(target.tempId, { note: event.target.value })}
                placeholder="หมายเหตุ (ถ้ามี)"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  value={target.latitude ?? ""}
                  onChange={(event) =>
                    patchTarget(target.tempId, {
                      latitude: event.target.value ? Number(event.target.value) : null
                    })
                  }
                  placeholder="Latitude"
                />
                <Input
                  type="number"
                  value={target.longitude ?? ""}
                  onChange={(event) =>
                    patchTarget(target.tempId, {
                      longitude: event.target.value ? Number(event.target.value) : null
                    })
                  }
                  placeholder="Longitude"
                />
              </div>
              <Input
                type="url"
                value={target.map_link ?? ""}
                onChange={(event) => patchTarget(target.tempId, { map_link: event.target.value })}
                placeholder="Google Maps link (ถ้ามี)"
              />
            </div>
          </div>
        ))}

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => setTargets((prev) => [...prev, createEmptyTarget()])}>
            เพิ่มรายการ
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={copyLink} disabled={!deliveryLink}>
            Copy public delivery link
          </Button>
        </div>

        {deliveryLink ? (
          <div className="break-all rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {deliveryLink}
          </div>
        ) : null}

        {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            ปิด
          </Button>
          <Button type="button" onClick={() => saveTargets(false)} disabled={isSaving || isGenerating}>
            {isSaving ? "กำลังบันทึก..." : "บันทึกรายการ"}
          </Button>
          <Button type="button" onClick={handleGenerateLink} disabled={isSaving || isGenerating}>
            {isGenerating ? "กำลังสร้าง..." : "สร้างลิงก์สำหรับทีมแจก"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
