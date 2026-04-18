import type { DeliveryStatus, DeliveryTargetInput } from "@/types/deliveryTracking";

export type EditableTarget = DeliveryTargetInput & {
  tempId: string;
  latitudeInput: string;
  longitudeInput: string;
  status: DeliveryStatus;
};

export const createEmptyTarget = (): EditableTarget => ({
  tempId: crypto.randomUUID(),
  company_name: "",
  latitude: null,
  longitude: null,
  latitudeInput: "",
  longitudeInput: "",
  status: "pending",
  proof_image_url: null,
  delivered_at: null
});

export const toEditableTarget = (target: DeliveryTargetInput & { id: string; status?: DeliveryStatus }): EditableTarget => ({
  tempId: target.id,
  ...target,
  latitudeInput: target.latitude === null || target.latitude === undefined ? "" : String(target.latitude),
  longitudeInput: target.longitude === null || target.longitude === undefined ? "" : String(target.longitude),
  status: target.status ?? "pending"
});
