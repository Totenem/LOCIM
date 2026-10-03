"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CreditCard } from "lucide-react";
import { api, type Payment } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/format";
import { EmptyState, ErrorCard, Skeleton } from "@/components/ui";
import { PayPalPayout } from "@/components/paypal-payout";

const LABEL: Record<string, { client: string; freelancer: string; sign: string }> = {
  FUND: { client: "Funded milestone", freelancer: "Funded", sign: "-" },
  RELEASE: { client: "Paid out", freelancer: "Payment received", sign: "" },
  REFUND: { client: "Refunded to you", freelancer: "Refunded", sign: "+" },
};

export default function Payments() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    api<Payment[]>("/api/payments")
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load payments"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const isClient = user?.role === "CLIENT";
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
        <p className="text-sm text-ink-2">PayPal Sandbox. No real money moves in this demo.</p>
      </div>
      {user?.role === "FREELANCER" && <PayPalPayout />}
      {loading && <div aria-busy="true" className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>}
      {!loading && error && <ErrorCard message={error} onRetry={load} />}
      {!loading && !error && rows.length === 0 && (
        <EmptyState icon={<CreditCard className="size-5" />} title="No payments yet"
          body={isClient ? "When you fund a milestone through PayPal, it shows up here." : "Payouts appear here once a client approves your work."} />
      )}
      {!loading && !error && rows.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-3xl bg-surface ring-1 ring-line">
          {rows.map((r) => {
            const l = LABEL[r.kind];
            return (
              <li key={r.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{isClient ? l.client : l.freelancer}: {r.milestone_title}</p>
                  <p className="truncate text-xs text-ink-2">
                    {isClient ? <Link className="underline" href={`/workspace/p/${r.project_id}`}>{r.project_title}</Link> : r.project_title}
                    {" · "}{new Date(r.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{isClient ? l.sign : "+"}{money(r.amount, r.currency)}</p>
                  {r.kind === "FUND" && Number(r.fee) > 0 && <p className="text-[11px] text-ink-3">incl. {money(r.fee, r.currency)} platform fee</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
