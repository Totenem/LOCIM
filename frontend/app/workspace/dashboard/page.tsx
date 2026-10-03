"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, LayoutDashboard, Plus } from "lucide-react";
import { api, type Dashboard, type DashboardProject } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { money } from "@/lib/format";
import { Button, EmptyState, ErrorCard, Skeleton, StatusChip } from "@/components/ui";

const DOT: Record<string, string> = {
  PENDING: "bg-surface-2 ring-1 ring-line", FUNDED: "bg-warn", SUBMITTED: "bg-info", RELEASED: "bg-ok", DISPUTED: "bg-bad",
};

function DashSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading dashboard" className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-3xl" />)}</div>
      {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-3xl" />)}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-3xl bg-surface p-4 ring-1 ring-line">
      <p className="text-xs text-ink-3">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-ink-3">{hint}</p>}
    </div>
  );
}

function ProjectRow({ p }: { p: DashboardProject }) {
  const pct = p.milestones_total ? Math.round((p.milestones_released / p.milestones_total) * 100) : 0;
  return (
    <li>
      <Link href={`/workspace/p/${p.id}`} className="group block rounded-3xl bg-surface p-4 ring-1 ring-line transition hover:ring-ink-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{p.title}</p>
            <p className="text-xs text-ink-2">{p.freelancer_name ? `with ${p.freelancer_name}` : "No freelancer yet"} · {money(p.budget, p.currency)}</p>
          </div>
          <StatusChip status={p.status} />
        </div>

        <div className="mt-3 flex items-center gap-3">
          <div className="flex flex-1 gap-1" aria-label={`${p.milestones_released} of ${p.milestones_total} milestones paid`}>
            {p.milestone_statuses.map((s, i) => <span key={i} title={s} className={`h-2 flex-1 rounded-full ${DOT[s] ?? DOT.PENDING}`} />)}
          </div>
          <span className="text-xs font-medium text-ink-2">{pct}%</span>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className={`inline-flex items-center gap-1.5 font-medium ${p.needs_attention ? "text-ink" : "text-ink-2"}`}>
            {p.needs_attention && <span className="size-1.5 rounded-full bg-warn" />}
            {p.next_action}
          </span>
          <span className="text-ink-3">
            {Number(p.escrow_held) > 0 && <>Held {money(p.escrow_held, p.currency)} · </>}Paid {money(p.paid_out, p.currency)}
            <ArrowRight className="ml-1 inline size-3 opacity-0 transition group-hover:opacity-100" />
          </span>
        </div>
      </Link>
    </li>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    api<Dashboard>("/api/dashboard")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load the dashboard"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (user && user.role !== "CLIENT") router.replace("/workspace"); }, [user, router]);
  useEffect(() => { if (user?.role === "CLIENT") load(); }, [load, user?.role]);

  const t = data?.totals;
  const attention = data?.projects.filter((p) => p.needs_attention) ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-ink-2">Every project, where it stands, and what needs you.</p>
        </div>
        <Link href="/workspace"><Button variant="outline"><Plus className="size-4" /> New project</Button></Link>
      </div>

      {loading && <DashSkeleton />}
      {!loading && error && <ErrorCard message={error} onRetry={load} />}
      {!loading && !error && data && data.projects.length === 0 && (
        <EmptyState icon={<LayoutDashboard className="size-5" />} title="No projects yet"
          body="Describe what you need and LOCIM will structure it. Your projects and their progress show up here."
          action={<Link href="/workspace"><Button>Start a project</Button></Link>} />
      )}

      {!loading && !error && data && t && data.projects.length > 0 && (
        <>
          <div className="rise grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Active projects" value={String(t.active)} hint={`${t.completed} completed`} />
            <Stat label="Needs your attention" value={String(t.needs_attention)} hint={t.needs_attention ? "See below" : "All caught up"} />
            <Stat label="Held in escrow" value={money(t.escrow_held, t.currency)} hint="Released when you approve" />
            <Stat label="Paid to freelancers" value={money(t.paid_out, t.currency)} hint={`Platform fees: ${money(t.fees_paid, t.currency)}`} />
          </div>

          {attention.length > 0 && (
            <section aria-label="Needs your attention">
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-3">Needs your attention</h2>
              <ul className="divide-y divide-line overflow-hidden rounded-3xl bg-surface ring-1 ring-line">
                {attention.map((p) => (
                  <li key={p.id}>
                    <Link href={`/workspace/p/${p.id}`} className="flex items-center justify-between gap-3 p-3.5 text-sm hover:bg-surface-2">
                      <span className="min-w-0"><span className="block truncate font-medium">{p.title}</span><span className="text-xs text-ink-2">{p.next_action}</span></span>
                      <ArrowRight className="size-4 shrink-0 text-ink-3" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-label="All projects">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-medium uppercase tracking-wide text-ink-3">All projects</h2>
              <p className="flex items-center gap-3 text-[11px] text-ink-3">
                {[["PENDING", "Not funded"], ["FUNDED", "Funded"], ["SUBMITTED", "Submitted"], ["RELEASED", "Paid"]].map(([k, l]) => (
                  <span key={k} className="inline-flex items-center gap-1"><span className={`size-2 rounded-full ${DOT[k]}`} />{l}</span>
                ))}
              </p>
            </div>
            <ul className="space-y-3">{data.projects.map((p) => <ProjectRow key={p.id} p={p} />)}</ul>
          </section>
        </>
      )}
    </div>
  );
}
