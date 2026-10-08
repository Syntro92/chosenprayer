import { CrowdLoader } from "@/components/ui/crowd-loader";
import { LoaderSkeleton } from "@/components/ui/loaders-skeleton";

export default function Loading() {
  return (
    <main
      className="flex min-h-screen flex-col items-center bg-ivory px-4 pb-20 pt-32 sm:pt-44"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="flex w-full max-w-3xl flex-col items-center gap-5">
        <CrowdLoader className="mb-6" />
        <LoaderSkeleton className="bg-line dark:bg-line" width={140} height={12} />
        <LoaderSkeleton className="bg-line dark:bg-line" width="80%" height={44} borderRadius={10} />
        <LoaderSkeleton className="bg-line dark:bg-line" width="55%" height={44} borderRadius={10} />
        <LoaderSkeleton className="mt-2 bg-line dark:bg-line" width="65%" height={16} />
        <LoaderSkeleton className="bg-line dark:bg-line" width="50%" height={16} />
        <LoaderSkeleton className="mt-4 bg-line dark:bg-line" width={180} height={48} borderRadius={12} />
      </div>
    </main>
  );
}
