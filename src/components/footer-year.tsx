"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// Read on the client only: `new Date()` can't be prerendered, and the year
// is stable enough that the empty server snapshot is never noticed.
export function FooterYear() {
  const year = useSyncExternalStore(
    subscribe,
    () => String(new Date().getFullYear()),
    () => "",
  );
  return <>{year}</>;
}
