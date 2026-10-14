/**
 * DEMO channels: the placeholder data the site was designed with (it used to live in
 * src/lib/channels.ts). Loaded by `npm run db:seed:demo`, removed by
 * `npm run db:seed:demo -- --remove`. Everything here is fictional.
 *
 * Follower/supporter numbers are written directly so the directory looks populated.
 * They are not backed by real follows or donations; real activity recalculates them.
 */

export const DEMO_CHANNELS = [
  { handle: "noblesoul111", name: "Noble Soul", description: "Words that inspire, encourage and uplift people every day.", category: "inspiration", followers: 22600, supporters: 1284, createdAt: "2024-03-12", tone: "cream", scene: "sun", featured: true, verified: true },
  { handle: "theguidinglight", name: "The Guiding Light", description: "Reflections for everyday life.", category: "faith", followers: 18400, supporters: 892, createdAt: "2024-06-02", tone: "mist", scene: "hills" },
  { handle: "createandinspire", name: "Create & Inspire", description: "Helping people create meaningful work.", category: "creativity", followers: 9800, supporters: 621, createdAt: "2025-01-18", tone: "cream", scene: "horizon" },
  { handle: "quietmornings", name: "Quiet Mornings", description: "Gentle practices for slower, kinder days.", category: "wellness", followers: 7300, supporters: 402, createdAt: "2025-04-09", tone: "sage", scene: "waves" },
  { handle: "lanternschool", name: "Lantern School", description: "Free lessons for curious minds, taught by volunteers.", category: "education", followers: 14100, supporters: 977, createdAt: "2023-11-27", tone: "stone", scene: "horizon" },
  { handle: "thelongtable", name: "The Long Table", description: "Stories and meals shared by neighbours near and far.", category: "community", followers: 5600, supporters: 318, createdAt: "2025-07-21", tone: "cream", scene: "hills" },
  { handle: "softstrings", name: "Soft Strings", description: "Acoustic songs written for quiet evenings.", category: "music", followers: 11900, supporters: 745, createdAt: "2024-09-14", tone: "mist", scene: "waves" },
  { handle: "everydaygrace", name: "Everyday Grace", description: "Short prayers and thoughts to carry through the day.", category: "faith", followers: 16200, supporters: 830, createdAt: "2023-08-05", tone: "sage", scene: "sun" },
  { handle: "paperandpine", name: "Paper & Pine", description: "Hand-lettering, illustration and the joy of making.", category: "creativity", followers: 4200, supporters: 204, createdAt: "2025-09-30", tone: "stone", scene: "hills" },
  { handle: "stillwaters", name: "Still Waters", description: "Breathing, rest and small rituals for hard seasons.", category: "wellness", followers: 8900, supporters: 512, createdAt: "2024-12-03", tone: "mist", scene: "sun" },
  { handle: "villagevoices", name: "Village Voices", description: "Local stories from the people who hold a town together.", category: "community", followers: 3100, supporters: 167, createdAt: "2025-10-02", tone: "cream", scene: "waves" },
  { handle: "brightnotes", name: "Bright Notes", description: "Little letters of encouragement, delivered daily.", category: "inspiration", followers: 6700, supporters: 389, createdAt: "2025-05-16", tone: "sage", scene: "horizon" },
];

/** Long-form profile content generated per channel, as the old mock did. */
export function demoProfile(c) {
  return {
    about: [
      `${c.name} is a channel dedicated to sharing words, reflections and ideas that encourage people through everyday life.`,
      `${c.description} Nothing here is rushed or polished for the sake of it. It is made slowly, by one person who believes a small, honest thought can change the shape of someone's day.`,
    ],
    mission:
      "To make something worth returning to: a calm, honest place that leaves people a little more hopeful than it found them.",
    links: [
      { label: "Website", href: `https://example.com/${c.handle}` },
      { label: "YouTube", href: `https://youtube.com/@${c.handle}` },
      { label: "Instagram", href: `https://instagram.com/${c.handle}` },
      { label: "Facebook", href: `https://facebook.com/${c.handle}` },
    ],
    content: [
      { kind: "reflection", title: "When you need a little hope", excerpt: "A short note for the mornings when everything feels heavy.", publishedAt: "2026-09-28", tone: "cream", scene: "sun" },
      { kind: "video", title: "Keep going, even when it feels slow", excerpt: "Six quiet minutes on progress that nobody else can see.", publishedAt: "2026-09-14", tone: "sage", scene: "hills", youtubeId: "iCvmsMzlF7o" },
      { kind: "message", title: "Something worth remembering today", excerpt: "One sentence to carry with you, and why it matters.", publishedAt: "2026-08-30", tone: "mist", scene: "waves" },
    ],
  };
}
