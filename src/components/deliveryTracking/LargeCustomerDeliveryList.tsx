import { useEffect, useMemo, useRef, useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import { uploadDeliveryProofForJobId } from "./service";
import type { EditableTarget } from "./types";
import { markerStatusStyles } from "./markerStatusStyles";

type LargeCustomerDeliveryListProps = {
  jobId: string;
  items: EditableTarget[];
  onEdit: (item: EditableTarget) => void;
  onDelete: (tempId: string) => void;
  onMarkNotified: (tempId: string) => void;
  onProofSaved: (tempId: string, patch: Pick<EditableTarget, "proof_image_url" | "status" | "delivered_at">) => void;
  selectedTempId?: string | null;
  onRowSelect?: (tempId: string) => void;
};

type UploadingState = Record<string, boolean>;
type CaptureMode = "camera" | "file";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export default function LargeCustomerDeliveryList({
  jobId,
  items,
  onEdit,
  onDelete,
  onMarkNotified,
  onProofSaved,
  selectedTempId,
  onRowSelect
}: LargeCustomerDeliveryListProps) {
  const [previewTarget, setPreviewTarget] = useState<EditableTarget | null>(null);
  const [captureTarget, setCaptureTarget] = useState<EditableTarget | null>(null);
  const [captureMode, setCaptureMode] = useState<CaptureMode | null>(null);
  const [captureFile, setCaptureFile] = useState<File | null>(null);
  const [capturePreviewUrl, setCapturePreviewUrl] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [uploadingByTempId, setUploadingByTempId] = useState<UploadingState>({});
  const [inlineErrorByTempId, setInlineErrorByTempId] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!captureFile) {
      setCapturePreviewUrl(null);
      return undefined;
    }
    const objectUrl = URL.createObjectURL(captureFile);
    setCapturePreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [captureFile]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  const getGoogleMapsUrl = (item: EditableTarget) =>
    item.latitudeInput.trim() && item.longitudeInput.trim()
      ? `https://www.google.com/maps?q=${item.latitudeInput.trim()},${item.longitudeInput.trim()}`
      : null;

  const getStatusLabel = (item: EditableTarget) => {
    const hasProof = Boolean(item.proof_image_url);
    if (item.status !== "delivered") return "ยังไม่แจ้ง";
    if (!hasProof) return "แจ้งแล้ว (ยังไม่มีรูป)";
    return "แจ้งแล้วพร้อมรูป";
  };

  const getStatusClass = (item: EditableTarget) => {
    const hasProof = Boolean(item.proof_image_url);
    if (item.status !== "delivered") return "border-red-500/40 bg-red-500/20 text-red-300";
    if (!hasProof) return "border-green-500/40 bg-green-500/20 text-green-300";
    return "border-green-500/40 bg-green-500/20 text-green-300";
  };

  const formatThaiDateTime = (value?: string | null) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("th-TH", {
      dateStyle: "medium",
      timeStyle: "short"
    });
  };

  const isUploading = (tempId: string) => Boolean(uploadingByTempId[tempId]);

  const stopCameraStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const isMobileDevice = () => {
    if (typeof window === "undefined") return false;

    const userAgent = navigator.userAgent || "";
    const mobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;

    return mobileUserAgent || coarsePointer;
  };

  const openFilePickerWithFallbackMessage = (item: EditableTarget, message: string) => {
    setInlineErrorByTempId((prev) => ({ ...prev, [item.tempId]: message }));
    setToast({ tone: "error", message });
    fileInputRefs.current[item.tempId]?.click();
  };

  const startCameraForTarget = async (item: EditableTarget) => {
    setCameraError(null);
    setIsStartingCamera(true);

    try {
      if (typeof window === "undefined" || !window.isSecureContext) {
        throw new Error("บริบทไม่ปลอดภัย");
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("เบราว์เซอร์ไม่รองรับ");
      }

      stopCameraStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (error) {
      stopCameraStream();

      let message = "ไม่สามารถเปิดกล้องได้ กรุณาเลือกรูปจากเครื่อง";
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        message = "ไม่ได้รับสิทธิ์ใช้กล้อง กรุณาเลือกรูปจากเครื่อง";
      } else if (error instanceof DOMException && (error.name === "NotFoundError" || error.name === "OverconstrainedError")) {
        message = "ไม่พบกล้องในอุปกรณ์ กรุณาเลือกรูปจากเครื่อง";
      } else if (error instanceof Error && error.message === "บริบทไม่ปลอดภัย") {
        message = "เปิดกล้องได้เฉพาะหน้าเว็บที่ปลอดภัย (HTTPS) กรุณาเลือกรูปจากเครื่อง";
      } else if (error instanceof Error && error.message === "เบราว์เซอร์ไม่รองรับ") {
        message = "เบราว์เซอร์ไม่รองรับการเปิดกล้อง กรุณาเลือกรูปจากเครื่อง";
      }

      setCameraError(message);
      setCaptureTarget(null);
      setCaptureMode(null);
      setCaptureFile(null);
      openFilePickerWithFallbackMessage(item, message);
    } finally {
      setIsStartingCamera(false);
    }
  };

  const beginCapture = (item: EditableTarget) => {
    if (isUploading(item.tempId)) return;
    setInlineErrorByTempId((prev) => ({ ...prev, [item.tempId]: "" }));

    if (isMobileDevice()) {
      fileInputRefs.current[item.tempId]?.click();
      return;
    }

    setCaptureTarget(item);
    setCaptureMode("camera");
    setCaptureFile(null);
    setCapturePreviewUrl(null);
    setCameraError(null);
    void startCameraForTarget(item);
  };

  const onSelectCaptureFile = (item: EditableTarget, file: File | null) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setInlineErrorByTempId((prev) => ({ ...prev, [item.tempId]: "กรุณาเลือกไฟล์รูปภาพเท่านั้น" }));
      setToast({ tone: "error", message: "เลือกได้เฉพาะไฟล์รูปภาพ" });
      return;
    }

    if (file.size <= 0) {
      setInlineErrorByTempId((prev) => ({ ...prev, [item.tempId]: "ไฟล์ว่างหรืออ่านไม่ได้ กรุณาลองใหม่" }));
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setInlineErrorByTempId((prev) => ({ ...prev, [item.tempId]: "ไฟล์ใหญ่เกิน 10MB กรุณาลดขนาดก่อนอัปโหลด" }));
      setToast({ tone: "error", message: "ไฟล์ใหญ่เกินกำหนด (สูงสุด 10MB)" });
      return;
    }

    setCaptureTarget(item);
    setCaptureMode("file");
    setCaptureFile(file);
    setCameraError(null);
    stopCameraStream();
    setInlineErrorByTempId((prev) => ({ ...prev, [item.tempId]: "" }));
  };

  const closeCapturePreview = () => {
    stopCameraStream();
    setCaptureTarget(null);
    setCaptureMode(null);
    setCaptureFile(null);
    setCapturePreviewUrl(null);
    setCameraError(null);
  };

  const uploadSelectedProof = async () => {
    if (!captureTarget || !captureFile) return;

    const tempId = captureTarget.tempId;
    setUploadingByTempId((prev) => ({ ...prev, [tempId]: true }));
    setInlineErrorByTempId((prev) => ({ ...prev, [tempId]: "" }));

    try {
      const updated = await uploadDeliveryProofForJobId(jobId, captureTarget.tempId, captureFile);
      onProofSaved(tempId, {
        proof_image_url: updated.proof_image_url,
        status: updated.status,
        delivered_at: updated.delivered_at
      });
      setToast({ tone: "success", message: "บันทึกรูปหลักฐานสำเร็จ" });
      closeCapturePreview();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "บันทึกรูปหลักฐานไม่สำเร็จ";
      setInlineErrorByTempId((prev) => ({ ...prev, [tempId]: errorMessage }));
      setToast({ tone: "error", message: errorMessage });
    } finally {
      setUploadingByTempId((prev) => ({ ...prev, [tempId]: false }));
    }
  };

  const proofCell = (item: EditableTarget, index: number) => {
    const hasProof = Boolean(item.proof_image_url);
    const uploading = isUploading(item.tempId);

    return (
      <div className="flex min-w-[210px] flex-col gap-2">
        <input
          ref={(node) => {
            fileInputRefs.current[item.tempId] = node;
          }}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => {
            const selected = event.target.files?.[0] ?? null;
            onSelectCaptureFile(item, selected);
            event.currentTarget.value = "";
          }}
          disabled={uploading}
        />

        {!hasProof ? (
          <Button
            type="button"
            size="sm"
            className="!w-fit rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => beginCapture(item)}
            disabled={uploading}
          >
            {uploading ? "กำลังบันทึก..." : "📷 ถ่ายรูป"}
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPreviewTarget(item)}
              className="overflow-hidden rounded-lg border border-slate-600/80 hover:border-orange-400/80"
              aria-label={`ดูรูปหลักฐาน ${item.company_name || `รายการ ${index + 1}`}`}
            >
              <img src={item.proof_image_url as string} alt="รูปหลักฐาน" className="h-11 w-11 rounded-lg object-cover" />
            </button>
            <button
              type="button"
              onClick={() => setPreviewTarget(item)}
              className="text-xs font-medium text-orange-300 underline underline-offset-2 hover:text-orange-200"
            >
              ดูรูป
            </button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="!w-auto rounded-md border border-slate-500 px-2.5 py-1.5 text-xs text-gray-200 hover:border-orange-300 hover:text-white"
              onClick={() => beginCapture(item)}
              disabled={uploading}
            >
              {uploading ? "กำลังบันทึก..." : "ถ่ายใหม่"}
            </Button>
          </div>
        )}

        {inlineErrorByTempId[item.tempId] ? (
          <p className="text-xs text-red-300">{inlineErrorByTempId[item.tempId]}</p>
        ) : null}
      </div>
    );
  };

  const previewTitle = useMemo(
    () => (previewTarget ? `หลักฐานการแจ้ง: ${previewTarget.company_name || "รายการ"}` : "หลักฐานการแจ้ง"),
    [previewTarget]
  );

  const captureTitle = useMemo(() => {
    if (!captureTarget) return "ยืนยันรูปหลักฐาน";
    if (captureMode === "camera") return `ถ่ายรูปหลักฐาน: ${captureTarget.company_name || "รายการ"}`;
    return `ยืนยันรูปหลักฐาน: ${captureTarget.company_name || "รายการ"}`;
  }, [captureMode, captureTarget]);

  const capturePhotoFromCamera = async () => {
    const videoEl = videoRef.current;
    const canvasEl = canvasRef.current;
    if (!videoEl || !canvasEl || !captureTarget) return;

    const width = videoEl.videoWidth;
    const height = videoEl.videoHeight;
    if (!width || !height) {
      setCameraError("ยังไม่พร้อมถ่ายภาพ กรุณาลองใหม่");
      return;
    }

    canvasEl.width = width;
    canvasEl.height = height;
    const context = canvasEl.getContext("2d");
    if (!context) {
      setCameraError("ไม่สามารถประมวลผลภาพจากกล้องได้ กรุณาเลือกรูปจากเครื่อง");
      return;
    }

    context.drawImage(videoEl, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvasEl.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) {
      setCameraError("ไม่สามารถถ่ายภาพได้ กรุณาลองใหม่");
      return;
    }

    const capturedFile = new File([blob], `delivery-proof-${captureTarget.tempId}-${Date.now()}.jpg`, {
      type: "image/jpeg"
    });
    stopCameraStream();
    onSelectCaptureFile(captureTarget, capturedFile);
  };

  const retakePhoto = async () => {
    if (!captureTarget) return;
    setCaptureFile(null);
    setCapturePreviewUrl(null);
    setCameraError(null);
    await startCameraForTarget(captureTarget);
  };

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-700 bg-[#111827] p-8 text-center text-sm text-gray-400">
        ไม่พบรายการที่ตรงเงื่อนไข
      </div>
    );
  }

  return (
    <>
      {toast ? (
        <div className="fixed right-4 top-4 z-[70]">
          <div
            className={`rounded-lg border px-3 py-2 text-sm shadow-lg ${
              toast.tone === "success"
                ? "border-green-500/40 bg-green-500/20 text-green-200"
                : "border-red-500/40 bg-red-500/20 text-red-100"
            }`}
          >
            {toast.message}
          </div>
        </div>
      ) : null}

      <div className="hidden overflow-hidden rounded-xl border border-slate-700/80 bg-[#111827] md:block">
        <div className="max-h-[44vh] overflow-auto">
          <table className="min-w-full bg-[#111827]">
            <thead className="sticky top-0 bg-[#0B1220] text-left text-xs uppercase tracking-wide text-gray-300">
              <tr>
                <th className="px-4 py-3">ชื่อลูกค้า</th>
                <th className="px-4 py-3">สถานะ</th>
                <th className="px-4 py-3">หลักฐาน</th>
                <th className="px-4 py-3">แผนที่</th>
                <th className="px-4 py-3 text-right">การดำเนินการ</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const googleMapsUrl = getGoogleMapsUrl(item);
                return (
                  <tr
                    key={item.tempId}
                    onClick={() => onRowSelect?.(item.tempId)}
                    className={`align-top text-sm text-gray-300 transition-colors hover:bg-blue-500/10 ${
                      index % 2 === 0 ? "bg-[#111827]" : "bg-[#0F172A]"
                    } ${
                      selectedTempId === item.tempId ? markerStatusStyles[item.status].rowHighlightClass : ""
                    }`}
                  >
                    <td className="px-4 py-4">
                      <p className="font-medium text-white">{item.company_name || `รายการ ${index + 1}`}</p>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${getStatusClass(item)}`}
                      >
                        {getStatusLabel(item)}
                      </span>
                      <p className="mt-1 text-xs text-gray-400">เวลาแจ้ง: {formatThaiDateTime(item.delivered_at)}</p>
                    </td>
                    <td className="px-4 py-4" onClickCapture={(event) => event.stopPropagation()}>{proofCell(item, index)}</td>
                    <td className="px-4 py-4 text-xs text-gray-300" onClickCapture={(event) => event.stopPropagation()}>
                      {googleMapsUrl ? (
                        <a href={googleMapsUrl} target="_blank" rel="noreferrer" className="text-blue-300 underline underline-offset-2">
                          เปิดแผนที่
                        </a>
                      ) : (
                        <span className="text-gray-500">ไม่มีพิกัด</span>
                      )}
                    </td>
                    <td className="px-4 py-4" onClickCapture={(event) => event.stopPropagation()}>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Button type="button" size="sm" variant="ghost" className="!w-auto rounded-md border border-gray-500 px-3 py-2 text-gray-200 hover:border-gray-300 hover:bg-gray-800/40 hover:text-white" onClick={() => onEdit(item)}>
                          แก้ไข
                        </Button>
                        <Button type="button" size="sm" variant="ghost" className="!w-auto rounded-md border border-green-500/60 bg-green-500/20 px-3 py-2 text-green-300 hover:bg-green-500/30 hover:text-green-200" onClick={() => onMarkNotified(item.tempId)} disabled={item.status === "delivered"}>
                          {item.status === "delivered" ? "แจ้งแล้ว" : "บันทึกว่าแจ้งแล้ว"}
                        </Button>
                        <Button type="button" size="sm" variant="ghost" className="!w-auto rounded-md border border-red-500/60 bg-red-500/20 px-3 py-2 text-red-300 hover:bg-red-500/30 hover:text-red-200" onClick={() => onDelete(item.tempId)}>
                          ลบ
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-2 md:hidden">
        {items.map((item, index) => {
          const googleMapsUrl = getGoogleMapsUrl(item);
          return (
            <div
              key={item.tempId}
              className={`rounded-xl border border-slate-700/80 bg-[#111827] p-3 text-sm text-gray-300 ${
                selectedTempId === item.tempId ? markerStatusStyles[item.status].rowHighlightClass : ""
              }`}
              onClick={() => onRowSelect?.(item.tempId)}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-white">{item.company_name || `รายการ ${index + 1}`}</p>
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${getStatusClass(item)}`}>
                  {getStatusLabel(item)}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-400">เวลาแจ้ง: {formatThaiDateTime(item.delivered_at)}</p>
              <p className="mt-1 text-xs text-gray-400" onClickCapture={(event) => event.stopPropagation()}>
                แผนที่:{" "}
                {googleMapsUrl ? (
                  <a href={googleMapsUrl} target="_blank" rel="noreferrer" className="text-blue-300 underline underline-offset-2">
                    เปิดแผนที่
                  </a>
                ) : (
                  "ไม่มีพิกัด"
                )}
              </p>
              <div className="mt-2" onClickCapture={(event) => event.stopPropagation()}>{proofCell(item, index)}</div>
              <div className="mt-3 flex flex-wrap gap-1.5" onClickCapture={(event) => event.stopPropagation()}>
                <Button type="button" size="sm" variant="ghost" className="!w-auto rounded-md border border-gray-500 px-3 py-2 text-gray-200 hover:border-gray-300 hover:bg-gray-800/40 hover:text-white" onClick={() => onEdit(item)}>
                  แก้ไข
                </Button>
                <Button type="button" size="sm" variant="ghost" className="!w-auto rounded-md border border-green-500/60 bg-green-500/20 px-3 py-2 text-green-300 hover:bg-green-500/30 hover:text-green-200" onClick={() => onMarkNotified(item.tempId)} disabled={item.status === "delivered"}>
                  {item.status === "delivered" ? "แจ้งแล้ว" : "บันทึกว่าแจ้งแล้ว"}
                </Button>
                <Button type="button" size="sm" variant="ghost" className="!w-auto rounded-md border border-red-500/60 bg-red-500/20 px-3 py-2 text-red-300 hover:bg-red-500/30 hover:text-red-200" onClick={() => onDelete(item.tempId)}>
                  ลบ
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        isOpen={Boolean(previewTarget?.proof_image_url)}
        title={previewTitle}
        onClose={() => setPreviewTarget(null)}
        panelClassName="max-w-3xl"
        bodyClassName="bg-[#0B1220]"
      >
        {previewTarget?.proof_image_url ? (
          <div className="space-y-3">
            <img
              src={previewTarget.proof_image_url}
              alt={`รูปหลักฐาน ${previewTarget.company_name || "รายการ"}`}
              className="max-h-[70vh] w-full rounded-xl border border-slate-700/80 object-contain"
            />
            <div className="flex items-center justify-between text-xs text-gray-300">
              <span>รูปที่ 1 จาก 1</span>
              <a
                href={previewTarget.proof_image_url}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-orange-300 underline underline-offset-2 hover:text-orange-200"
              >
                เปิดรูปในแท็บใหม่
              </a>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={Boolean(captureTarget)}
        title={captureTitle}
        onClose={closeCapturePreview}
        panelClassName="max-w-2xl"
        bodyClassName="bg-[#0B1220]"
      >
        <div className="space-y-3">
          {captureMode === "camera" && !captureFile ? (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-xl border border-slate-700/80 bg-black">
                <video ref={videoRef} autoPlay playsInline muted className="max-h-[60vh] w-full object-contain" />
              </div>
              <canvas ref={canvasRef} className="hidden" />
              {isStartingCamera ? <p className="text-xs text-gray-300">กำลังเปิดกล้อง...</p> : null}
            </div>
          ) : null}
          {capturePreviewUrl ? (
            <img
              src={capturePreviewUrl}
              alt="ตัวอย่างรูปก่อนบันทึก"
              className="max-h-[60vh] w-full rounded-xl border border-slate-700/80 object-contain"
            />
          ) : null}
          <div className="rounded-lg border border-slate-700/80 bg-[#111827] px-3 py-2 text-xs text-gray-300">
            <p className="truncate">ไฟล์: {captureFile?.name ?? "-"}</p>
            <p>ขนาด: {captureFile ? `${(captureFile.size / 1024 / 1024).toFixed(2)} MB` : "-"}</p>
          </div>
          {cameraError ? <p className="text-xs text-red-300">{cameraError}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" className="!w-auto" onClick={closeCapturePreview}>
              ยกเลิก
            </Button>
            {captureMode === "camera" && !captureFile ? (
              <Button type="button" className="!w-auto" onClick={capturePhotoFromCamera} disabled={isStartingCamera}>
                ถ่ายภาพ
              </Button>
            ) : null}
            {captureMode === "camera" && captureFile ? (
              <Button type="button" variant="secondary" className="!w-auto" onClick={() => void retakePhoto()}>
                ถ่ายใหม่
              </Button>
            ) : null}
            {captureFile ? (
              <Button
                type="button"
                className="!w-auto"
                onClick={uploadSelectedProof}
                disabled={Boolean(captureTarget && isUploading(captureTarget.tempId))}
              >
                {captureTarget && isUploading(captureTarget.tempId) ? "กำลังบันทึก..." : "บันทึก"}
              </Button>
            ) : null}
          </div>
        </div>
      </Modal>
    </>
  );
}
