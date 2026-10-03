"use client";

import { ErrorCard } from "@/components/ui";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <ErrorCard message={error.message || "An unexpected error occurred."} onRetry={reset} />
    </div>
  );
}
