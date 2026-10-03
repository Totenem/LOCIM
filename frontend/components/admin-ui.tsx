"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Search } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button, EmptyState, ErrorCard, Skeleton } from "@/components/ui";

/** Shared frame for every admin screen: role guard (non-admins are sent home) + title. */
export function AdminPage({ title, subtitle, children, wide = false }: { title: string; subtitle?: string; children: React.ReactNode; wide?: boolean }) {
  const { user } = useAuth();
  const router = useRouter();
  useEffect(() => { if (user && user.role !== "ADMIN") router.replace("/workspace"); }, [user, router]);
  if (user?.role !== "ADMIN") return null;
  return (
    <div className={`mx-auto space-y-6 px-4 py-8 ${wide ? "max-w-5xl" : "max-w-3xl"}`}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-ink-2">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function ListState({ loading, error, onRetry, empty, rows = 5, children }: {
  loading: boolean; error: string; onRetry: () => void; empty?: { icon: React.ReactNode; title: string; body: string } | null; rows?: number; children: React.ReactNode;
}) {
  if (loading) return <div aria-busy="true" aria-label="Loading" className="space-y-2">{Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-14 rounded-2xl" />)}</div>;
  if (error) return <ErrorCard message={error} onRetry={onRetry} />;
  if (empty) return <EmptyState icon={empty.icon} title={empty.title} body={empty.body} />;
  return <>{children}</>;
}

export function SearchBox({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="relative block">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={label} aria-label={label}
        className="w-full rounded-full border border-line bg-surface py-2.5 pl-10 pr-4 text-sm outline-none focus:border-ink-3" />
    </label>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "warn" }) {
  return (
    <div className="rounded-3xl bg-surface p-4 ring-1 ring-line">
      <p className="text-xs text-ink-3">{label}</p>
      <p className={`mt-1 text-xl font-semibold tracking-tight ${tone === "warn" ? "text-warn" : ""}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-ink-3">{hint}</p>}
    </div>
  );
}

export const KIND_LABEL = { FUND: "Client funded", RELEASE: "Freelancer paid", REFUND: "Client refunded" } as const;

export { Button, Link };
