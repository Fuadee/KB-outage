import DeliveryListClient from "@/components/delivery/DeliveryListClient";

export default async function DeliveryByTokenPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <main className="min-h-screen bg-slate-50 py-4">
      <DeliveryListClient token={token} />
    </main>
  );
}
