"use client";

import Link from "next/link";
import { ArrowRight, Gavel } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useFetch } from "@/lib/use-fetch";
import type { AdminOverview } from "@/lib/api";
import { money } from "@/lib/format";
import { AdminPage, KIND_LABEL, ListState, Stat } from "@/components/admin-ui";

export function AdminOverviewPage() {
  const { user } = useAuth();
  const { data: o, loading, error, reload } = useFetch<AdminOverview>("/api/admin/overview", user?.role === "ADMIN");

  return (
    <AdminPage title="Overview" subtitle="How the platform is doing, and where money is right now." wide>
      <ListState loading={loading} error={error} onRetry={reload} rows={4}>
        {o && (
          <>
            {o.open_disputes > 0 && (
              <Link href="/workspace/admin/disputes" className="flex items-center justify-between gap-3 rounded-3xl bg-warn/10 p-4 text-sm ring-1 ring-warn/30">
                <span className="flex items-center gap-2 font-medium"><Gavel className="size-4" /> {o.open_disputes} open {o.open_disputes === 1 ? "dispute needs" : "disputes need"} a ruling</span>
                <ArrowRight className="size-4" />
              </Link>
            )}

            <div className="rise grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Platform fees earned" value={money(o.fees_earned, o.currency)} hint="LOCIM revenue" />
              <Stat label="Money in" value={money(o.volume, o.currency)} hint="Paid by clients, net of refunds" />
              <Stat label="Held in escrow" value={money(o.escrow_held, o.currency)} hint="Waiting on approval" />
              <Stat label="Paid to freelancers" value={money(o.paid_out, o.currency)} hint={`Refunded to clients: ${money(o.refunded, o.currency)}`} />
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Clients" value={String(o.clients)} />
              <Stat label="Freelancers" value={String(o.freelancers)} hint={`${o.freelancers_payout_ready} can be paid (PayPal connected)`} />
              <Stat label="Projects" value={String(o.projects)} hint={Object.entries(o.projects_by_status).map(([k, v]) => `${v} ${k.toLowerCase().replace("_", " ")}`).join(" · ") || "None yet"} />
              <Stat label="Open disputes" value={String(o.open_disputes)} tone={o.open_disputes ? "warn" : undefined} />
            </div>

            <section aria-label="Recent activity">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-xs font-medium uppercase tracking-wide text-ink-3">Recent money movements</h2>
                <Link href="/workspace/admin/payments" className="text-xs text-ink-2 underline">See all</Link>
              </div>
              {o.recent_activity.length === 0 ? (
                <p className="rounded-3xl bg-surface p-6 text-center text-sm text-ink-2 ring-1 ring-line">No money has moved yet.</p>
              ) : (
                <ul className="divide-y divide-line overflow-hidden rounded-3xl bg-surface ring-1 ring-line">
                  {o.recent_activity.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 p-3.5 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium">{KIND_LABEL[a.kind]}: {a.milestone_title}</p>
                        <p className="truncate text-xs text-ink-2">{a.project_title} · {a.client_name}{a.freelancer_name ? ` → ${a.freelancer_name}` : ""} · {new Date(a.created_at).toLocaleString()}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-semibold">{money(a.amount, a.currency)}</p>
                        {a.kind === "FUND" && Number(a.fee) > 0 && <p className="text-[11px] text-ink-3">fee {money(a.fee, a.currency)}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <p className="text-[11px] text-ink-3">PayPal Sandbox. Amounts are test money.</p>
          </>
        )}
      </ListState>
    </AdminPage>
  );
}
