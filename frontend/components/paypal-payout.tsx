"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { api, type FreelancerMe } from "@/lib/api";
import { Button, Field, Skeleton } from "@/components/ui";
import { Modal } from "@/components/modal";

/** Freelancer payout setup. Lives on the Payments page; the form opens in a modal. */
export function PayPalPayout() {
  const [me, setMe] = useState<FreelancerMe | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<FreelancerMe>("/api/freelancers/me")
      .then((m) => {
        setMe(m);
        setEmail(m.paypal_email ?? "");
        // the "Connect PayPal" banner on the home screen links here with ?setup=1
        const q = new URLSearchParams(window.location.search);
        if (q.get("setup")) {
          setOpen(true);
          window.history.replaceState(null, "", window.location.pathname);
        }
      })
      .catch(() => setFailed(true));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const m = await api<FreelancerMe>("/api/freelancers/me", { method: "PUT", json: { paypal_email: email.trim() } });
      setMe(m);
      setOpen(false);
      toast.success("PayPal email saved. Clients can now hire you.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  if (failed) return <p className="rounded-3xl bg-surface p-4 text-sm text-ink-2 ring-1 ring-line">Couldn&apos;t load your payout settings. Refresh to try again.</p>;
  if (!me) return <Skeleton className="h-20 rounded-3xl" />;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-surface p-4 ring-1 ring-line">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2">{me.paypal_email ? <CheckCircle2 className="size-5 text-ok" /> : <Wallet className="size-5 text-ink-2" />}</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{me.paypal_email ? "PayPal connected" : "Connect PayPal to get paid"}</p>
            <p className="truncate text-xs text-ink-2">{me.paypal_email ?? "Clients can only hire you once a PayPal email is on file."}</p>
          </div>
        </div>
        <Button variant={me.paypal_email ? "outline" : "primary"} onClick={() => setOpen(true)}>{me.paypal_email ? "Change email" : "Connect PayPal"}</Button>
      </div>

      <Modal open={open} onClose={() => !saving && setOpen(false)} title="PayPal payout email">
        <form onSubmit={save} className="space-y-4">
          <p className="text-sm text-ink-2">When a client approves your work, the payment is sent to this PayPal address.</p>
          <Field label="PayPal email" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving} disabled={!email.trim() || email.trim() === me.paypal_email}>Save</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
