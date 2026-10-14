"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Reports each page view to /api/track (first-party, anonymous). Silent on failure and skipped
 * when the browser says Do Not Track / Global Privacy Control.
 */
export function AnalyticsBeacon() {
  const pathname = usePathname();
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (last.current === pathname) return; // dev double-effects, re-renders
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (nav.doNotTrack === "1" || nav.globalPrivacyControl) return;
    const first = last.current === null;
    last.current = pathname;
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: pathname, referrer: first ? document.referrer : undefined }),
      keepalive: true,
    }).catch(() => {});
  }, [pathname]);

  return null;
}
