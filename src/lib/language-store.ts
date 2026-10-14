"use client";

import { useSyncExternalStore } from "react";
import { LANGUAGES } from "@/lib/languages";

export type Language = (typeof LANGUAGES)[number];

const KEY = "language";
const listeners = new Set<() => void>();
let current: Language = LANGUAGES[0];

function read(): Language {
  try {
    const code = localStorage.getItem(KEY);
    return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
  } catch {
    return LANGUAGES[0];
  }
}

function subscribe(cb: () => void) {
  current = read();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function setLanguage(lang: Language) {
  current = lang;
  try {
    localStorage.setItem(KEY, lang.code);
  } catch {}
  listeners.forEach((l) => l());
}

export function useLanguage(): Language {
  return useSyncExternalStore(subscribe, () => current, () => LANGUAGES[0]);
}
