import { redirect } from "next/navigation";

// Send an HTTP redirect on entry instead of caching a prerendered redirect page.
export const dynamic = "force-dynamic";

export default function HomePage() {
  redirect("/dashboard");
}
