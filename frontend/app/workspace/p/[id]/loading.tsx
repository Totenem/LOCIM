import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-8" aria-busy="true">
      <Skeleton className="h-8 w-2/3" /><Skeleton className="h-4 w-full" />
    </div>
  );
}
