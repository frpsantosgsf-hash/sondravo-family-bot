import { Skeleton } from '@/components/ui/Skeleton';

export default function Loading() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-6 h-48 w-full" />
      <Skeleton className="mt-6 h-12 w-full" />
      <Skeleton className="mt-4 h-96 w-full" />
    </main>
  );
}
