"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Briefcase, CreditCard, FolderKanban, Gavel, LayoutDashboard, LogOut, Plus, Search, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useProjects } from "@/lib/projects";
import { Avatar, Button, Skeleton } from "./ui";

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { projects, loading, error, refresh } = useProjects();
  const [q, setQ] = useState("");
  const shown = projects.filter((p) => p.title.toLowerCase().includes(q.toLowerCase()));

  const item = (href: string, active: boolean) =>
    `flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm ${active ? "bg-accent font-medium text-accent-ink" : "text-ink-2 hover:bg-surface-2"}`;

  return (
    <div className="flex h-full flex-col gap-4 p-3" onClick={(e) => (e.target as HTMLElement).closest("a") && onNavigate?.()}>
      <div className="flex items-center justify-between px-2 pt-1">
        <span className="text-lg font-semibold tracking-tight">LOCIM</span>
      </div>

      {user?.role === "CLIENT" && (
        <Link href="/workspace" className="flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2.5 text-sm font-medium hover:bg-surface-2">
          <Plus className="size-4" /> New project
        </Link>
      )}

      {user?.role === "CLIENT" && (
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects" aria-label="Search projects"
            className="w-full rounded-xl bg-surface-2 py-2 pl-9 pr-3 text-sm outline-none placeholder:text-ink-3 focus:ring-1 focus:ring-line" />
        </label>
      )}

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {user?.role === "CLIENT" && (
          <>
            <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-ink-3">Projects</p>
            {loading && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="mx-1 h-8" />)}
            {!loading && error && (
              <div className="px-3 text-xs text-ink-2">
                Couldn&apos;t load projects. <button className="underline" onClick={refresh}>Retry</button>
              </div>
            )}
            {!loading && !error && projects.length === 0 && <p className="px-3 py-2 text-xs text-ink-3">No projects yet. Describe one to get started.</p>}
            {!loading && !error && projects.length > 0 && shown.length === 0 && <p className="px-3 py-2 text-xs text-ink-3">No matches.</p>}
            {shown.map((p) => (
              <Link key={p.id} href={`/workspace/p/${p.id}`} className={`block truncate ${item("", pathname === `/workspace/p/${p.id}`)}`}>{p.title}</Link>
            ))}
          </>
        )}
        {user?.role === "ADMIN" && (
          <>
            <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-ink-3">Admin</p>
            {([
              ["/workspace", "Overview", LayoutDashboard, pathname === "/workspace"],
              ["/workspace/admin/disputes", "Disputes", Gavel, pathname.startsWith("/workspace/admin/disputes")],
              ["/workspace/admin/payments", "Payments", CreditCard, pathname.startsWith("/workspace/admin/payments")],
              ["/workspace/admin/projects", "Projects", FolderKanban, pathname.startsWith("/workspace/admin/projects")],
              ["/workspace/admin/users", "Users", Users, pathname.startsWith("/workspace/admin/users")],
            ] as const).map(([href, label, Icon, active]) => (
              <Link key={href} href={href} className={item("", active)}><Icon className="size-4" /> {label}</Link>
            ))}
          </>
        )}
      </nav>

      <div className="space-y-1 border-t border-line pt-3">
        {user?.role === "FREELANCER" && <Link href="/workspace" className={item("", pathname === "/workspace")}><Briefcase className="size-4" /> Your work</Link>}
        {user?.role === "CLIENT" && <Link href="/workspace/dashboard" className={item("", pathname.startsWith("/workspace/dashboard"))}><LayoutDashboard className="size-4" /> Dashboard</Link>}
        {user?.role !== "ADMIN" && <Link href="/workspace/payments" className={item("", pathname.startsWith("/workspace/payments"))}><CreditCard className="size-4" /> Payments</Link>}
      </div>

      <div className="flex items-center gap-2.5 rounded-2xl bg-surface p-2.5 ring-1 ring-line">
        <Avatar name={user?.name ?? "?"} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{user?.name}</p>
          <p className="truncate text-xs text-ink-3">{{ CLIENT: "Client", FREELANCER: "Freelancer", ADMIN: "Admin" }[user?.role ?? "CLIENT"]}</p>
        </div>
        <Button variant="ghost" className="!p-2" aria-label="Log out" onClick={() => { signOut(); router.replace("/login"); }}>
          <LogOut className="size-4" />
        </Button>
      </div>
    </div>
  );
}
