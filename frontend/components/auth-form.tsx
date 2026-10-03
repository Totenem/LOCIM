"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, type User } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Field } from "@/components/ui";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const { user, loading, signIn } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "CLIENT" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/workspace");
  }, [loading, user, router]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = mode === "login" ? { email: form.email, password: form.password } : form;
      const res = await api<{ access_token: string; user: User }>(`/api/auth/${mode}`, { method: "POST", json: body });
      signIn(res.access_token, res.user);
      router.replace("/workspace");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-3xl border border-line bg-surface p-6 shadow-sm">
        <Link href="/" className="text-lg font-semibold tracking-tight">LOCIM</Link>
        <h1 className="text-xl font-semibold">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
        {mode === "register" && (
          <>
            <Field label="Name" value={form.name} onChange={set("name")} required autoComplete="name" disabled={busy} />
            <fieldset className="grid grid-cols-2 gap-2 text-sm">
              {(["CLIENT", "FREELANCER"] as const).map((r) => (
                <label key={r} className={`cursor-pointer rounded-xl border px-3 py-2.5 text-center ${form.role === r ? "border-ink bg-surface-2 font-medium" : "border-line text-ink-2"}`}>
                  <input type="radio" name="role" className="sr-only" checked={form.role === r} onChange={() => setForm({ ...form, role: r })} />
                  {r === "CLIENT" ? "I need work done" : "I'm a freelancer"}
                </label>
              ))}
            </fieldset>
          </>
        )}
        <Field label="Email" type="email" value={form.email} onChange={set("email")} required autoComplete="email" disabled={busy} />
        <Field label="Password" type="password" value={form.password} onChange={set("password")} required minLength={mode === "register" ? 8 : undefined} autoComplete={mode === "login" ? "current-password" : "new-password"} disabled={busy} />
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        <Button type="submit" className="w-full" loading={busy}>{mode === "login" ? "Log in" : "Create account"}</Button>
        {mode === "login" && (
          <button type="button" className="w-full text-center text-xs text-ink-3 hover:text-ink-2" onClick={() => setForm({ ...form, email: "client@demo.locim", password: "demo12345" })}>
            Use demo client account
          </button>
        )}
        <p className="text-center text-sm text-ink-2">
          {mode === "login" ? (<>New here? <Link href="/register" className="font-medium text-ink underline">Sign up</Link></>) : (<>Have an account? <Link href="/login" className="font-medium text-ink underline">Log in</Link></>)}
        </p>
      </form>
    </main>
  );
}
