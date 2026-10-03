"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { api, type Draft, type Project } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useProjects } from "@/lib/projects";
import { DraftCard } from "@/components/draft-card";
import { AdminOverviewPage } from "@/components/admin-overview";
import { FreelancerHome } from "@/components/freelancer-home";
import { PromptBox } from "@/components/prompt-box";
import { EmptyState, ErrorCard, Spinner } from "@/components/ui";

type Turn =
  | { kind: "user"; text: string }
  | { kind: "draft"; draft: Draft }
  | { kind: "error"; message: string; retry: () => void };

const STEPS = ["Understanding your request", "Structuring milestones", "Validating the budget"];
const EXAMPLES = [
  "I need a restaurant website for around ₱25,000 within two weeks",
  "Build a mobile app prototype for a dog-walking service, ₱75,000, 6 weeks",
  "Logo and brand kit for a coffee shop, ₱15,000, one week",
];

function Progress() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1800);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="rise space-y-2 rounded-3xl border border-line bg-surface p-4" role="status" aria-live="polite">
      {STEPS.map((s, i) => (
        <div key={s} className={`flex items-center gap-2.5 text-sm ${i > step ? "text-ink-3" : "text-ink"}`}>
          {i < step ? <Check className="size-4 text-ok" /> : i === step ? <Spinner /> : <span className="size-4" />}
          {s}
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  const router = useRouter();
  const { refresh } = useProjects();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [generating, setGenerating] = useState(false);
  const [creating, setCreating] = useState(false);
  const prompts = useRef<string[]>([]);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns, generating]);

  if (user?.role === "ADMIN") return <AdminOverviewPage />;
  if (user?.role !== "CLIENT") return <FreelancerHome />;

  const draftIdx = turns.map((t) => t.kind).lastIndexOf("draft");
  const current = draftIdx >= 0 ? (turns[draftIdx] as { kind: "draft"; draft: Draft }).draft : null;

  async function run(text: string, previous: Draft | null, isRetry = false) {
    setGenerating(true);
    setTurns((t) => [...t.filter((x) => x.kind !== "error"), ...(isRetry ? [] : [{ kind: "user" as const, text }])]);
    try {
      const draft = await api<Draft>("/api/ai/project", { method: "POST", json: { prompt: text, previous_draft: previous } });
      setTurns((t) => [...t, { kind: "draft", draft }]);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong";
      setTurns((t) => [...t, { kind: "error", message, retry: () => run(text, previous, true) }]);
    } finally {
      setGenerating(false);
    }
  }

  function submit(text: string) {
    if (!current) prompts.current = [text];
    else prompts.current.push(text);
    run(text, current);
  }

  async function create() {
    if (!current) return;
    setCreating(true);
    try {
      const p = await api<Project>("/api/projects", {
        method: "POST",
        json: { ...current, budget: Number(current.budget), milestones: current.milestones.map((m, i) => ({ ...m, amount: Number(m.amount), sequence: i + 1 })), original_prompt: prompts.current[0] ?? "" },
      });
      await refresh();
      toast.success("Project created");
      router.push(`/workspace/p/${p.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create the project");
      setCreating(false);
    }
  }

  const empty = turns.length === 0;

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col px-4">
      {empty ? (
        <div className="flex flex-1 flex-col items-center justify-center pb-16 text-center">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">What do you want built{user ? `, ${user.name.split(" ")[0]}` : ""}?</h1>
          <p className="mb-8 mt-2 text-ink-2">Describe it in your own words. I&apos;ll turn it into a project with milestones.</p>
          <div className="w-full"><PromptBox onSubmit={submit} busy={generating} autoFocus placeholder="e.g. I need a restaurant website for ₱25,000 within two weeks" /></div>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {EXAMPLES.map((e) => (
              <button key={e} onClick={() => submit(e)} className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm text-ink-2 hover:bg-surface-2">{e}</button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 space-y-5 py-6">
            {turns.map((t, i) =>
              t.kind === "user" ? (
                <div key={i} className="rise flex justify-end"><p className="max-w-[85%] rounded-3xl bg-surface-2 px-4 py-2.5 text-sm">{t.text}</p></div>
              ) : t.kind === "draft" ? (
                i === draftIdx ? (
                  <DraftCard key={i} draft={t.draft} creating={creating} disabled={generating}
                    onChange={(d) => setTurns((all) => all.map((x, j) => (j === i ? { kind: "draft", draft: d } : x)))} onCreate={create} />
                ) : (
                  <p key={i} className="rise text-sm text-ink-3">Earlier draft: {t.draft.title}</p>
                )
              ) : (
                <ErrorCard key={i} message={t.message} onRetry={t.retry} />
              ),
            )}
            {generating && <Progress />}
            <div ref={bottom} />
          </div>
          <div className="sticky bottom-0 bg-gradient-to-t from-canvas from-70% to-transparent pb-4 pt-2">
            <PromptBox onSubmit={submit} busy={generating || creating} placeholder={current ? "Ask for a change, e.g. “make it cheaper”" : "Describe your project"} />
          </div>
        </>
      )}
    </div>
  );
}
