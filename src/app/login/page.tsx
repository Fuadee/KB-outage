"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { syncSession } from "@/lib/supabase/client";
import {
  appBg,
  btnPrimaryGradient,
  btnSecondaryLight,
  cardDark,
  dividerRow,
  labelText,
  subtitleText,
  titleText
} from "@/lib/theme";
import { cn } from "@/lib/utils";
import Input from "@/components/ui/Input";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        await syncSession(data.session);
        router.replace("/dashboard");
      }
    };

    checkSession();
  }, [router]);

  const handleSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    const { data, error: signInError } =
      await supabase.auth.signInWithPassword({
        email,
        password
      });

    if (signInError || !data.session) {
      setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
      setLoading(false);
      return;
    }

    await syncSession(data.session);
    router.push("/dashboard");
  };

  const handleSignUp = async () => {
    setLoading(true);
    setError(null);
    setInfo(null);

    if (!email || !password) {
      setError("กรุณากรอกอีเมลและรหัสผ่าน");
      setLoading(false);
      return;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      await syncSession(data.session);
      router.push("/dashboard");
      return;
    }

    setInfo("สมัครสำเร็จ กรุณาตรวจสอบอีเมลเพื่อยืนยันบัญชี");
    setLoading(false);
  };

  return (
    <div className={cn(appBg, "min-h-screen flex items-center justify-center px-4 py-10")}>
      <div className={cn(cardDark, "max-w-md p-6 shadow-2xl sm:p-7")}>
        <div className="mb-6 space-y-2 text-center">
          <h1 className={titleText}>เข้าสู่ระบบ</h1>
          <p className={cn(subtitleText, "mt-0")}>จัดการงานดับไฟได้ทันทีด้วยบัญชีของคุณ</p>
        </div>

        <form onSubmit={handleSignIn} className="space-y-4">
          <label className={cn("flex flex-col gap-2 text-left", labelText)}>
              อีเมล
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="focus-visible:ring-indigo-500"
                required
              />
            </label>
            <label className={cn("flex flex-col gap-2 text-left", labelText)}>
              รหัสผ่าน
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                className="focus-visible:ring-indigo-500"
                required
              />
            </label>

            {error ? (
              <div className="rounded-xl border border-red-300/80 bg-red-100 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            ) : null}
            {info ? (
              <div className="rounded-xl border border-emerald-300/80 bg-emerald-100 px-3 py-2 text-sm text-emerald-700">
                {info}
              </div>
            ) : null}

            <div className="pt-1">
              <button
                type="submit"
                disabled={loading}
                className={cn(btnPrimaryGradient, "rounded-xl bg-[linear-gradient(90deg,#f97316_0%,#ec4899_33%,#8b5cf6_66%,#4f46e5_100%)] shadow-lg hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70")}
              >
                {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
              </button>
            </div>
        </form>

        <div className={dividerRow}>
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-xs text-slate-500">หรือ</span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>
        <button
          type="button"
          onClick={handleSignUp}
          disabled={loading}
          className={cn(btnSecondaryLight, "rounded-xl font-medium text-slate-800 shadow-sm hover:bg-slate-100 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70")}
        >
          สมัครด้วยอีเมลนี้
        </button>
      </div>
    </div>
  );
}
