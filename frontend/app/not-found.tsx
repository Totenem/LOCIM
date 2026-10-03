import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="mt-1 text-ink-2">That page doesn&apos;t exist.</p>
        <Link href="/workspace" className="mt-5 inline-block rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-ink">Go home</Link>
      </div>
    </main>
  );
}
