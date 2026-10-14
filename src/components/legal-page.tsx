import type { ReactNode } from "react";

export type LegalSection = { title: string; body: ReactNode };

export function LegalPage({
  title,
  updated,
  intro,
  sections,
}: {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}) {
  return (
    <main className="bg-white pb-24 pt-32 sm:pb-32 sm:pt-40">
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
        <h1 className="text-4xl font-semibold tracking-tight text-charcoal-deep sm:text-5xl">{title}</h1>
        <p className="mt-3 text-sm text-slate">Last updated {updated}</p>
        <p className="mt-8 text-base leading-relaxed text-slate sm:text-lg">{intro}</p>
        {sections.map((s) => (
          <section key={s.title} className="mt-10">
            <h2 className="text-xl font-semibold text-charcoal-deep">{s.title}</h2>
            <div className="mt-3 space-y-3 text-base leading-relaxed text-slate">{s.body}</div>
          </section>
        ))}
      </div>
    </main>
  );
}
