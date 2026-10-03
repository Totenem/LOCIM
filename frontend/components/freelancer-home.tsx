"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Briefcase, Wallet } from "lucide-react";
import { toast } from "sonner";
import { api, type FreelancerMe, type Milestone, type Project } from "@/lib/api";
import { money } from "@/lib/format";
import { Button, EmptyState, ErrorCard, Skeleton, StatusChip } from "@/components/ui";

const DOT: Record<string, string> = {
  PENDING: "bg-surface-2 ring-1 ring-line", FUNDED: "bg-warn", SUBMITTED: "bg-info", RELEASED: "bg-ok", DISPUTED: "bg-bad",
};

function DisputePanel({ m, onChange }: { m: Milestone; onChange: (p: Project) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  async function respond() {
    setBusy(true);
    try {
      onChange(await api<Project>(`/api/milestones/${m.id}/dispute/respond`, { method: "POST", json: { message: text } }));
      toast.success("Response sent to the reviewer.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2 rounded-xl bg-surface p-2.5 text-xs text-ink-2">
      <p><span className="font-medium text-ink">The client disputed this: </span>{m.dispute_reason}</p>
      <p className="text-ink-3">Funds are held until an admin rules on it.</p>
      {m.dispute_response ? (
        <p><span className="font-medium text-ink">Your response: </span>{m.dispute_response}</p>
      ) : (
        <>
          <textarea aria-label="Your response to the dispute" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Explain your side"
            className="w-full rounded-xl border border-line bg-surface p-2.5 text-sm text-ink outline-none focus:border-ink-3" />
          <Button className="!py-1.5 text-xs" loading={busy} disabled={text.trim().length < 2} onClick={respond}>Send response</Button>
        </>
      )}
    </div>
  );
}

function Job({ p, onChange }: { p: Project; onChange: (p: Project) => void }) {
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const paidMs = p.milestones.filter((m) => m.status === "RELEASED");
  const earned = paidMs.reduce((s, m) => s + Number(m.amount), 0);

  async function submit(m: Milestone) {
    setBusy(m.id!);
    try {
      onChange(await api<Project>(`/api/milestones/${m.id}/submit`, { method: "POST", json: { note: notes[m.id!] } }));
      toast.success("Submitted. The client will review it.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't submit");
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="rise rounded-3xl bg-surface p-5 ring-1 ring-line">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold tracking-tight">{p.title}</p>
          <p className="text-xs text-ink-2">for {p.client_name} · budget {money(p.budget, p.currency)}</p>
        </div>
        <StatusChip status={p.status} />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <div className="flex flex-1 gap-1" aria-label={`${paidMs.length} of ${p.milestones.length} milestones paid`}>
          {p.milestones.map((m) => <span key={m.id} title={m.title} className={`h-1.5 flex-1 rounded-full ${DOT[m.status ?? "PENDING"] ?? DOT.PENDING}`} />)}
        </div>
        <span className="shrink-0 text-xs text-ink-2">{paidMs.length}/{p.milestones.length} paid · {money(earned, p.currency)} earned</span>
      </div>

      <ul className="mt-4 space-y-2">
        {p.milestones.map((m) => (
          <li key={m.id} className="rounded-2xl bg-surface-2 p-3.5">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-surface text-[11px] font-medium ring-1 ring-line">{m.sequence}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{m.title}</p>
                <div className="mt-0.5"><StatusChip status={m.status ?? "PENDING"} /></div>
              </div>
              <p className="shrink-0 text-sm font-semibold">{money(m.amount, p.currency)}</p>
            </div>

            {m.status === "PENDING" && <p className="mt-2 pl-8 text-xs text-ink-3">Waiting for the client to fund this before you start.</p>}
            {m.status === "FUNDED" && (
              <div className="mt-3 space-y-2 pl-8">
                <p className="text-xs text-ink-2">Funded and held by LOCIM. Do the work, then submit it.</p>
                <textarea aria-label={`Submission note for ${m.title}`} rows={3} placeholder="Describe what you delivered, with links"
                  value={notes[m.id!] ?? ""} onChange={(e) => setNotes({ ...notes, [m.id!]: e.target.value })}
                  className="w-full rounded-xl border border-line bg-surface p-2.5 text-sm outline-none focus:border-ink-3" />
                <Button className="!py-1.5 text-xs" loading={busy === m.id} disabled={!(notes[m.id!] ?? "").trim() || busy !== null} onClick={() => submit(m)}>Submit work</Button>
              </div>
            )}
            {m.status === "SUBMITTED" && <p className="mt-2 pl-8 text-xs text-ink-3">Submitted. Waiting for the client to approve.</p>}
            {m.status === "DISPUTED" && <div className="mt-2 pl-8"><DisputePanel m={m} onChange={onChange} /></div>}
            {m.resolution_note && <p className="ml-8 mt-2 rounded-xl bg-surface p-2.5 text-xs text-ink-2"><span className="font-medium text-ink">Ruling: </span>{m.resolution_note}</p>}
            {m.status === "RELEASED" && <p className="mt-2 pl-8 text-xs text-ok">Paid to your PayPal.</p>}
          </li>
        ))}
      </ul>
    </li>
  );
}

export function FreelancerHome() {
  const [jobs, setJobs] = useState<Project[]>([]);
  const [me, setMe] = useState<FreelancerMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    Promise.all([api<Project[]>("/api/jobs"), api<FreelancerMe>("/api/freelancers/me")])
      .then(([j, m]) => { setJobs(j); setMe(m); })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load your jobs"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const active = jobs.filter((p) => p.status !== "COMPLETED");
  const done = jobs.filter((p) => p.status === "COMPLETED");
  const update = (np: Project) => setJobs((j) => j.map((x) => (x.id === np.id ? np : x)));

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your work</h1>
          <p className="text-sm text-ink-2">Projects you&apos;ve been hired for.</p>
        </div>
        {me && (
          <span className="rounded-full bg-surface px-3.5 py-1.5 text-xs font-medium ring-1 ring-line" title="You can run up to 3 projects at once. A project counts until every milestone is paid.">
            {me.active_projects} of {me.max_active_projects} active projects
          </span>
        )}
      </div>

      {me && !me.paypal_email && (
        <Link href="/workspace/payments?setup=1" className="flex items-center justify-between gap-3 rounded-3xl bg-warn/10 p-4 text-sm ring-1 ring-warn/30">
          <span className="flex items-center gap-2 font-medium"><Wallet className="size-4" /> Connect your PayPal so clients can hire you and you can get paid.</span>
          <ArrowRight className="size-4 shrink-0" />
        </Link>
      )}

      {loading && <div aria-busy="true" aria-label="Loading your work" className="space-y-3"><Skeleton className="h-48 rounded-3xl" /><Skeleton className="h-48 rounded-3xl" /></div>}
      {!loading && error && <ErrorCard message={error} onRetry={load} />}
      {!loading && !error && jobs.length === 0 && (
        <EmptyState icon={<Briefcase className="size-5" />} title="No jobs yet" body="When a client hires you, the project and its milestones show up here." />
      )}
      {!loading && !error && active.length > 0 && (
        <section aria-label="Active projects">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-3">Active</h2>
          <ul className="space-y-4">{active.map((p) => <Job key={p.id} p={p} onChange={update} />)}</ul>
        </section>
      )}
      {!loading && !error && done.length > 0 && (
        <section aria-label="Completed projects">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-3">Completed</h2>
          <ul className="space-y-4 opacity-80">{done.map((p) => <Job key={p.id} p={p} onChange={update} />)}</ul>
        </section>
      )}
    </div>
  );
}
