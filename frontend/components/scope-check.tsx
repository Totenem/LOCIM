"use client";

import { useState } from "react";
import { ShieldAlert, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api, type Project, type ScopeCheck } from "@/lib/api";
import { FEE_RATE, feeOf, money } from "@/lib/format";
import { Button, ErrorCard } from "@/components/ui";
import { useConfirm } from "@/components/confirm";

const VERDICT = {
  IN_SCOPE: { label: "Already covered", cls: "text-ok" },
  OUT_OF_SCOPE: { label: "New work", cls: "text-warn" },
  UNCLEAR: { label: "Unclear", cls: "text-ink-2" },
} as const;

/** "Can I also ask for X?" The AI says whether it is already covered or counts as extra, billable work. */
export function ScopeCheckPanel({ project, onAdded }: { project: Project; onAdded: (p: Project) => void }) {
  const confirm = useConfirm();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [result, setResult] = useState<ScopeCheck | null>(null);
  const [error, setError] = useState("");

  if (project.status === "COMPLETED") return null;

  async function run() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      setResult(await api<ScopeCheck>(`/api/projects/${project.id}/scope-check`, { method: "POST", json: { request: text.trim() } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't check the request");
    } finally {
      setBusy(false);
    }
  }

  function check(e: React.FormEvent) {
    e.preventDefault();
    run();
  }

  async function addMilestone() {
    const s = result?.suggested_milestone;
    if (!s) return;
    const fee = feeOf(s.amount);
    const ok = await confirm({
      title: "Add this as a new milestone?",
      confirmLabel: "Add milestone",
      body: (
        <>
          <p><span className="font-medium text-ink">{s.title}</span></p>
          <p>
            The budget goes up by {money(s.amount, project.currency)}. When you fund it you pay{" "}
            {money(Number(s.amount) + fee, project.currency)} including the {FEE_RATE * 100}% platform fee.
          </p>
        </>
      ),
    });
    if (!ok) return;
    setAdding(true);
    try {
      onAdded(await api<Project>(`/api/projects/${project.id}/milestones`, { method: "POST", json: s }));
      toast.success("Milestone added. Fund it when you're ready.");
      setResult(null);
      setText("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add the milestone");
    } finally {
      setAdding(false);
    }
  }

  const v = result ? VERDICT[result.verdict] : null;
  return (
    <section aria-label="Request a change">
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-3">Want something extra?</h2>
      <form onSubmit={check} className="space-y-2 rounded-3xl bg-surface p-4 ring-1 ring-line">
        <p className="flex items-center gap-1.5 text-xs text-ink-2"><ShieldAlert className="size-3.5" /> Describe a change. LOCIM checks whether it&apos;s already in scope or counts as new work, so nobody gets surprised.</p>
        <textarea aria-label="Describe the change" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Please also add a gallery page with photos"
          className="w-full rounded-xl border border-line bg-surface p-2.5 text-sm outline-none focus:border-ink-3" />
        <Button type="submit" variant="outline" loading={busy} disabled={text.trim().length < 5}><Sparkles className="size-4" /> Check scope</Button>
      </form>

      {error && <div className="mt-2"><ErrorCard message={error} onRetry={run} /></div>}

      {result && v && (
        <div className="rise mt-2 space-y-2 rounded-3xl bg-surface p-4 text-sm ring-1 ring-line" role="status">
          <p className="font-medium">Verdict: <span className={v.cls}>{v.label}</span></p>
          <p className="text-ink-2">{result.explanation}</p>
          {result.suggested_milestone && (
            <div className="rounded-2xl bg-surface-2 p-3">
              <p className="text-xs text-ink-3">Suggested new milestone</p>
              <p className="font-medium">{result.suggested_milestone.title}</p>
              <p className="text-xs text-ink-2">{result.suggested_milestone.description}</p>
              <p className="mt-1 text-sm font-semibold">{money(result.suggested_milestone.amount, project.currency)}</p>
              <Button className="mt-2" loading={adding} onClick={addMilestone}>Add as milestone</Button>
            </div>
          )}
          <p className="text-[11px] text-ink-3">AI suggestion only. You decide whether to add it.</p>
        </div>
      )}
    </section>
  );
}
