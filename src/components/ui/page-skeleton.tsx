import { LoaderSkeleton } from "@/components/ui/loaders-skeleton";

const tone = "bg-line dark:bg-line";

export function PageSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <main className="min-h-screen bg-ivory" aria-busy="true" aria-label={label}>
      <div className="mx-auto w-full max-w-3xl px-4 pt-28 sm:px-6 sm:pt-36">
        <div className="flex items-center gap-4">
          <LoaderSkeleton className={tone} width={56} height={56} borderRadius={9999} />
          <div className="flex flex-1 flex-col gap-2">
            <LoaderSkeleton className={tone} width="40%" height={18} borderRadius={8} />
            <LoaderSkeleton className={tone} width="25%" height={12} />
          </div>
        </div>
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="mt-6 rounded-[22px] border border-line bg-white p-5">
            <div className="flex flex-col gap-3">
              <LoaderSkeleton className={tone} height={14} />
              <LoaderSkeleton className={tone} width="85%" height={14} />
              <LoaderSkeleton className={tone} width="60%" height={14} />
            </div>
            <LoaderSkeleton className={`mt-5 ${tone}`} height={140} borderRadius={16} />
          </div>
        ))}
      </div>
    </main>
  );
}
