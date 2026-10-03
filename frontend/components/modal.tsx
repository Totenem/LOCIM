"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

/** General-purpose modal on the native <dialog>: focus trap, Esc to close, inert background. */
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="modal-title"
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }} // backdrop click
      className="m-auto w-[min(92vw,28rem)] rounded-3xl bg-surface p-0 text-ink shadow-2xl ring-1 ring-line backdrop:bg-black/50 backdrop:backdrop-blur-[2px]"
    >
      {open && (
        <div className="rise space-y-4 p-6">
          <div className="flex items-start justify-between gap-3">
            <h2 id="modal-title" className="text-lg font-semibold tracking-tight">{title}</h2>
            <button aria-label="Close" onClick={onClose} className="-m-1.5 rounded-full p-1.5 text-ink-3 hover:bg-surface-2"><X className="size-4" /></button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
