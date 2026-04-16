import DeliveryTargetDetailClient from "@/components/delivery/DeliveryTargetDetailClient";

export default async function DeliveryTargetDetailPage({
  params
}: {
  params: Promise<{ token: string; targetId: string }>;
}) {
  const { token, targetId } = await params;

  return (
    <main className="min-h-screen bg-slate-50 py-4">
      <DeliveryTargetDetailClient token={token} targetId={targetId} />
    </main>
  );
}
