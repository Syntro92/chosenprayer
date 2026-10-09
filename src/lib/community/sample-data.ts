/**
 * DEMO DATA ONLY. Every name, post, comment and notification below is
 * fictional and exists to preview the design. Replace with API responses.
 */
import type { Attachment, Comment, Member, Notification, Post } from "./types";

export const DEMO_USER: Member = {
  id: "u-demo",
  name: "Demo Member",
  username: "demo_member",
  bio: "This is the demo account used to preview the signed-in experience.",
  joined: "Demo",
  tone: "bg-cream",
};

export const SAMPLE_MEMBERS: Member[] = [
  {
    id: "u-nimali",
    name: "Nimali Perera",
    username: "nimali_p",
    bio: "Sketching, painting and sharing small things that make me smile. (Fictional sample profile.)",
    joined: "March 2025",
    tone: "bg-bless/40",
  },
  {
    id: "u-creative",
    name: "Creative Corner",
    username: "creativecorner",
    bio: "Guides and ideas for anyone starting a creative project. (Fictional sample profile.)",
    joined: "January 2025",
    tone: "bg-mist",
  },
  {
    id: "u-guiding",
    name: "The Guiding Light",
    username: "theguidinglight",
    bio: "Encouragement and reflections, shared daily. (Fictional sample profile.)",
    joined: "November 2024",
    tone: "bg-sage/30",
  },
  {
    id: "u-kasun",
    name: "Kasun Fernando",
    username: "kasun_f",
    bio: "Learning to give a little more each week. (Fictional sample profile.)",
    joined: "June 2025",
    tone: "bg-cream",
  },
  {
    id: "u-anjali",
    name: "Anjali Rao",
    username: "anjali_r",
    bio: "New here, glad to be. (Fictional sample profile.)",
    joined: "August 2025",
    tone: "bg-line",
  },
  DEMO_USER,
];

/** Inline SVG artwork so the demo needs no image hosting. */
function artwork(seed: number): string {
  const palettes = [
    ["#FFF6D6", "#FFBE00", "#171918"],
    ["#EEF3F1", "#7E9B83", "#171918"],
    ["#FFF6D6", "#E6A900", "#66706D"],
    ["#F7F8F6", "#7E9B83", "#FFBE00"],
  ];
  const [bg, a, b] = palettes[seed % palettes.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="${bg}"/><circle cx="${560 - seed * 30}" cy="190" r="86" fill="${a}"/><path d="M0 430c110-70 220-70 330 0s230 70 470-20V600H0Z" fill="${a}" opacity=".35"/><path d="M0 470c130-60 250-60 380 0s250 50 420-10" fill="none" stroke="${b}" stroke-width="5" stroke-linecap="round"/><path d="M0 520c150-50 280-50 410 0s260 40 390-5" fill="none" stroke="${b}" stroke-width="3" stroke-linecap="round" opacity=".6"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const img = (id: string, name: string, seed: number, alt: string, size: number): Attachment => ({
  id,
  kind: "image",
  name,
  size,
  mime: "image/svg+xml",
  src: artwork(seed),
  alt,
});

export const SAMPLE_POSTS: Post[] = [
  {
    id: "p1",
    authorId: "u-nimali",
    text: "Sharing a little artwork I made today. Hope it brings a smile to someone here.",
    attachments: [img("a1", "sunrise-sketch.png", 0, "A soft yellow sun rising over layered hills", 412_000)],
    ageMinutes: 15,
    baseLikes: 24,
  },
  {
    id: "p2",
    authorId: "u-creative",
    text: "Here is a short guide I put together for anyone starting a creative project.",
    attachments: [
      {
        id: "a2",
        kind: "file",
        name: "starting-a-creative-project.pdf",
        size: 1_240_000,
        mime: "application/pdf",
      },
    ],
    ageMinutes: 125,
    baseLikes: 41,
  },
  {
    id: "p3",
    authorId: "u-guiding",
    text: "Small acts of encouragement can make someone's whole day better. What is one kind thing someone did for you recently?",
    attachments: [],
    ageMinutes: 300,
    baseLikes: 58,
  },
  {
    id: "p4",
    authorId: "u-kasun",
    text: "A few weeks ago I decided to try something small: each Friday I write a thank-you note to someone whose work helped me that week. A teacher, a writer, a stranger who made a video that explained something I'd been stuck on. I didn't expect much. But the replies I've received have been some of the warmest messages I've ever got. People rarely hear that their work mattered. If you've been meaning to say thank you to someone, consider this your nudge. It takes two minutes, and it can change how someone feels about their whole week.",
    attachments: [],
    ageMinutes: 1560,
    baseLikes: 73,
  },
  {
    id: "p5",
    authorId: "u-demo",
    text: "Our little garden finally bloomed. Posting these in case anyone needs a calm moment today.",
    attachments: [
      img("a5", "garden-morning.jpg", 1, "Green hills under a pale morning sky", 530_000),
      img("a6", "garden-evening.jpg", 3, "A golden evening over soft green hills", 498_000),
    ],
    ageMinutes: 2900,
    baseLikes: 12,
  },
];

export const SAMPLE_COMMENTS: Comment[] = [
  { id: "c1", postId: "p1", authorId: "u-kasun", text: "This made my morning. The colours are lovely.", ageMinutes: 9, baseLikes: 3 },
  { id: "c2", postId: "p3", authorId: "u-anjali", text: "A stranger held a door and asked how my day was going. It sounds tiny, but I needed it.", ageMinutes: 240, baseLikes: 6 },
  { id: "c3", postId: "p3", authorId: "u-nimali", text: "So glad you shared that. 💛", ageMinutes: 220, parentId: "c2", baseLikes: 2 },
  { id: "c4", postId: "p3", authorId: "u-demo", text: "My neighbour left soup at my door when I was unwell. I still think about it.", ageMinutes: 180, baseLikes: 4 },
  { id: "c5", postId: "p3", authorId: "u-kasun", text: "Someone replied to my note this week and it was the nicest surprise.", ageMinutes: 90, baseLikes: 1 },
  { id: "c6", postId: "p5", authorId: "u-nimali", text: "Beautiful. Thank you for sharing these.", ageMinutes: 2800, baseLikes: 2 },
  { id: "c7", postId: "p2", authorId: "u-anjali", text: "Exactly what I needed to get started. Thank you!", ageMinutes: 60, baseLikes: 1 },
];

export const SAMPLE_NOTIFICATIONS: Notification[] = [
  { id: "n1", text: "Nimali Perera commented on your post", ageMinutes: 2800, href: "/community/posts/p5" },
  { id: "n2", text: "Kasun Fernando replied to your comment", ageMinutes: 95, href: "/community/posts/p3" },
  { id: "n3", text: "Anjali Rao appreciated your post", ageMinutes: 1200, href: "/community/posts/p5" },
];
