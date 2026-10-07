"use client";

import { useEffect, useRef, useState } from "react";
import { LANGUAGES } from "@/lib/languages";

const focus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-charcoal-deep focus-visible:ring-offset-2";

/** Language dropdown for the footer. Opens upwards so it never runs off the page. */
export function FooterLanguage() {
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
    <div ref={ref} className="relative mt-6 inline-block">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select language"
        onClick={() => setOpen((o) => !o)}
        className={`flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-3 text-sm font-medium text-charcoal-deep transition-colors hover:border-charcoal-deep/30 ${focus}`}
      >
        {lang.code}
        <span className="text-slate">{lang.label}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden
          className={`text-slate transition-transform ${open ? "rotate-180" : ""}`}
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
        className={`absolute bottom-full left-0 z-20 mb-2 w-48 origin-bottom-left rounded-xl border border-line bg-white p-1 shadow-lg transition duration-150 ${
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
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-mist ${focus} ${
                l.code === lang.code
                  ? "font-semibold text-charcoal-deep"
                  : "text-slate"
              }`}
            >
              {l.label}
              {l.code === lang.code && (
                <span className="size-1.5 rounded-full bg-bless" aria-hidden />
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
