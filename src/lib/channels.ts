export const CATEGORIES = [
  "Inspiration",
  "Education",
  "Faith",
  "Community",
  "Creativity",
  "Wellness",
  "Music",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Cover treatments: a soft gradient plus one of the line-drawn scenes. */
export type CoverTone = "cream" | "mist" | "sage" | "stone";
export type CoverScene = "horizon" | "hills" | "sun" | "waves";

export type Channel = {
  handle: string; // without the leading "@"; also the profile route slug
  name: string;
  description: string;
  category: Category;
  followers: number;
  supporters: number;
  createdAt: string; // ISO date, used for "Newest"
  cover: { tone: CoverTone; scene: CoverScene };
  featured?: boolean;
  verified?: boolean;
};

// Placeholder data. Replace with a fetch from the API; the shape above is
// all the page depends on.
export const CHANNELS: Channel[] = [
  {
    handle: "noblesoul111",
    name: "Noble Soul",
    description: "Words that inspire, encourage and uplift people every day.",
    category: "Inspiration",
    followers: 22600,
    supporters: 1284,
    createdAt: "2024-03-12",
    cover: { tone: "cream", scene: "sun" },
    featured: true,
    verified: true,
  },
  {
    handle: "theguidinglight",
    name: "The Guiding Light",
    description: "Reflections for everyday life.",
    category: "Faith",
    followers: 18400,
    supporters: 892,
    createdAt: "2024-06-02",
    cover: { tone: "mist", scene: "hills" },
  },
  {
    handle: "createandinspire",
    name: "Create & Inspire",
    description: "Helping people create meaningful work.",
    category: "Creativity",
    followers: 9800,
    supporters: 621,
    createdAt: "2025-01-18",
    cover: { tone: "cream", scene: "horizon" },
  },
  {
    handle: "quietmornings",
    name: "Quiet Mornings",
    description: "Gentle practices for slower, kinder days.",
    category: "Wellness",
    followers: 7300,
    supporters: 402,
    createdAt: "2025-04-09",
    cover: { tone: "sage", scene: "waves" },
  },
  {
    handle: "lanternschool",
    name: "Lantern School",
    description: "Free lessons for curious minds, taught by volunteers.",
    category: "Education",
    followers: 14100,
    supporters: 977,
    createdAt: "2023-11-27",
    cover: { tone: "stone", scene: "horizon" },
  },
  {
    handle: "thelongtable",
    name: "The Long Table",
    description: "Stories and meals shared by neighbours near and far.",
    category: "Community",
    followers: 5600,
    supporters: 318,
    createdAt: "2025-07-21",
    cover: { tone: "cream", scene: "hills" },
  },
  {
    handle: "softstrings",
    name: "Soft Strings",
    description: "Acoustic songs written for quiet evenings.",
    category: "Music",
    followers: 11900,
    supporters: 745,
    createdAt: "2024-09-14",
    cover: { tone: "mist", scene: "waves" },
  },
  {
    handle: "everydaygrace",
    name: "Everyday Grace",
    description: "Short prayers and thoughts to carry through the day.",
    category: "Faith",
    followers: 16200,
    supporters: 830,
    createdAt: "2023-08-05",
    cover: { tone: "sage", scene: "sun" },
  },
  {
    handle: "paperandpine",
    name: "Paper & Pine",
    description: "Hand-lettering, illustration and the joy of making.",
    category: "Creativity",
    followers: 4200,
    supporters: 204,
    createdAt: "2025-09-30",
    cover: { tone: "stone", scene: "hills" },
  },
  {
    handle: "stillwaters",
    name: "Still Waters",
    description: "Breathing, rest and small rituals for hard seasons.",
    category: "Wellness",
    followers: 8900,
    supporters: 512,
    createdAt: "2024-12-03",
    cover: { tone: "mist", scene: "sun" },
  },
  {
    handle: "villagevoices",
    name: "Village Voices",
    description: "Local stories from the people who hold a town together.",
    category: "Community",
    followers: 3100,
    supporters: 167,
    createdAt: "2025-10-02",
    cover: { tone: "cream", scene: "waves" },
  },
  {
    handle: "brightnotes",
    name: "Bright Notes",
    description: "Little letters of encouragement, delivered daily.",
    category: "Inspiration",
    followers: 6700,
    supporters: 389,
    createdAt: "2025-05-16",
    cover: { tone: "sage", scene: "horizon" },
  },
];

const compact = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const full = new Intl.NumberFormat("en");

export const formatFollowers = (n: number) =>
  n >= 1000 ? compact.format(n) : full.format(n);
export const formatSupporters = (n: number) => full.format(n);

export const getChannel = (handle: string) =>
  CHANNELS.find((c) => c.handle === handle);

export type ContentKind = "Reflection" | "Video" | "Message" | "Story";

export type ChannelContent = {
  id: string;
  kind: ContentKind;
  title: string;
  excerpt: string;
  date: string; // ISO
  cover: { tone: CoverTone; scene: CoverScene };
  youtubeId?: string; // 11-character YouTube video id; renders a playable video card
};

export type Blessing = {
  id: string;
  name: string; // "Anonymous" when the supporter chose to stay private
  message: string;
  date: string; // ISO
  amount?: number; // only present if the supporter chose to show it
};

export type ChannelProfileData = {
  about: string[];
  mission: string;
  links: { label: string; href: string }[];
  content: ChannelContent[];
  blessings: Blessing[];
  blessingsCount: number;
};

// Placeholder profile data. Replace with a fetch from the API; owners supply
// the long description, mission and links, everything else is derived.
export function getProfileData(channel: Channel): ChannelProfileData {
  const { name, handle, description } = channel;
  return {
    about: [
      `${name} is a channel dedicated to sharing words, reflections and ideas that encourage people through everyday life.`,
      `${description} Nothing here is rushed or polished for the sake of it. It is made slowly, by one person who believes a small, honest thought can change the shape of someone's day.`,
    ],
    mission:
      "To make something worth returning to: a calm, honest place that leaves people a little more hopeful than it found them.",
    links: [
      { label: "Website", href: `https://example.com/${handle}` },
      { label: "YouTube", href: `https://youtube.com/@${handle}` },
      { label: "Instagram", href: `https://instagram.com/${handle}` },
      { label: "Facebook", href: `https://facebook.com/${handle}` },
    ],
    content: [
      {
        id: "c1",
        kind: "Reflection",
        title: "When you need a little hope",
        excerpt: "A short note for the mornings when everything feels heavy.",
        date: "2026-09-28",
        cover: { tone: "cream", scene: "sun" },
      },
      {
        id: "c2",
        kind: "Video",
        title: "Keep going, even when it feels slow",
        excerpt: "Six quiet minutes on progress that nobody else can see.",
        date: "2026-09-14",
        cover: { tone: "sage", scene: "hills" },
        youtubeId: "iCvmsMzlF7o", // placeholder: replace with the channel's own video
      },
      {
        id: "c3",
        kind: "Message",
        title: "Something worth remembering today",
        excerpt: "One sentence to carry with you, and why it matters.",
        date: "2026-08-30",
        cover: { tone: "mist", scene: "waves" },
      },
    ],
    blessings: [
      {
        id: "b1",
        name: "Sarah",
        message: "Your words reached me at exactly the right time. Thank you.",
        date: "2026-09-30",
        amount: 25,
      },
      {
        id: "b2",
        name: "Anonymous",
        message: "Keep going. What you're creating matters.",
        date: "2026-09-22",
      },
      {
        id: "b3",
        name: "Daniel",
        message: "This channel has helped me through some difficult days.",
        date: "2026-09-05",
      },
    ],
    blessingsCount: Math.round(channel.supporters * 2.96),
  };
}

export const formatDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
