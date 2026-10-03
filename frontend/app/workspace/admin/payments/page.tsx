"use client";

import Link from "next/link";
import { useState } from "react";
import { CreditCard } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useFetch } from "@/lib/use-fetch";
import type { AdminActivity } from "@/lib/api";
import { money } from "@/lib/format";
import { AdminPage, KIND_LABEL, ListState, SearchBox } from "@/components/admin-ui";

const TABS = [["ALL", "All"], ["FUND", "Funded"], ["RELEASE", "Paid out"], ["REFUND", "Refunded"]] as const;

export default function AdminPayments() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useFetch<AdminActivity[]>("/api/admin/payments", user?.role === "ADMIN");
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("ALL");

  const s = q.toLowerCase();
  const rows = (data ?? []).filter((a) => (tab === "ALL" || a.kind === tab) &&
    `${a.project_title} ${a.milestone_title} ${a.client_name} ${a.freelancer_name ?? ""}`.toLowerCase().includes(s));

  return (
    <AdminPage title="Payments" subtitle="Every money movement across the platform, newest first." wide>
      <SearchBox value={q} onChange={setQ} label="Search project, milestone or person" />
      <div className="flex gap-1.5" role="tablist" aria-label="Filter by type">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium ${tab === k ? "bg-accent text-accent-ink" : "bg-surface ring-1 ring-line text-ink-2 hover:bg-surface-2"}`}>{l}</button>
        ))}
      </div>
      <ListState loading={loading} error={error} onRetry={reload}
        empty={rows.length === 0 ? { icon: <CreditCard className="size-5" />, title: data?.length ? "No matches" : "No payments yet", body: data?.length ? "Try a different search or filter." : "Money movements show up here once clients fund milestones." } : null}>
        <div className="overflow-x-auto rounded-3xl bg-surface ring-1 ring-line">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-line text-xs text-ink-3">
              <tr><th className="p-3 font-medium">When</th><th className="p-3 font-medium">Type</th><th className="p-3 font-medium">Project</th><th className="p-3 font-medium">People</th><th className="p-3 text-right font-medium">Amount</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap p-3 text-xs text-ink-2">{new Date(a.created_at).toLocaleString()}</td>
                  <td className="p-3">{KIND_LABEL[a.kind]}</td>
                  <td className="p-3"><span className="block max-w-56 truncate font-medium">{a.project_title}</span><span className="text-xs text-ink-2">{a.milestone_title}</span></td>
                  <td className="p-3 text-xs text-ink-2">{a.client_name}{a.freelancer_name ? <><br />→ {a.freelancer_name}</> : null}</td>
                  <td className="p-3 text-right"><span className="font-semibold">{money(a.amount, a.currency)}</span>{a.kind === "FUND" && Number(a.fee) > 0 && <span className="block text-[11px] text-ink-3">fee {money(a.fee, a.currency)}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ListState>
      <p className="text-[11px] text-ink-3">Showing the latest 300. <Link className="underline" href="/workspace">Back to overview</Link></p>
    </AdminPage>
  );
}
