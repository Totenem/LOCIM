import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, InputHTMLAttributes } from "react";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function Spinner({ className = "size-4" }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} aria-label="Loading" />;
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline";
  loading?: boolean;
};
export function Button({ variant = "primary", loading, children, className = "", disabled, ...p }: BtnProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info";
  const v = {
    primary: "bg-accent text-accent-ink hover:opacity-90",
    outline: "border border-line bg-surface hover:bg-surface-2",
    ghost: "hover:bg-surface-2 text-ink-2",
  }[variant];
  return (
    <button className={`${base} ${v} ${className}`} disabled={disabled || loading} {...p}>
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Field({ label, error, ...p }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-ink-2">{label}</span>
      <input
        className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 outline-none focus:border-ink-3 disabled:opacity-60"
        {...p}
      />
      {error && <span className="mt-1 block text-bad">{error}</span>}
    </label>
  );
}

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const initials = name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
      style={{ width: size, height: size, background: `hsl(${hue} 45% 45%)` }}
    >
      {initials}
    </span>
  );
}

const STATUS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "Draft", color: "bg-ink-3" },
  OPEN: { label: "Open", color: "bg-info" },
  PENDING: { label: "Pending", color: "bg-ink-3" },
  FUNDED: { label: "Funded", color: "bg-warn" },
  ASSIGNED: { label: "Freelancer hired", color: "bg-info" },
  SUBMITTED: { label: "Submitted", color: "bg-info" },
  RELEASED: { label: "Paid out", color: "bg-ok" },
  DISPUTED: { label: "Disputed", color: "bg-bad" },
  IN_PROGRESS: { label: "In progress", color: "bg-info" },
  COMPLETED: { label: "Completed", color: "bg-ok" },
  available: { label: "Available", color: "bg-ok" },
  busy: { label: "Busy", color: "bg-warn" },
};
export function StatusChip({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, color: "bg-ink-3" };
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-2">
      <span className={`size-1.5 rounded-full ${s.color}`} />
      {s.label}
    </span>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center py-16 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-full bg-surface text-ink-2 ring-1 ring-line">{icon}</div>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-ink-2">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-bad/30 bg-bad/5 p-4 text-sm">
      <p className="font-medium text-bad">Something went wrong</p>
      <p className="mt-1 text-ink-2">{message}</p>
      {onRetry && (
        <Button variant="outline" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
