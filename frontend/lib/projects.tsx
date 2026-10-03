"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, type ProjectSummary } from "./api";
import { useAuth } from "./auth";

type State = { projects: ProjectSummary[]; loading: boolean; error: string; refresh: () => Promise<void> };
const Ctx = createContext<State | null>(null);

export function ProjectsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (user?.role !== "CLIENT") {
      setLoading(false);
      return;
    }
    try {
      setProjects(await api<ProjectSummary[]>("/api/projects"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, [user?.role]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return <Ctx.Provider value={{ projects, loading, error, refresh }}>{children}</Ctx.Provider>;
}

export function useProjects() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useProjects outside ProjectsProvider");
  return c;
}
