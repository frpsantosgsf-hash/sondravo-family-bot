import { RegistrySkeleton, Skeleton } from '@/components/ui/Skeleton';

export default function LedenLoading() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="panel flex flex-col gap-6 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div className="flex items-center gap-4">
          <Skeleton className="h-12 w-16 sm:h-16 sm:w-20" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-52" />
            <Skeleton className="h-3 w-36" />
          </div>
        </div>
        <div className="w-full max-w-[220px] space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-1.5 w-full rounded-full" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-2.5 sm:mt-8 sm:flex-row">
        <Skeleton className="h-12 flex-1 rounded-lg" />
        <Skeleton className="h-12 rounded-lg sm:w-56" />
      </div>

      <div className="mt-6">
        <RegistrySkeleton />
      </div>
    </main>
  );
}
