"use client";

import { ArrowUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Spinner } from "./ui";

export function PromptBox({
  onSubmit, busy, placeholder, autoFocus,
}: { onSubmit: (text: string) => void; busy?: boolean; placeholder: string; autoFocus?: boolean }) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [text]);

  function send() {
    const t = text.trim();
    if (!t || busy) return;
    onSubmit(t);
    setText("");
  }

  return (
    <div className="flex items-end gap-2 rounded-3xl border border-line bg-surface p-2 pl-5 shadow-sm focus-within:border-ink-3">
      <textarea
        ref={ref}
        rows={1}
        autoFocus={autoFocus}
        value={text}
        disabled={busy}
        aria-label="Describe your project"
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        className="max-h-52 flex-1 resize-none bg-transparent py-2.5 outline-none placeholder:text-ink-3 disabled:opacity-60"
      />
      <button
        onClick={send}
        disabled={busy || !text.trim()}
        aria-label="Send"
        className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-ink transition disabled:opacity-30"
      >
        {busy ? <Spinner /> : <ArrowUp className="size-5" />}
      </button>
    </div>
  );
}
