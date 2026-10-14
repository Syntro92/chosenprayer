"use client";

import { useEffect } from "react";
import { useLanguage } from "@/lib/language-store";

declare global {
  interface Window {
    googleTranslateElementInit?: () => void;
    google?: {
      translate: {
        TranslateElement: new (
          opts: { pageLanguage: string; autoDisplay: boolean },
          id: string,
        ) => unknown;
      };
    };
  }
}

function applyLanguage(code: string) {
  const combo = document.querySelector<HTMLSelectElement>(".goog-te-combo");
  if (!combo) return false;
  combo.value = code === "en" ? "" : code;
  combo.dispatchEvent(new Event("change"));
  return true;
}

/** Translates the page with Google Translate, driven by the footer/header language selector. */
export function PageTranslator() {
  const lang = useLanguage();
  const code = lang.code.toLowerCase();

  useEffect(() => {
    if (code === "en" && !document.cookie.includes("googtrans=")) return;

    if (applyLanguage(code)) return;
    if (document.getElementById("google-translate-script")) return;

    window.googleTranslateElementInit = () => {
      new window.google!.translate.TranslateElement(
        { pageLanguage: "en", autoDisplay: false },
        "google_translate_element",
      );
      const t = setInterval(() => {
        if (applyLanguage(code)) clearInterval(t);
      }, 100);
      setTimeout(() => clearInterval(t), 5000);
    };
    const s = document.createElement("script");
    s.id = "google-translate-script";
    s.src =
      "//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    s.async = true;
    document.body.appendChild(s);
  }, [code]);

  return <div id="google_translate_element" className="hidden" translate="no" />;
}
