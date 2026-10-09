"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import type { Member } from "@/lib/community/types";

export const focus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-charcoal-deep focus-visible:ring-offset-2";
export const primaryBtn = `inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-bless px-5 text-sm font-semibold text-charcoal-deep shadow-sm transition hover:bg-bless-deep active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${focus}`;
export const secondaryBtn = `inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-charcoal-deep/20 bg-white px-5 text-sm font-semibold text-charcoal-deep transition hover:border-charcoal-deep active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${focus}`;
export const ghostBtn = `inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-slate transition-colors hover:bg-charcoal-deep/5 hover:text-charcoal-deep ${focus}`;

export function Avatar({
  member,
  size = "md",
}: {
  member: Pick<Member, "name" | "tone">;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const dim = { sm: "size-8 text-xs", md: "size-11 text-sm", lg: "size-14 text-base", xl: "size-24 text-2xl" }[size];
  const initials = member.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full border border-line font-semibold text-charcoal-deep ${member.tone} ${dim}`}
    >
      {initials}
    </span>
  );
}

/** Native <dialog> wrapper: focus trap, Escape and backdrop come from the platform. */
export function Modal({
  open,
  onClose,
  labelledBy,
  children,
  className = "max-w-md",
  bare = false,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
  className?: string;
  bare?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      document.body.style.overflow = "hidden";
    } else if (!open && d.open) {
      d.close();
    }
    return () => {
      if (open) document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onClose={() => {
        document.body.style.overflow = "";
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={`m-auto w-[calc(100%-2rem)] ${className} ${
        bare ? "bg-transparent p-0" : "rounded-[24px] border border-line bg-white p-6 shadow-xl sm:p-7"
      } text-charcoal-deep backdrop:bg-charcoal-deep/60`}
    >
      {open && children}
    </dialog>
  );
}

export interface MenuItem {
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  danger?: boolean;
}

export function ActionMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex size-9 items-center justify-center rounded-lg text-slate transition-colors hover:bg-charcoal-deep/5 hover:text-charcoal-deep ${focus}`}
      >
        <MoreHorizontal size={18} aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-52 rounded-xl border border-line bg-white p-1 shadow-lg"
        >
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-charcoal-deep/5 ${focus} ${
                it.danger ? "text-red-700" : "text-charcoal-deep"
              }`}
            >
              <span aria-hidden className="shrink-0">{it.icon}</span>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[22px] border border-dashed border-line bg-white px-6 py-12 text-center">
      <h3 className="text-lg font-semibold text-charcoal-deep">{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate">{text}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function CharCounter({ value, max }: { value: number; max: number }) {
  const near = value > max * 0.9;
  return (
    <span
      className={`text-xs tabular-nums ${value > max ? "font-semibold text-red-700" : near ? "text-bless-deep" : "text-slate"}`}
      aria-live="polite"
    >
      {value}/{max}
    </span>
  );
}
