"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { supabase } from "@/lib/supabaseClient";
import { AUTH_DISABLED } from "@/lib/authConfig";

interface UserMenuProps {
  compact?: boolean;
  onAfterLogout?: () => void;
}

function AuthenticatedUserMenu({ compact = false, onAfterLogout }: UserMenuProps) {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUserEmail(data.user?.email ?? null);
    };

    loadUser();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUserEmail(session?.user?.email ?? null);
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    onAfterLogout?.();
    router.push("/login");
  };

  return (
    <div
      className={compact ? "space-y-3" : "hidden items-center gap-2 md:flex"}
    >
      <span
        className={
          compact
            ? "block rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700"
            : "max-w-[220px] truncate rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 ring-1 ring-violet-200"
        }
      >
        {userEmail ?? "กำลังโหลดบัญชี..."}
      </span>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className={compact ? "w-full" : "rounded-full"}
        onClick={handleLogout}
      >
        ออกจากระบบ
      </Button>
    </div>
  );
}

export default function UserMenu(props: UserMenuProps) {
  if (AUTH_DISABLED) return null;
  return <AuthenticatedUserMenu {...props} />;
}
