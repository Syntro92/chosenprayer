"use client";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

const FIGURES = [
  { x: 40, y: 74, s: 0.9 },
  { x: 120, y: 60, s: 1.05, wave: true },
  { x: 200, y: 52, s: 1.15, cream: true },
  { x: 265, y: 70, s: 1 },
  { x: 330, y: 50, s: 1.2, wave: true },
  { x: 420, y: 62, s: 1.05 },
  { x: 490, y: 78, s: 0.9, wave: true },
];

/** Line-drawn crowd that bobs in a staggered wave while content loads. */
export function CrowdLoader({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  return (
    <svg
      viewBox="0 0 520 150"
      className={cn("w-full max-w-md text-charcoal-deep", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="Loading"
    >
      {FIGURES.map((f, i) => {
        const fill = f.cream ? "var(--color-cream)" : "var(--color-ivory)";
        return (
          <motion.g
            key={i}
            style={{ x: f.x, y: f.y, scale: f.s }}
            animate={reduce ? undefined : { y: [f.y, f.y - 14, f.y] }}
            transition={{
              duration: 1.2,
              ease: "easeInOut",
              repeat: Infinity,
              delay: i * 0.12,
            }}
          >
            <circle r="13" fill={fill} />
            <path d="M-26 62c0-26 10-40 26-40s26 14 26 40" fill={fill} />
            {f.wave && (
              <motion.path
                d="M24 44c6-10 10-22 8-34"
                style={{ originX: "24px", originY: "44px" }}
                animate={reduce ? undefined : { rotate: [0, -14, 8, 0] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.12 }}
              />
            )}
            <path d="M-5 -3c2 3 8 3 10 0" strokeWidth="1.2" />
          </motion.g>
        );
      })}
      <path d="M0 148h520" strokeWidth="1.2" className="text-illus-light" />
    </svg>
  );
}
