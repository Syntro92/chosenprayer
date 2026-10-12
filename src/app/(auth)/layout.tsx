import { CrowdIllustration } from "@/components/channels/illustrations";

// Shared by /signin and /signup so the artwork stays put
// while only the form swaps.
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <main className="relative flex min-h-screen flex-col items-center overflow-hidden bg-ivory px-4 pt-32 sm:pt-40">
        {children}
        <div className="mt-auto h-32 w-full max-w-3xl overflow-hidden pt-14 opacity-70 sm:h-40 sm:pt-20">
          <CrowdIllustration className="mx-auto w-[560px] max-w-none sm:w-full" />
        </div>
      </main>
    </>
  );
}
