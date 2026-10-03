"use client";

import { useCallback, useEffect, useState } from "react";
import { Gavel } from "lucide-react";
import { toast } from "sonner";
import { api, type Dispute } from "@/lib/api";
import { money } from "@/lib/format";
import { AIReviewCard } from "@/components/ai-review";
import { useAsk } from "@/components/confirm";
import { Button, EmptyState, ErrorCard, Skeleton } from "@/components/ui";

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-surface-2 p-3 text-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-3">{title}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-ink-2">{children}</p>
    </div>
  );
}

export function AdminHome() {
  const ask = useAsk();
  const [rows, setRows] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    api<Dispute[]>("/api/admin/disputes")
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load disputes"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function resolve(d: Dispute, decision: "RELEASE" | "REFUND") {
    const pay = decision === "RELEASE";
    const r = await ask({
      title: pay ? `Pay ${d.freelancer_name}?` : `Refund ${d.client_name}?`,
      confirmLabel: pay ? `Pay ${money(d.amount, d.currency)}` : `Refund ${money(d.total, d.currency)}`,
      tone: pay ? "default" : "danger",
      body: <p>{pay ? `${d.freelancer_name} receives ${money(d.amount, d.currency)}.` : `${d.client_name} gets ${money(d.total, d.currency)} back (fee included) and the freelancer is removed from the project.`} Both sides will see your note.</p>,
      input: { label: "Your ruling, in a sentence or two", placeholder: "Why you decided this" },
    });
    if (!r) return;
    setBusy(`${d.milestone_id}:${decision}`);
    try {
      await api(`/api/admin/milestones/${d.milestone_id}/resolve`, { method: "POST", json: { decision, note: r.text } });
      toast.success(pay ? "Freelancer paid. Dispute closed." : "Client refunded. Dispute closed.");
      setRows((x) => x.filter((y) => y.milestone_id !== d.milestone_id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't resolve the dispute");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Disputes</h1>
        <p className="text-sm text-ink-2">Funds stay held until you rule. Read both sides, then pay the freelancer or refund the client.</p>
      </div>
      {loading && <div aria-busy="true" className="space-y-3"><Skeleton className="h-56 rounded-3xl" /><Skeleton className="h-56 rounded-3xl" /></div>}
      {!loading && error && <ErrorCard message={error} onRetry={load} />}
      {!loading && !error && rows.length === 0 && <EmptyState icon={<Gavel className="size-5" />} title="No open disputes" body="When a client disputes a submission, it shows up here for a ruling." />}
      {!loading && !error && rows.length > 0 && (
        <ul className="space-y-4">
          {rows.map((d) => (
            <li key={d.milestone_id} className="rise space-y-3 rounded-3xl bg-surface p-4 ring-1 ring-line">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{d.project_title}</p>
                  <p className="text-xs text-ink-2">Milestone {d.sequence}: {d.milestone_title} · {d.client_name} vs {d.freelancer_name}</p>
                </div>
                <p className="text-sm font-semibold">{money(d.amount, d.currency)}</p>
              </div>
              <Block title="What was required">{d.milestone_description || "No description."}</Block>
              <Block title={`${d.freelancer_name}'s submission`}>{d.submission_note || "No note."}</Block>
              {d.ai_review && <AIReviewCard review={d.ai_review} />}
              <Block title={`${d.client_name}'s complaint`}>{d.dispute_reason ?? ""}</Block>
              <Block title={`${d.freelancer_name}'s response`}>{d.dispute_response ?? "No response yet."}</Block>
              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <Button variant="outline" className="!text-bad" loading={busy === `${d.milestone_id}:REFUND`} disabled={busy !== null} onClick={() => resolve(d, "REFUND")}>Refund client</Button>
                <Button loading={busy === `${d.milestone_id}:RELEASE`} disabled={busy !== null} onClick={() => resolve(d, "RELEASE")}>Pay freelancer</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
