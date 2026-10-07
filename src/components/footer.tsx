import Link from "next/link";
import { FooterLanguage } from "./footer-language";
import { FooterYear } from "./footer-year";

const focus =
  "rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-charcoal-deep focus-visible:ring-offset-2";
const link = `text-sm text-slate transition-colors hover:text-charcoal-deep ${focus}`;

const COLUMNS = [
  {
    title: "Explore",
    links: [
      { label: "Channels", href: "/channels" },
      { label: "How It Works", href: "/how-it-works" },
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "For creators",
    links: [
      { label: "Start a Channel", href: "/start" },
      { label: "Sign In", href: "/signin" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-16 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)] lg:px-10">
        <div>
          <Link
            href="/"
            className={`text-lg font-semibold tracking-tight text-charcoal-deep ${focus}`}
          >
            Chosen<span className="text-bless-deep"> Bless</span>
          </Link>
          <p className="mt-3 text-sm text-slate">Support what matters.</p>
          <FooterLanguage />
        </div>

        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-charcoal-deep">
              {col.title}
            </h3>
            <ul className="mt-4 space-y-3">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={link}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-slate sm:px-6 lg:px-10">
          © <FooterYear /> Chosen Bless
        </p>
      </div>
    </footer>
  );
}
