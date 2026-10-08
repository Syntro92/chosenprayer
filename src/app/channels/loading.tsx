import { CrowdLoader } from "@/components/ui/crowd-loader";
import { LoaderSkeleton } from "@/components/ui/loaders-skeleton";

const tone = "bg-line dark:bg-line";

export default function Loading() {
  return (
    <main className="min-h-screen bg-ivory" aria-busy="true" aria-label="Loading channels">
      <section className="mx-auto flex w-full max-w-3xl flex-col items-center gap-5 px-4 pb-12 pt-32 sm:pb-16 sm:pt-44">
        <CrowdLoader className="mb-4" />
        <LoaderSkeleton className={tone} width={150} height={12} />
        <LoaderSkeleton className={tone} width="85%" height={48} borderRadius={10} />
        <LoaderSkeleton className={tone} width="60%" height={16} />
      </section>
      <section className="mx-auto grid w-full max-w-6xl gap-5 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-3 lg:px-10">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="rounded-[22px] border border-line bg-white p-5">
            <div className="flex items-center gap-4">
              <LoaderSkeleton className={tone} width={48} height={48} borderRadius={9999} />
              <div className="flex flex-1 flex-col gap-2">
                <LoaderSkeleton className={tone} width="70%" height={14} />
                <LoaderSkeleton className={tone} width="40%" height={12} />
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-2">
              <LoaderSkeleton className={tone} height={12} />
              <LoaderSkeleton className={tone} width="80%" height={12} />
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
