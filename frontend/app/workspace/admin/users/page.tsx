"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useFetch } from "@/lib/use-fetch";
import type { AdminUser } from "@/lib/api";
import { Avatar } from "@/components/ui";
import { AdminPage, ListState, SearchBox } from "@/components/admin-ui";

const ROLE = { CLIENT: "Client", FREELANCER: "Freelancer", ADMIN: "Admin" } as const;
const TABS = [["ALL", "All"], ["CLIENT", "Clients"], ["FREELANCER", "Freelancers"], ["ADMIN", "Admins"]] as const;

export default function AdminUsers() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useFetch<AdminUser[]>("/api/admin/users", user?.role === "ADMIN");
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("ALL");

  const s = q.toLowerCase();
  const rows = (data ?? []).filter((u) => (tab === "ALL" || u.role === tab) && `${u.name} ${u.email}`.toLowerCase().includes(s));

  return (
    <AdminPage title="Users" subtitle="Everyone with an account. Read-only.">
      <SearchBox value={q} onChange={setQ} label="Search by name or email" />
      <div className="flex gap-1.5" role="tablist" aria-label="Filter by role">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium ${tab === k ? "bg-accent text-accent-ink" : "bg-surface ring-1 ring-line text-ink-2 hover:bg-surface-2"}`}>{l}</button>
        ))}
      </div>
      <ListState loading={loading} error={error} onRetry={reload}
        empty={rows.length === 0 ? { icon: <Users className="size-5" />, title: "No users found", body: "Try a different search or filter." } : null}>
        <ul className="divide-y divide-line overflow-hidden rounded-3xl bg-surface ring-1 ring-line">
          {rows.map((u) => (
            <li key={u.id} className="flex items-center gap-3 p-3.5">
              <Avatar name={u.name} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{u.name}</p>
                <p className="truncate text-xs text-ink-2">{u.email} · joined {new Date(u.created_at).toLocaleDateString()}</p>
              </div>
              <div className="shrink-0 text-right text-xs">
                <p className="font-medium">{ROLE[u.role]}</p>
                <p className="text-ink-3">
                  {u.role === "FREELANCER" && <>{u.payout_ready ? "PayPal connected" : "No PayPal"} · </>}
                  {u.role !== "ADMIN" && `${u.projects} ${u.role === "CLIENT" ? "created" : "hired"}`}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </ListState>
    </AdminPage>
  );
}
