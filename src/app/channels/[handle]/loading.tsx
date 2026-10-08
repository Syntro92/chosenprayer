import { CrowdLoader } from "@/components/ui/crowd-loader";
import { LoaderSkeleton } from "@/components/ui/loaders-skeleton";

const tone = "bg-line dark:bg-line";

export default function Loading() {
  return (
    <main className="min-h-screen bg-ivory" aria-busy="true" aria-label="Loading channel">
      <div className="mx-auto w-full max-w-6xl px-4 pt-28 sm:px-6 sm:pt-36 lg:px-10">
        <div className="relative flex h-[200px] items-end justify-center overflow-hidden rounded-[22px] border border-line bg-white">
          <CrowdLoader className="translate-y-1" />
        </div>
        <div className="mt-6 flex items-center gap-5">
          <LoaderSkeleton className={tone} width={88} height={88} borderRadius={9999} />
          <div className="flex flex-1 flex-col gap-3">
            <LoaderSkeleton className={tone} width="45%" height={26} borderRadius={8} />
            <LoaderSkeleton className={tone} width="25%" height={14} />
          </div>
          <LoaderSkeleton className={tone} width={140} height={48} borderRadius={12} />
        </div>
        <div className="mt-10 grid gap-8 md:grid-cols-[1.5fr_1fr]">
          <div className="flex flex-col gap-3">
            <LoaderSkeleton className={tone} height={14} />
            <LoaderSkeleton className={tone} height={14} />
            <LoaderSkeleton className={tone} width="75%" height={14} />
            <LoaderSkeleton className={`mt-4 ${tone}`} height={180} borderRadius={16} />
          </div>
          <LoaderSkeleton className={tone} height={260} borderRadius={22} />
        </div>
      </div>
    </main>
  );
}
