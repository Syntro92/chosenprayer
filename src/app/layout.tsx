import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AnalyticsBeacon } from "@/components/analytics-beacon";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { PageTranslator } from "@/components/page-translator";
import { getActor } from "@/server/auth/session";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Chosen Prayer",
  description: "Discover meaningful channels, connect with the work you value, and give something back.",
};

/** Reads the session per request, so it lives behind Suspense and the rest of the shell stays static. */
async function SessionHeader() {
  const actor = await getActor();
  return <Header session={actor ? { displayName: actor.displayName, username: actor.username } : null} />;
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Suspense fallback={<Header session={undefined} />}>
          <SessionHeader />
        </Suspense>
        {children}
        <Footer />
        <PageTranslator />
        <Suspense fallback={null}>
          <AnalyticsBeacon />
        </Suspense>
      </body>
    </html>
  );
}
