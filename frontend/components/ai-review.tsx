import { Check, Minus, Sparkles } from "lucide-react";
import type { AIReview } from "@/lib/api";

const VERDICT = {
  MEETS: { label: "Looks complete", cls: "text-ok" },
  PARTIAL: { label: "Partly addressed", cls: "text-warn" },
  UNCLEAR: { label: "Not enough evidence", cls: "text-ink-2" },
} as const;

/** Advisory only. The client always makes the call. */
export function AIReviewCard({ review }: { review: AIReview }) {
  const v = VERDICT[review.verdict];
  return (
    <div className="mt-2 rounded-2xl bg-surface-2 p-3 text-xs" aria-label="AI review of the submission">
      <p className="flex items-center gap-1.5 font-medium">
        <Sparkles className="size-3.5" /> AI review: <span className={v.cls}>{v.label}</span>
      </p>
      <p className="mt-1 text-ink-2">{review.summary}</p>
      {review.checks.length > 0 && (
        <ul className="mt-2 space-y-1">
          {review.checks.map((c, i) => (
            <li key={i} className="flex items-start gap-1.5 text-ink-2">
              {c.met ? <Check className="mt-0.5 size-3.5 shrink-0 text-ok" /> : <Minus className="mt-0.5 size-3.5 shrink-0 text-ink-3" />}
              <span><span className="text-ink">{c.requirement}</span>{c.comment && <> · {c.comment}</>}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-ink-3">AI suggestion only. Check the work yourself before you pay.</p>
    </div>
  );
}
