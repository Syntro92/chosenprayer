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

const COOKIE = "googtrans";

function readCookie(): string {
  const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : "";
}

/** Google Translate reads this cookie on load; clearing it is the only reliable way back to English. */
function writeCookie(code: string) {
  const host = location.hostname;
  const expire = "expires=Thu, 01 Jan 1970 00:00:00 GMT";
  document.cookie = `${COOKIE}=; ${expire}; path=/`;
  document.cookie = `${COOKIE}=; ${expire}; path=/; domain=${host}`;
  document.cookie = `${COOKIE}=; ${expire}; path=/; domain=.${host}`;
  if (code !== "en") document.cookie = `${COOKIE}=/en/${code}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * Translates the page with Google Translate, driven by the header/footer language selector.
 * The cookie is the source of truth: when it differs from the chosen language we rewrite it and
 * reload once, so switching (including back to English) is always clean.
 */
export function PageTranslator() {
  const hookCode = useLanguage().code.toLowerCase();

  useEffect(() => {
    // On first mount the hook still reports the server default (EN), so read the saved choice directly.
    let code = hookCode;
    try {
      code = (localStorage.getItem("language") ?? "EN").toLowerCase();
    } catch {}
    const wanted = code === "en" ? "" : `/en/${code}`;
    if (readCookie() !== wanted) {
      writeCookie(code);
      location.reload();
      return;
    }
    if (code === "en" || document.getElementById("google-translate-script")) return;

    window.googleTranslateElementInit = () => {
      new window.google!.translate.TranslateElement(
        { pageLanguage: "en", autoDisplay: false },
        "google_translate_element",
      );
    };
    const s = document.createElement("script");
    s.id = "google-translate-script";
    s.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    s.async = true;
    document.body.appendChild(s);
  }, [hookCode]);

  return <div id="google_translate_element" className="hidden" translate="no" />;
}
