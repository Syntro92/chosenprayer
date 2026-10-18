import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Contact | Chosen Prayer",
  description: "Questions, feedback, payment support or refund requests? Get in touch with Chosen Prayer.",
};

const EMAIL = "contact@chosenprayer.com";

const TOPICS = [
  "General inquiries",
  "Payment & billing support",
  "Refund requests",
  "Privacy & data requests",
  "Copyright & content inquiries",
  "Business & partnership inquiries",
];

const PAYMENT_DETAILS = [
  "Your name",
  "Email address used during payment",
  "Transaction date",
  "Payment amount",
  "Transaction reference, if available",
];

const eyebrow = "text-xs font-semibold uppercase tracking-[0.2em] text-bless-deep";
const h2 = "text-2xl font-semibold tracking-tight text-charcoal-deep sm:text-3xl";
const card = "rounded-[22px] border border-line bg-white p-7 sm:p-8";
const list = "mt-4 list-disc space-y-1.5 pl-5 text-base leading-relaxed text-slate";
const focus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-charcoal-deep focus-visible:ring-offset-2";

export default function ContactPage() {
  return (
    <main className="bg-ivory pb-24 pt-32 sm:pb-32 sm:pt-44">
      <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-10">
        <span className={eyebrow}>Contact us</span>
        <h1 className="mt-5 text-4xl font-semibold leading-[1.08] tracking-tight text-charcoal-deep sm:text-6xl">
          We&apos;d love to hear from you.
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate sm:text-xl">
          We welcome your questions, feedback, suggestions and inquiries. Whether it&apos;s about our content, a payment,
          or something else, our team is here to help.
        </p>

        <div className="mt-10 rounded-[22px] bg-charcoal-deep p-7 text-white sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bless">Email us</p>
          <a
            href={`mailto:${EMAIL}`}
            className={`mt-3 block break-all text-2xl font-semibold underline-offset-4 hover:underline sm:text-3xl ${focus} focus-visible:ring-white focus-visible:ring-offset-charcoal-deep`}
          >
            {EMAIL}
          </a>
          <p className="mt-4 text-sm leading-relaxed text-white/75 sm:text-base">
            One address for everything below. We aim to respond to general inquiries within 2–3 business days.
          </p>
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <section className={card}>
            <h2 className={h2}>What we can help with</h2>
            <ul className={list}>
              {TOPICS.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </section>

          <section className={card}>
            <h2 className={h2}>Payment support</h2>
            <p className="mt-4 text-base leading-relaxed text-slate">
              For questions about a contribution, include the following for faster help:
            </p>
            <ul className={list}>
              {PAYMENT_DETAILS.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
            <p className="mt-4 text-sm leading-relaxed text-slate">
              Please do not email credit card numbers, security codes, passwords or other sensitive payment credentials.
            </p>
          </section>
        </div>

        <section className={`${card} mt-5`}>
          <h2 className={h2}>Refund requests</h2>
          <p className="mt-4 text-base leading-relaxed text-slate">
            You may request a full refund within 7 calendar days of your original payment date, without giving a reason.
            Email us the details above and we will generally review your request within 3 business days. Full terms are
            in our{" "}
            <Link href="/terms" className="font-medium text-charcoal-deep underline underline-offset-2">
              Terms and Conditions
            </Link>
            .
          </p>
        </section>

        <section className={`${card} mt-5`}>
          <h2 className={h2}>Business information</h2>
          <dl className="mt-4 grid gap-x-8 gap-y-3 text-base sm:grid-cols-[auto_1fr]">
            <dt className="font-medium text-charcoal-deep">Brand</dt>
            <dd className="text-slate">Chosen Prayer</dd>
            <dt className="font-medium text-charcoal-deep">Website</dt>
            <dd className="text-slate">chosenprayer.com</dd>
            <dt className="font-medium text-charcoal-deep">Business operator</dt>
            <dd className="text-slate">SYNTRO SOLUTIONS LLC</dd>
            <dt className="font-medium text-charcoal-deep">Related website</dt>
            <dd className="text-slate">syntrosolution.com</dd>
          </dl>
        </section>

        <p className="mt-10 max-w-2xl text-base leading-relaxed text-slate">
          Thank you for connecting with us. Our mission is to keep sharing messages of faith, hope, encouragement and
          inspiration with people around the world.
        </p>
      </div>
    </main>
  );
}
