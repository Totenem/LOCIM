"use client";

import { useCallback, useEffect, useState } from "react";
import { Users } from "lucide-react";
import { toast } from "sonner";
import { ApiError, api, type FreelancerMatch, type Project } from "@/lib/api";
import { Avatar, Button, EmptyState, ErrorCard, Skeleton } from "@/components/ui";
import { useConfirm } from "@/components/confirm";

function MatchSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Finding matches">
      {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-3xl" />)}
    </div>
  );
}

export function Matches({ projectId, onHired }: { projectId: number; onHired: (p: Project) => void }) {
  const [matches, setMatches] = useState<FreelancerMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hiring, setHiring] = useState<number | null>(null);
  const confirm = useConfirm();

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api<FreelancerMatch[]>(`/api/projects/${projectId}/matches`)
      .then(setMatches)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load matches"))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function hire(id: number, name: string) {
    if (!(await confirm({ title: `Hire ${name}?`, confirmLabel: `Hire ${name.split(" ")[0]}`, body: <p>No money moves yet. You pay only when you fund a milestone, and {name.split(" ")[0]} is paid only after you approve the work.</p> }))) return;
    setHiring(id);
    try {
      const p = await api<Project>(`/api/projects/${projectId}/hire`, { method: "POST", json: { freelancer_id: id } });
      toast.success(`${name} is on the project`);
      onHired(p);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't hire");
    } finally {
      setHiring(null);
    }
  }

  return (
    <section aria-label="Suggested freelancers">
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-3">Suggested freelancers</h2>
      {loading && <MatchSkeleton />}
      {!loading && error && <ErrorCard message={error} onRetry={load} />}
      {!loading && !error && matches.length === 0 && (
        <EmptyState icon={<Users className="size-5" />} title="No matches yet" body="Freelancers who sign up will be ranked against this project." />
      )}
      {!loading && !error && matches.length > 0 && (
        <ul className="space-y-2">
          {matches.map(({ freelancer: f, score, reasons }) => (
            <li key={f.id} className="rise flex gap-3 rounded-3xl bg-surface p-4 ring-1 ring-line">
              <Avatar name={f.name} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium">{f.name}</p>
                  <span className="text-sm font-semibold" aria-label={`Match score ${score} out of 100`}>{score}%</span>
                </div>
                <p className="text-xs text-ink-2">{f.headline}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-ink" style={{ width: `${score}%` }} />
                </div>
                <ul className="mt-2 space-y-0.5 text-xs text-ink-2">
                  {reasons.map((r) => <li key={r}>· {r}</li>)}
                </ul>
                <div className="mt-3 flex items-center gap-3">
                  <Button className="!px-4 !py-1.5 text-xs" loading={hiring === f.id} disabled={hiring !== null || !f.payout_ready || f.at_capacity}
                    onClick={() => hire(f.id, f.name)}>Hire {f.name.split(" ")[0]}</Button>
                  {!f.payout_ready && <span className="text-xs text-ink-3">Hasn&apos;t connected PayPal yet</span>}
                  {f.payout_ready && f.at_capacity && <span className="text-xs text-ink-3">Full: {f.active_projects} active projects</span>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
