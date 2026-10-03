"use client";

import { useState } from "react";
import { FolderX } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useFetch } from "@/lib/use-fetch";
import type { AdminProject } from "@/lib/api";
import { money } from "@/lib/format";
import { StatusChip } from "@/components/ui";
import { AdminPage, ListState, SearchBox } from "@/components/admin-ui";

export default function AdminProjects() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useFetch<AdminProject[]>("/api/admin/projects", user?.role === "ADMIN");
  const [q, setQ] = useState("");

  const s = q.toLowerCase();
  const rows = (data ?? []).filter((p) => `${p.title} ${p.client_name} ${p.freelancer_name ?? ""}`.toLowerCase().includes(s));

  return (
    <AdminPage title="Projects" subtitle="Every project on the platform. Read-only." wide>
      <SearchBox value={q} onChange={setQ} label="Search project, client or freelancer" />
      <ListState loading={loading} error={error} onRetry={reload}
        empty={rows.length === 0 ? { icon: <FolderX className="size-5" />, title: data?.length ? "No matches" : "No projects yet", body: data?.length ? "Try a different search." : "Projects appear here once clients create them." } : null}>
        <ul className="space-y-2">
          {rows.map((p) => {
            const pct = p.milestones_total ? Math.round((p.milestones_released / p.milestones_total) * 100) : 0;
            return (
              <li key={p.id} className="rounded-3xl bg-surface p-4 ring-1 ring-line">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.title}</p>
                    <p className="text-xs text-ink-2">{p.client_name} {p.freelancer_name ? `→ ${p.freelancer_name}` : "· no freelancer"} · {money(p.budget, p.currency)} · {new Date(p.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {p.has_dispute && <span className="rounded-full bg-bad/10 px-2 py-0.5 text-[11px] font-medium text-bad">Dispute</span>}
                    <StatusChip status={p.status} />
                  </div>
                </div>
                <div className="mt-2.5 flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2" aria-label={`${p.milestones_released} of ${p.milestones_total} milestones paid`}>
                    <div className="h-full rounded-full bg-ok" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-ink-2">{p.milestones_released}/{p.milestones_total} paid</span>
                  {Number(p.escrow_held) > 0 && <span className="text-xs text-ink-3">held {money(p.escrow_held, p.currency)}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      </ListState>
    </AdminPage>
  );
}
