"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Button } from "./ui";

type Options = {
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  /** Ask for a text reason too. The confirm button stays disabled until it's filled. */
  input?: { label: string; placeholder?: string };
};
type Result = { text: string } | null;
type Ask = (o: Options) => Promise<Result>;

const Ctx = createContext<Ask | null>(null);

/** Replaces window.confirm. `ask` resolves to null when cancelled, or {text} when confirmed. */
export function useAsk(): Ask {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAsk outside ConfirmProvider");
  return c;
}

export function useConfirm() {
  const ask = useAsk();
  return useCallback(async (o: Omit<Options, "input">) => (await ask(o)) !== null, [ask]);
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<Options | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const resolver = useRef<((r: Result) => void) | null>(null);

  const ask = useCallback<Ask>((o) => {
    setText("");
    setBusy(false);
    setOpts(o);
    return new Promise<Result>((resolve) => { resolver.current = resolve; });
  }, []);

  useEffect(() => {
    const d = dialog.current;
    if (opts && d && !d.open) d.showModal(); // native modal: focus trap, Esc, inert background
  }, [opts]);

  function finish(r: Result) {
    if (busy) return;
    setBusy(true);
    dialog.current?.close();
    resolver.current?.(r);
    resolver.current = null;
    setOpts(null);
  }

  const needsText = !!opts?.input;
  const canConfirm = !needsText || text.trim().length > 0;

  return (
    <Ctx.Provider value={ask}>
      {children}
      <dialog
        ref={dialog}
        aria-labelledby="confirm-title"
        onCancel={(e) => { e.preventDefault(); finish(null); }}
        onClick={(e) => { if (e.target === dialog.current) finish(null); }} // click on the backdrop
        className="m-auto w-[min(92vw,28rem)] rounded-3xl bg-surface p-0 text-ink shadow-2xl ring-1 ring-line backdrop:bg-black/50 backdrop:backdrop-blur-[2px]"
      >
        {opts && (
          <form
            method="dialog"
            className="rise space-y-4 p-6"
            onSubmit={(e) => { e.preventDefault(); if (canConfirm) finish({ text: text.trim() }); }}
          >
            <h2 id="confirm-title" className="text-lg font-semibold tracking-tight">{opts.title}</h2>
            {opts.body && <div className="space-y-2 text-sm text-ink-2">{opts.body}</div>}
            {opts.input && (
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-ink-2">{opts.input.label}</span>
                <textarea
                  autoFocus rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={opts.input.placeholder}
                  className="w-full rounded-xl border border-line bg-surface p-2.5 outline-none focus:border-ink-3"
                />
              </label>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => finish(null)}>{opts.cancelLabel ?? "Cancel"}</Button>
              <Button
                type="submit" disabled={!canConfirm} autoFocus={!opts.input}
                className={opts.tone === "danger" ? "!bg-bad !text-white" : ""}
              >
                {opts.confirmLabel ?? "Confirm"}
              </Button>
            </div>
          </form>
        )}
      </dialog>
    </Ctx.Provider>
  );
}
