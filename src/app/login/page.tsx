"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { syncSession } from "@/lib/supabase/client";

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
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
        <div className="mb-6 space-y-2">
          <h1 className="text-2xl font-semibold text-slate-900">
            เข้าสู่ระบบ
          </h1>
          <p className="text-sm text-slate-500">
            จัดการงานดับไฟได้ทันทีด้วยบัญชีของคุณ
          </p>
        </div>

        <form onSubmit={handleSignIn} className="space-y-4">
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            อีเมล
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none transition focus:border-slate-400"
              required
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            รหัสผ่าน
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none transition focus:border-slate-400"
              required
            />
          </label>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          {info ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {info}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>

        <div className="mt-4 flex flex-col gap-3 text-center text-sm text-slate-500">
          <span>หรือ</span>
          <button
            type="button"
            onClick={handleSignUp}
            disabled={loading}
            className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
          >
            สมัครด้วยอีเมลนี้
          </button>
        </div>
      </div>
    </div>
  );
}
