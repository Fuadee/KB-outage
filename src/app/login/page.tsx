import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Preserve old bookmarks without retaining a login flow.
export default function LegacyLoginPage() {
  redirect("/dashboard");
}
