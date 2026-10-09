"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUp, CircleCheck } from "lucide-react";

export type OrbitRing = "outer" | "inner";

interface OrbitBase {
  ring: OrbitRing;
  angle: number;
}

export interface OrbitAvatarItem extends OrbitBase {
  kind: "avatar";
  src: string;
  alt?: string;
  color: string;
  size?: number;
}

export interface OrbitPillItem extends OrbitBase {
  kind: "pill";
  icon: ReactNode;
  label: string;
}

export interface OrbitCardItem extends OrbitBase {
  kind: "card";
  emoji: string;
  badge?: string | number;
}

export interface OrbitStatusItem extends OrbitBase {
  kind: "status";
  label: string;
}

export interface OrbitCheckItem extends OrbitBase {
  kind: "check";
}

export type OrbitItem =
  | OrbitAvatarItem
  | OrbitPillItem
  | OrbitCardItem
  | OrbitStatusItem
  | OrbitCheckItem;

export interface OrbitTag {
  icon: ReactNode;
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface CommunityOrbitProps {
  items: OrbitItem[];
  headline?: ReactNode;
  tags?: OrbitTag[];
  minScale?: number;
  className?: string;
}

const STAGE_W = 1200;
const STAGE_H = 490;
const CENTER = { x: 600, y: 620 };
const RADIUS: Record<OrbitRing, number> = { outer: 492, inner: 404 };

function positionOnRing(ring: OrbitRing, angle: number): CSSProperties {
  const rad = (angle * Math.PI) / 180;
  const r = RADIUS[ring];
  // Rounded so the server-rendered style string matches the client value (avoids a hydration mismatch).
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    left: round(CENTER.x + r * Math.cos(rad)),
    top: round(CENTER.y - r * Math.sin(rad)),
  };
}

// Arc that starts on the left, passes over the top and ends on the right.
function arcPath(r: number) {
  const dy = CENTER.y - STAGE_H;
  const dx = Math.sqrt(r * r - dy * dy);
  return `M ${CENTER.x - dx} ${STAGE_H} A ${r} ${r} 0 0 1 ${CENTER.x + dx} ${STAGE_H}`;
}

function OrbitAvatar({ src, alt, color, size = 72 }: OrbitAvatarItem) {
  return (
    <div
      className="rounded-full border border-black/[0.07] bg-white p-[3px] shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-[#161616]"
      style={{ width: size, height: size }}
    >
      <div className="h-full w-full overflow-hidden rounded-full" style={{ backgroundColor: color }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt ?? ""}
          draggable={false}
          className="h-full w-full translate-y-[8%] scale-[1.08] select-none object-cover object-top"
        />
      </div>
    </div>
  );
}

function OrbitPill({ icon, label }: OrbitPillItem) {
  return (
    <div className="flex min-h-[27px] items-center gap-2 whitespace-nowrap rounded-full border border-black/[0.08] bg-white py-[5px] px-2.5 text-[12.5px] font-medium text-[#6c6c78] shadow-[0_2px_6px_rgba(0,0,0,0.05)] dark:border-white/10 dark:bg-[#161616] dark:text-white/60">
      <span className="flex shrink-0 items-center text-[13px] leading-none">{icon}</span>
      <span className="leading-none">{label}</span>
    </div>
  );
}

function OrbitCard({ emoji, badge }: OrbitCardItem) {
  return (
    <div className="relative flex h-[52px] w-[52px] items-center justify-center rounded-xl border border-black/[0.08] bg-[#f7f7f8] text-[22px] leading-none shadow-[0_2px_8px_rgba(0,0,0,0.05)] dark:border-white/10 dark:bg-[#1c1c1c]">
      <span className="select-none">{emoji}</span>
      {badge !== undefined && (
        <span className="absolute -bottom-[5px] -right-2 flex h-[18px] items-center gap-0.5 rounded-[5px] border border-black/[0.08] bg-white px-1.5 text-[10px] font-medium leading-none text-[#7a7a7a] shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-[#222] dark:text-white/60">
          <ArrowUp size={9} strokeWidth={2.2} />
          {badge}
        </span>
      )}
    </div>
  );
}

function OrbitStatus({ label }: OrbitStatusItem) {
  return (
    <div className="flex h-[30px] items-center gap-1.5 whitespace-nowrap rounded-full border border-[#a3d5b3] bg-[#cbe8d3] px-2.5 text-[13.5px] font-medium text-[#2f5b3a] shadow-[0_2px_6px_rgba(0,0,0,0.05)] dark:border-[#2f5b3a] dark:bg-[#17301f] dark:text-[#a8e0b8]">
      <CircleCheck size={15} strokeWidth={2.2} className="fill-[#2e7d3e] text-[#cbe8d3] dark:fill-[#3fa456] dark:text-[#17301f]" />
      {label}
    </div>
  );
}

