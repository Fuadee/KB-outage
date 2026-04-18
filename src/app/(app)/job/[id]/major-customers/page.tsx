import LargeCustomerDeliveryTrackingPage from "@/components/deliveryTracking/LargeCustomerDeliveryTrackingPage";

export default async function MajorCustomersTrackingPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <LargeCustomerDeliveryTrackingPage jobId={id} />;
}
