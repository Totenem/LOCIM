"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

/** GET a path with loading/error state and a reload. Skipped until `enabled` (e.g. the role is known). */
export function useFetch<T>(path: string, enabled = true) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(() => {
    setLoading(true);
    setError("");
    api<T>(path)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Something went wrong"))
      .finally(() => setLoading(false));
  }, [path]);

  useEffect(() => { if (enabled) reload(); }, [enabled, reload]);
  return { data, setData, loading, error, reload };
}
