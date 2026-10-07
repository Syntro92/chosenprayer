"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LANGUAGES } from "@/lib/languages";

const NAV = [
  { label: "Home", href: "/" },
  { label: "Channels", href: "/channels" },
  { label: "How It Works", href: "/how-it-works" },
  { label: "About", href: "/about" },
];

const focus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-800 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent";

function LanguageSelector() {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState(LANGUAGES[0]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select language"
        onClick={() => setOpen((o) => !o)}
        className={`flex h-10 items-center gap-1.5 rounded-xl border border-neutral-900/10 bg-white/50 px-3 text-sm font-medium text-neutral-800 backdrop-blur transition-colors hover:bg-white/80 ${focus}`}
      >
        {lang.code}
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden
          className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <path
            d="M2.5 4.5 6 8l3.5-3.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <ul
        role="listbox"
        aria-label="Language"
        className={`absolute right-0 top-full z-50 mt-2 w-40 origin-top-right rounded-xl border border-neutral-900/10 bg-white/90 p-1 shadow-lg backdrop-blur transition duration-150 ${
          open
            ? "scale-100 opacity-100"
            : "pointer-events-none scale-95 opacity-0"
        }`}
      >
        {LANGUAGES.map((l) => (
          <li key={l.code} role="option" aria-selected={l.code === lang.code}>
            <button
              type="button"
              tabIndex={open ? 0 : -1}
              onClick={() => {
                setLang(l);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-neutral-800 transition-colors hover:bg-neutral-900/5 ${focus} ${
                l.code === lang.code ? "font-semibold" : ""
              }`}
            >
              {l.label}
              {l.code === lang.code && (
                <span className="size-1.5 rounded-full bg-amber-400" />
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const active =
    NAV.find((n) =>
      n.href === "/" ? pathname === "/" : pathname.startsWith(n.href),
    )?.href ?? "";

  const linkClass = (href: string) =>
    `rounded-xl px-3 py-2 text-sm font-medium transition-colors ${focus} ${
      active === href
        ? "bg-neutral-900/5 text-neutral-900"
        : "text-neutral-600 hover:bg-neutral-900/5 hover:text-neutral-900"
    }`;

  return (
    <header className="absolute inset-x-0 top-0 z-50">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
        <Link
          href="/"
          aria-label="Chosen Bless home"
          className={`rounded-xl text-lg font-semibold tracking-tight text-neutral-900 ${focus}`}
        >
          Chosen<span className="text-amber-500"> Bless</span>
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active === n.href ? "page" : undefined}
              className={linkClass(n.href)}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 lg:gap-3">
          <LanguageSelector />
          <Link
            href="/signin"
            className={`hidden rounded-xl px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-900/5 hover:text-neutral-900 md:block ${focus}`}
          >
            Sign In
          </Link>
          <Link
            href="/channels"
            className={`hidden h-10 items-center rounded-xl bg-amber-400 px-4 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-amber-300 active:scale-[0.98] md:inline-flex ${focus}`}
          >
            Explore Channels
          </Link>
          <button
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((o) => !o)}
            className={`flex size-10 items-center justify-center rounded-xl border border-neutral-900/10 bg-white/50 text-neutral-800 backdrop-blur transition-colors hover:bg-white/80 md:hidden ${focus}`}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
              {menuOpen ? (
                <path d="m4 4 10 10M14 4 4 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              ) : (
                <path d="M3 5h12M3 9h12M3 13h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      <div
        id="mobile-menu"
        className={`mx-4 origin-top rounded-2xl border border-neutral-900/10 bg-white/90 p-3 shadow-lg backdrop-blur transition duration-200 sm:mx-6 md:hidden ${
          menuOpen
            ? "scale-100 opacity-100"
            : "pointer-events-none scale-95 opacity-0"
        }`}
        aria-hidden={!menuOpen}
      >
        <nav aria-label="Mobile" className="flex flex-col gap-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              tabIndex={menuOpen ? 0 : -1}
              onClick={() => {
                setMenuOpen(false);
              }}
              className={`${linkClass(n.href)} py-3 text-base`}
            >
              {n.label}
            </Link>
          ))}
          <Link
            href="/signin"
            tabIndex={menuOpen ? 0 : -1}
            onClick={() => setMenuOpen(false)}
            className={`rounded-xl px-3 py-3 text-base font-medium text-neutral-700 transition-colors hover:bg-neutral-900/5 ${focus}`}
          >
            Sign In
          </Link>
          <Link
            href="/channels"
            tabIndex={menuOpen ? 0 : -1}
            onClick={() => setMenuOpen(false)}
            className={`mt-1 flex h-12 items-center justify-center rounded-xl bg-amber-400 text-base font-semibold text-neutral-900 transition hover:bg-amber-300 ${focus}`}
          >
            Explore Channels
          </Link>
        </nav>
      </div>
    </header>
  );
}
