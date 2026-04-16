export type DeliveryStatus = "pending" | "delivered";

export type DeliveryBatch = {
  id: string;
  job_id: string;
  access_token: string;
  created_by: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type DeliveryTarget = {
  id: string;
  batch_id: string;
  company_name: string;
  contact_name: string | null;
  note: string | null;
  latitude: number | null;
  longitude: number | null;
  map_link: string | null;
  status: DeliveryStatus;
  proof_image_url: string | null;
  delivered_at: string | null;
  delivered_by_name: string | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
};

export type DeliveryTargetInput = {
  id?: string;
  company_name: string;
  contact_name?: string | null;
  note?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  map_link?: string | null;
  sort_order?: number | null;
};

export type DeliverySummary = {
  total: number;
  delivered: number;
  pending: number;
};

export type DeliveryBatchWithTargets = {
  batch: DeliveryBatch;
  targets: DeliveryTarget[];
  summary: DeliverySummary;
};
