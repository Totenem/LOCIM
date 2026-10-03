"use client";

import { Scale, Trash2 } from "lucide-react";
import { type Draft } from "@/lib/api";
import { FEE_RATE, cents, feeOf, money } from "@/lib/format";
import { Button } from "./ui";

const inp = "rounded-lg border border-transparent bg-transparent px-2 py-1 outline-none hover:border-line focus:border-ink-3 focus:bg-surface";

export function DraftCard({
  draft, onChange, onCreate, creating, disabled,
}: { draft: Draft; onChange: (d: Draft) => void; onCreate: () => void; creating: boolean; disabled?: boolean }) {
  const total = draft.milestones.reduce((s, m) => s + cents(m.amount), 0);
  const diff = cents(draft.budget) - total;
  const balanced = diff === 0;

  const setMs = (i: number, patch: Partial<Draft["milestones"][number]>) =>
    onChange({ ...draft, milestones: draft.milestones.map((m, j) => (j === i ? { ...m, ...patch } : m)) });

  function autoBalance() {
    const n = draft.milestones.length;
    const budget = cents(draft.budget);
    const base = total > 0 ? draft.milestones.map((m) => Math.round((cents(m.amount) * budget) / total)) : draft.milestones.map(() => Math.floor(budget / n));
    base[n - 1] += budget - base.reduce((a, b) => a + b, 0);
    onChange({ ...draft, milestones: draft.milestones.map((m, i) => ({ ...m, amount: (base[i] / 100).toFixed(2) })) });
  }

  return (
    <section className="rise w-full rounded-3xl border border-line bg-surface p-5 shadow-sm" aria-label="Project draft">
      <input aria-label="Project title" className={`${inp} w-full text-xl font-semibold`} value={draft.title} onChange={(e) => onChange({ ...draft, title: e.target.value })} />
      <textarea aria-label="Description" rows={2} className={`${inp} mt-1 w-full resize-none text-sm text-ink-2`} value={draft.description} onChange={(e) => onChange({ ...draft, description: e.target.value })} />

      <div className="mt-3 flex flex-wrap gap-1.5">
        {draft.skills.map((s) => <span key={s} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-ink-2">{s}</span>)}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <label className="rounded-2xl bg-surface-2 p-3">
          <span className="block text-xs text-ink-3">Budget ({draft.currency})</span>
          <input type="number" min={1} step="0.01" className={`${inp} -ml-2 w-full text-lg font-semibold`} value={draft.budget} onChange={(e) => onChange({ ...draft, budget: e.target.value })} />
        </label>
        <label className="rounded-2xl bg-surface-2 p-3">
          <span className="block text-xs text-ink-3">Deadline (days)</span>
          <input type="number" min={1} className={`${inp} -ml-2 w-full text-lg font-semibold`} value={draft.deadline_days} onChange={(e) => onChange({ ...draft, deadline_days: Number(e.target.value) })} />
        </label>
      </div>

      <h3 className="mb-1 mt-5 text-xs font-medium uppercase tracking-wide text-ink-3">Milestones</h3>
      <ul className="divide-y divide-line">
        {draft.milestones.map((m, i) => (
          <li key={i} className="flex items-start gap-2 py-2.5">
            <span className="mt-1.5 grid size-5 shrink-0 place-items-center rounded-full bg-surface-2 text-[11px] font-medium text-ink-2">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <input aria-label={`Milestone ${i + 1} title`} className={`${inp} w-full text-sm font-medium`} value={m.title} onChange={(e) => setMs(i, { title: e.target.value })} />
              <textarea aria-label={`Milestone ${i + 1} description`} rows={2} className={`${inp} w-full resize-none text-xs text-ink-2`} value={m.description} onChange={(e) => setMs(i, { description: e.target.value })} />
            </div>
            <input aria-label={`Milestone ${i + 1} amount`} type="number" min={0} step="0.01" className={`${inp} w-24 text-right text-sm font-medium`} value={m.amount} onChange={(e) => setMs(i, { amount: e.target.value })} />
            <button aria-label={`Remove milestone ${i + 1}`} disabled={draft.milestones.length <= 1} className="mt-1 rounded-full p-1.5 text-ink-3 hover:bg-surface-2 disabled:opacity-30"
              onClick={() => onChange({ ...draft, milestones: draft.milestones.filter((_, j) => j !== i).map((x, k) => ({ ...x, sequence: k + 1 })) })}>
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>

      <div className={`mt-2 flex items-center justify-between rounded-2xl px-3 py-2 text-sm ${balanced ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"}`}>
        <span>{balanced ? "Milestones add up to the budget" : `Milestones are ${money(Math.abs(diff) / 100, draft.currency)} ${diff > 0 ? "under" : "over"} budget`}</span>
        <span className="font-semibold">{money(total / 100, draft.currency)}</span>
      </div>

      <p className="mt-2 px-1 text-xs text-ink-3">
        A {FEE_RATE * 100}% platform fee ({money(draft.milestones.reduce((s, m) => s + feeOf(m.amount), 0), draft.currency)}) is added when you fund each milestone, so you&apos;d pay {money(draft.milestones.reduce((s, m) => s + Number(m.amount) + feeOf(m.amount), 0), draft.currency)} in total. The freelancer receives the full milestone amounts.
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-3">Edit anything above, or ask me to change it below.</p>
        <div className="flex gap-2">
          {!balanced && <Button variant="outline" onClick={autoBalance}><Scale className="size-4" /> Auto-balance</Button>}
          <Button onClick={onCreate} loading={creating} disabled={!balanced || disabled || !draft.title.trim()}>Create project</Button>
        </div>
      </div>
    </section>
  );
}
