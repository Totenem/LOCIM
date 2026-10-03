"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError, api, type Milestone, type Project } from "@/lib/api";
import { FEE_RATE, money } from "@/lib/format";
import { useAsk } from "@/components/confirm";
import { AIReviewCard } from "@/components/ai-review";
import { ScopeCheckPanel } from "@/components/scope-check";
import { Button, EmptyState, ErrorCard, Skeleton, Spinner, StatusChip } from "@/components/ui";
import { Matches } from "@/components/matches";
import { FolderX, ShieldCheck } from "lucide-react";
import Link from "next/link";

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-8" aria-busy="true">
      <Skeleton className="h-8 w-2/3" /><Skeleton className="h-4 w-full" />
      <div className="grid grid-cols-3 gap-3"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
      {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
    </div>
  );
}

type Action = "fund" | "release" | "refund" | "dispute";

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [p, setP] = useState<Project | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const returned = useRef(false);
  const ask = useAsk();

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api<Project>(`/api/projects/${id}`)
      .then(setP)
      .catch((e) => setError(e instanceof ApiError ? e : new ApiError(0, "Failed to load project")))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Coming back from PayPal: ?milestone=<id>&token=<order id>. Capture the payment, then clean the URL.
  useEffect(() => {
    if (returned.current) return;
    const q = new URLSearchParams(window.location.search);
    if (q.get("cancelled")) {
      returned.current = true;
      toast("Payment cancelled. You weren't charged.");
      router.replace(`/workspace/p/${id}`);
      return;
    }
    const milestone = q.get("milestone"), order = q.get("token");
    if (!milestone || !order) return;
    returned.current = true;
    setConfirming(true);
    api<Project>(`/api/milestones/${milestone}/capture`, { method: "POST", json: { order_id: order } })
      .then((np) => { setP(np); toast.success("Milestone funded. Your money is held safely until you approve the work."); })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't confirm the payment"))
      .finally(() => { setConfirming(false); router.replace(`/workspace/p/${id}`); });
  }, [id, router]);

  async function act(m: Milestone, action: Action) {
    if (!p) return;
    const cur = p.currency;
    const row = (k: string, v: string, strong = false) => (
      <div className={`flex justify-between ${strong ? "border-t border-line pt-2 font-semibold text-ink" : ""}`}><span>{k}</span><span>{v}</span></div>
    );
    const dialogs: Record<Action, Parameters<typeof ask>[0]> = {
      fund: {
        title: `Fund milestone ${m.sequence}`,
        confirmLabel: "Continue to PayPal",
        body: (
          <>
            <div className="space-y-1.5 rounded-2xl bg-surface-2 p-3">
              {row(m.title, money(m.amount, cur))}
              {row(`Platform fee (${FEE_RATE * 100}%)`, money(m.fee ?? 0, cur))}
              {row("You pay", money(m.total ?? m.amount, cur), true)}
            </div>
            <p>The money is held by LOCIM. {p.freelancer_name} receives the full {money(m.amount, cur)} only after you approve their work.</p>
          </>
        ),
      },
      release: {
        title: "Approve and pay?",
        confirmLabel: `Pay ${money(m.amount, cur)}`,
        body: <p>{p.freelancer_name} will be paid {money(m.amount, cur)} for “{m.title}”. This can&apos;t be undone.</p>,
      },
      refund: {
        title: "Refund this milestone?",
        confirmLabel: "Refund me",
        tone: "danger",
        body: <p>You&apos;ll get the full {money(m.total ?? m.amount, cur)} back, platform fee included. {p.freelancer_name} is removed from the project and it reopens for a new hire.</p>,
      },
      dispute: {
        title: "Open a dispute?",
        confirmLabel: "Open dispute",
        tone: "danger",
        body: <p>The money stays held by LOCIM while an admin looks at both sides. Nobody is paid or refunded until it&apos;s resolved.</p>,
        input: { label: "What's wrong with the work?", placeholder: "Be specific so the reviewer can judge" },
      },
    };
    const answer = await ask(dialogs[action]);
    if (!answer) return;
    setBusy(`${m.id}:${action}`);
    try {
      if (action === "fund") {
        const o = await api<{ approve_url: string }>(`/api/milestones/${m.id}/fund`, { method: "POST" });
        window.location.href = o.approve_url; // PayPal checkout; leave the spinner on while we navigate
        return;
      }
      const np = await api<Project>(`/api/milestones/${m.id}/${action}`, { method: "POST", json: action === "dispute" ? { reason: answer.text } : undefined });
      setP(np);
      toast.success({ release: "Payment released to the freelancer", refund: "Refunded. The project is open again.", dispute: "Disputed. Funds stay held." }[action]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    }
    setBusy(null);
  }

  if (loading) return <DetailSkeleton />;
  if (error?.status === 404)
    return <EmptyState icon={<FolderX className="size-5" />} title="Project not found" body="It may have been removed, or it isn't yours." action={<Link href="/workspace"><Button>New project</Button></Link>} />;
  if (error || !p) return <div className="mx-auto max-w-3xl px-4 py-8"><ErrorCard message={error?.message ?? "Failed to load"} onRetry={load} /></div>;

  const nextFundable = p.milestones.find((m) => m.status !== "RELEASED");
  const spin = (m: Milestone, a: Action) => busy === `${m.id}:${a}`;
  const anyBusy = busy !== null;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      {confirming && (
        <div role="status" className="flex items-center gap-2 rounded-2xl bg-surface p-3 text-sm ring-1 ring-line"><Spinner /> Confirming your payment with PayPal…</div>
      )}
      <div className="rise">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{p.title}</h1>
          <StatusChip status={p.status} />
        </div>
        <p className="mt-1 text-sm text-ink-2">{p.description}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">{p.skills.map((s) => <span key={s} className="rounded-full bg-surface px-2.5 py-1 text-xs text-ink-2 ring-1 ring-line">{s}</span>)}</div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        {[["Budget", money(p.budget, p.currency)], ["Deadline", `${p.deadline_days} days`], ["Freelancer", p.freelancer_name ?? "Not hired yet"]].map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-surface p-3 ring-1 ring-line"><p className="text-xs text-ink-3">{k}</p><p className="truncate text-lg font-semibold">{v}</p></div>
        ))}
      </div>

      <p className="text-xs text-ink-2">Total cost: {money(p.milestones.reduce((s, m) => s + Number(m.total ?? m.amount), 0), p.currency)} = {money(p.budget, p.currency)} budget + {money(p.milestones.reduce((s, m) => s + Number(m.fee ?? 0), 0), p.currency)} platform fee (10%). The freelancer receives the full budget.</p>

      <section>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-3">Milestones</h2>
        <p className="mb-2 flex items-center gap-1.5 text-xs text-ink-2"><ShieldCheck className="size-3.5" /> Funds are held by LOCIM and only released when you approve the work.</p>
        <ul className="divide-y divide-line overflow-hidden rounded-3xl bg-surface ring-1 ring-line">
          {p.milestones.map((m) => {
            const status = m.status ?? "PENDING";
            const isNext = nextFundable?.id === m.id;
            return (
              <li key={m.id} className="flex items-start gap-3 p-4">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-medium">{m.sequence}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{m.title}</p>
                  <p className="text-xs text-ink-2">{m.description}</p>
                  <div className="mt-1.5"><StatusChip status={status} /></div>
                  {m.submission_note && (
                    <p className="mt-2 rounded-xl bg-surface-2 p-2.5 text-xs text-ink-2"><span className="font-medium text-ink">Freelancer&apos;s note: </span>{m.submission_note}</p>
                  )}
                  {status === "FUNDED" && <p className="mt-1.5 text-xs text-ink-3">Waiting for {p.freelancer_name} to submit the work.</p>}
                  {status === "SUBMITTED" && m.ai_review && <AIReviewCard review={m.ai_review} />}
                  {m.dispute_reason && (
                    <div className="mt-2 space-y-1.5 rounded-xl bg-surface-2 p-2.5 text-xs text-ink-2">
                      <p><span className="font-medium text-ink">Your dispute: </span>{m.dispute_reason}</p>
                      {m.dispute_response && <p><span className="font-medium text-ink">{p.freelancer_name}'s response: </span>{m.dispute_response}</p>}
                      {m.resolution_note && <p><span className="font-medium text-ink">Ruling: </span>{m.resolution_note}</p>}
                      {status === "DISPUTED" && <p className="text-ink-3">Funds are held until an admin rules on this.</p>}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5 text-right">
                  <p className="text-sm font-semibold">{money(m.amount, p.currency)}</p>
                  <p className="text-[11px] text-ink-3">+ {money(m.fee ?? 0, p.currency)} platform fee</p>
                  {status === "PENDING" && (
                    <Button className="!px-3 !py-1 text-xs" loading={spin(m, "fund")} disabled={anyBusy || !p.freelancer_id || !isNext}
                      title={!p.freelancer_id ? "Hire a freelancer first" : !isNext ? "Finish the earlier milestone first" : undefined}
                      onClick={() => act(m, "fund")}>Fund</Button>
                  )}
                  {status === "SUBMITTED" && (
                    <>
                      <Button className="!px-3 !py-1 text-xs" loading={spin(m, "release")} disabled={anyBusy} onClick={() => act(m, "release")}>Approve &amp; pay</Button>
                      <Button variant="outline" className="!px-3 !py-1 text-xs" loading={spin(m, "dispute")} disabled={anyBusy} onClick={() => act(m, "dispute")}>Dispute</Button>
                    </>
                  )}
                  {status === "FUNDED" && (
                    <Button variant="outline" className="!px-3 !py-1 text-xs" loading={spin(m, "refund")} disabled={anyBusy} onClick={() => act(m, "refund")}>Refund</Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {p.freelancer_id && <ScopeCheckPanel project={p} onAdded={setP} />}

      {!p.freelancer_id && <Matches projectId={p.id} onHired={setP} />}
    </div>
  );
}
