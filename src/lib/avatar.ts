import type { AvatarTone } from "@/lib/schemas/accounts";

/** Full class names (not built dynamically) so Tailwind can see them. */
export const TONE_CLASS: Record<AvatarTone, string> = {
  cream: "bg-cream",
  bless: "bg-bless/40",
  mist: "bg-mist",
  sage: "bg-sage/30",
  line: "bg-line",
};
