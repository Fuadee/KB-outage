"use client";

import CustomerMapSection from "@/components/deliveryTracking/CustomerMapSection";
import type { EditableTarget } from "@/components/deliveryTracking/types";

const mockItems: EditableTarget[] = [
  {
    tempId: "mock-1",
    company_name: "ลูกค้าตัวอย่าง A",
    latitudeInput: "8.0863",
    longitudeInput: "98.9063",
    status: "pending",
    proof_image_url: null,
    delivered_at: null
  },
  {
    tempId: "mock-2",
    company_name: "ลูกค้าตัวอย่าง B",
    latitudeInput: "8.1401",
    longitudeInput: "98.9634",
    status: "delivered",
    proof_image_url: null,
    delivered_at: new Date().toISOString()
  }
];

export default function LeafletDebugPage() {
  return (
    <main className="min-h-screen bg-[#0B1220] p-6">
      <CustomerMapSection items={mockItems} selectedTempId={null} onMarkerSelect={() => {}} />
    </main>
  );
}
