"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ProjectsProvider } from "@/lib/projects";
import { ConfirmProvider } from "@/components/confirm";
import { Sidebar } from "@/components/sidebar";
import { Skeleton } from "@/components/ui";

function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh" aria-busy="true">
      <aside className="hidden w-64 shrink-0 space-y-3 border-r border-line p-4 md:block">
        <Skeleton className="h-7 w-24" /><Skeleton className="h-10" /><Skeleton className="h-9" />
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8" />)}
      </aside>
      <main className="flex-1 p-6"><Skeleton className="mx-auto mt-40 h-14 max-w-2xl" /></main>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) return <ShellSkeleton />;

  return (
    <ProjectsProvider>
      <ConfirmProvider>
      <div className="flex h-dvh">
        <aside className="hidden w-64 shrink-0 border-r border-line bg-canvas md:block"><Sidebar /></aside>

        {open && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-72 bg-canvas shadow-xl"><Sidebar onNavigate={() => setOpen(false)} /></aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-2 px-3 py-2 md:hidden">
            <button className="rounded-full p-2 hover:bg-surface-2" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen(!open)}>
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
            <span className="font-semibold">LOCIM</span>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
      </ConfirmProvider>
    </ProjectsProvider>
  );
}