function OrbitCheck() {
  return (
    <div className="flex h-[50px] w-[50px] items-center justify-center rounded-full border border-[#a9d8b8] bg-[#c3e5cd] shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:border-[#2f5b3a] dark:bg-[#1c3a26]">
      <CircleCheck size={17} strokeWidth={2.4} className="fill-[#2e7d3e] text-[#c3e5cd] dark:fill-[#3fa456] dark:text-[#1c3a26]" />
    </div>
  );
}

function renderItem(item: OrbitItem) {
  switch (item.kind) {
    case "avatar":
      return <OrbitAvatar {...item} />;
    case "pill":
      return <OrbitPill {...item} />;
    case "card":
      return <OrbitCard {...item} />;
    case "status":
      return <OrbitStatus {...item} />;
    case "check":
      return <OrbitCheck />;
  }
}

const reveal = {
  hidden: { opacity: 0, y: 14, filter: "blur(4px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)" },
};

export default function CommunityOrbit({
  items,
  headline,
  tags = [],
  minScale = 0.6,
  className,
}: CommunityOrbitProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const reduce = useReducedMotion();

  // Start at full size, then shrink to fit the frame.
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () =>
      setScale(Math.min(1, Math.max(minScale, frame.clientWidth / STAGE_W)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(frame);
    return () => ro.disconnect();
  }, [minScale]);

  return (
    <section className={`w-full bg-transparent px-4 pb-14 text-[#1f1f1f] dark:text-white ${className ?? ""}`}>
      <div
        ref={frameRef}
        className="relative mx-auto w-full max-w-[1200px] overflow-hidden"
        style={{ height: STAGE_H * scale }}
      >
        <div
          className="absolute left-1/2 top-0"
          style={{
            width: STAGE_W,
            height: STAGE_H,
            transform: `translateX(-50%) scale(${scale})`,
            transformOrigin: "top center",
          }}
        >
          <svg
            className="pointer-events-none absolute inset-0"
            width={STAGE_W}
            height={STAGE_H}
            viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
            fill="none"
            aria-hidden
            style={{
              maskImage: "linear-gradient(to bottom, #000 62%, transparent 100%)",
              WebkitMaskImage: "linear-gradient(to bottom, #000 62%, transparent 100%)",
            }}
          >
            <motion.path
              d={arcPath(RADIUS.outer)}
              className="stroke-[#e4e4e4] dark:stroke-white/10"
              strokeWidth={2}
              initial={{ pathLength: reduce ? 1 : 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.4, ease: "easeOut" }}
            />
            <motion.path
              d={arcPath(RADIUS.inner)}
              className="stroke-[#dcdcdc] dark:stroke-white/[0.13]"
              strokeWidth={3}
              initial={{ pathLength: reduce ? 1 : 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.4, ease: "easeOut", delay: 0.1 }}
            />
          </svg>

          {items.map((item, i) => (
            <motion.div
              key={i}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={positionOnRing(item.ring, item.angle)}
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.5 + i * 0.07, ease: [0.22, 1, 0.36, 1] }}
            >
              <motion.div
                animate={reduce ? undefined : { y: [0, -4, 0] }}
                transition={{
                  duration: 4 + (i % 4) * 0.6,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: (i * 0.4) % 2,
                }}
                whileHover={{ scale: 1.06 }}
              >
                {renderItem(item)}
              </motion.div>
            </motion.div>
          ))}
        </div>
      </div>

      {headline && (
        <motion.h2
          className="mx-auto mt-2 max-w-[600px] text-center text-[26px] font-[450] leading-[1.18] tracking-[-0.01em] sm:text-[34px]"
          variants={reveal}
          initial="hidden"
          animate="show"
          transition={{ duration: 0.7, delay: 1.0, ease: [0.22, 1, 0.36, 1] }}
        >
          {headline}
        </motion.h2>
      )}

      {tags.length > 0 && (
        <div className="mx-auto mt-8 flex max-w-[760px] flex-wrap justify-center gap-3">
          {tags.map((t, i) => {
            const Tag = (t.href ? motion.a : motion.button) as typeof motion.a;
            return (
              <Tag
                key={t.label}
                {...(t.href ? { href: t.href } : { type: "button" as const })}
                onClick={t.onClick}
                variants={reveal}
                initial="hidden"
                animate="show"
                transition={{ duration: 0.5, delay: 1.3 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                whileHover={{ y: -2 }}
                whileTap={{ y: 0 }}
                className="group flex h-10 items-center gap-2.5 rounded-full border border-black/[0.08] bg-white pl-1.5 pr-4 text-[14px] font-medium text-[#3a3a3a] transition-all duration-200 hover:border-black/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2e7d3e]/40"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#eef4f0] text-[#2e7d3e] transition-colors group-hover:bg-[#2e7d3e] group-hover:text-white [&>svg]:h-[15px] [&>svg]:w-[15px]">
                  {t.icon}
                </span>
                {t.label}
              </Tag>
            );
          })}
        </div>
      )}
    </section>
  );
}

export { CommunityOrbit as Component };
