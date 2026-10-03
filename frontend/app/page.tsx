import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

export default function Landing() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4">
      <header className="flex items-center justify-between py-5">
        <span className="text-lg font-semibold tracking-tight">LOCIM</span>
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/login" className="rounded-full px-4 py-2 text-ink-2 hover:bg-surface-2">Log in</Link>
          <Link href="/register" className="rounded-full bg-accent px-4 py-2 font-medium text-accent-ink">Get started</Link>
        </nav>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center pb-24 text-center">
        <span className="mb-5 inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-xs font-medium text-ink-2 ring-1 ring-line">
          <Sparkles className="size-3.5" /> AI-native freelance transactions
        </span>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">From idea to work to payment.</h1>
        <p className="mt-4 max-w-xl text-lg text-ink-2">
          Just describe what you want built. LOCIM turns it into a structured project with milestones,
          matches you with the right freelancer, and handles payment.
        </p>
        <Link
          href="/register"
          className="mt-8 flex w-full max-w-xl items-center justify-between rounded-3xl border border-line bg-surface px-5 py-4 text-left text-ink-3 shadow-sm transition hover:shadow-md"
        >
          <span>I need a restaurant website for ₱25,000 within two weeks…</span>
          <span className="grid size-9 place-items-center rounded-full bg-accent text-accent-ink"><ArrowRight className="size-4" /></span>
        </Link>
        <p className="mt-3 text-xs text-ink-3">Payments run on PayPal Sandbox for this demo. No real money moves.</p>
      </section>
    </main>
  );
}
