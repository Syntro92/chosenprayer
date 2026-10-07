import type { ReactNode } from "react";
import type { CoverScene, CoverTone } from "@/lib/channels";

export const TONE_CLASS: Record<CoverTone, string> = {
  cream: "from-cream via-[#FFEBA8] to-bless/60",
  mist: "from-mist via-[#D9E6DE] to-sage/50",
  sage: "from-[#E6EFE8] via-[#CFE0D4] to-sage/70",
  stone: "from-[#F1F2F0] via-[#E4E7E4] to-illus-light/80",
};

const SCENES: Record<CoverScene, ReactNode> = {
  horizon: (
    <>
      <circle cx="300" cy="50" r="22" />
      <path d="M0 130c60-30 110-30 170 0s120 30 230-10" />
      <path d="M0 148c70-24 130-24 190 0s130 20 210-6" />
    </>
  ),
  hills: (
    <>
      <path d="M0 120c50-50 90-50 140-8 40 32 80 20 120-18 40-34 90-20 140 14" />
      <path d="M0 146c60-26 110-18 170 4s150 6 230-20" />
      <path d="M62 38c4-6 12-6 16 0M96 26c3-5 10-5 13 0" />
    </>
  ),
  sun: (
    <>
      <circle cx="200" cy="96" r="30" />
      <path d="M200 46v14M200 132v14M150 96h14M236 96h14M165 61l10 10M225 121l10 10M235 61l-10 10M175 121l-10 10" />
      <path d="M0 150c80-14 140-14 200 0s140 14 200 0" />
    </>
  ),
  waves: (
    <>
      <path d="M0 70c40-18 80-18 120 0s80 18 120 0 80-18 160 0" />
      <path d="M0 98c40-18 80-18 120 0s80 18 120 0 80-18 160 0" />
      <path d="M0 126c40-18 80-18 120 0s80 18 120 0 80-18 160 0" />
      <circle cx="330" cy="36" r="14" />
    </>
  ),
};

/** Black-and-white line scene that sits on top of a gradient cover. */
export function CoverArt({ scene }: { scene: CoverScene }) {
  return (
    <svg
      viewBox="0 0 400 160"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 size-full text-charcoal-deep/25"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {SCENES[scene]}
    </svg>
  );
}

/** One hand-drawn figure: head and shoulders, optionally with a raised arm. */
function Figure({
  x,
  y,
  s = 1,
  wave,
  fill,
}: {
  x: number;
  y: number;
  s?: number;
  wave?: boolean;
  fill?: string;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <circle cx="0" cy="0" r="13" fill={fill ?? "var(--color-ivory)"} />
      <path d="M-26 62c0-26 10-40 26-40s26 14 26 40" fill={fill ?? "var(--color-ivory)"} />
      {wave && <path d="M24 44c6-10 10-22 8-34" />}
      <path d="M-5 -3c2 3 8 3 10 0" strokeWidth="1.2" />
    </g>
  );
}

/**
 * Small crowd of line-drawn figures echoing the homepage artwork.
 * Pass `crop` to render only the upper part, as if the crowd continues
 * past the edge of its container.
 */
export function CrowdIllustration({
  className = "",
  size = "full",
}: {
  className?: string;
  size?: "full" | "small";
}) {
  return (
    <svg
      viewBox="0 0 520 150"
      className={`text-charcoal-deep ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {size === "full" && (
        <>
          <Figure x={40} y={74} s={0.9} />
          <Figure x={120} y={60} s={1.05} wave />
          <Figure x={420} y={62} s={1.05} />
          <Figure x={490} y={78} s={0.9} wave />
        </>
      )}
      <Figure x={200} y={52} s={1.15} fill="var(--color-cream)" />
      <Figure x={330} y={50} s={1.2} wave />
      <Figure x={265} y={70} s={1} />
      <path d="M0 148h520" strokeWidth="1.2" className="text-illus-light" />
    </svg>
  );
}

/** Small hand-drawn magnifier over a crowd, for the empty state. */
export function EmptyIllustration() {
  return (
    <div className="relative mx-auto w-56">
      <CrowdIllustration size="small" className="w-full" />
      <svg
        viewBox="0 0 60 60"
        className="absolute -right-2 -top-3 w-14 text-charcoal-deep"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        aria-hidden
      >
        <circle cx="24" cy="24" r="14" fill="var(--color-cream)" />
        <path d="m34.500 34.500 16 16" />
        <path d="M18 28c2 3 10 3 12 0" />
        <circle cx="19.500" cy="21" r=".9" fill="currentColor" />
        <circle cx="28.500" cy="21" r=".9" fill="currentColor" />
      </svg>
    </div>
  );
}
