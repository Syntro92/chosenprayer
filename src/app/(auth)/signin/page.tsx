import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { safeNext } from "@/lib/safe-redirect";
import { getActor } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Sign In | Chosen Prayer",
  description: "Sign in to your Chosen Prayer account.",
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function SignIn({ searchParams }: { searchParams: PageProps<"/signin">["searchParams"] }) {
  const sp = await searchParams;
  const next = safeNext(first(sp.next));
  if (await getActor()) redirect(next);
  const notice = first(sp.error) === "link" ? "That link has expired or was already used. Sign in, or request a new link." : undefined;
  return <AuthForm mode="signin" next={next} notice={notice} />;
}

export default function Page(props: PageProps<"/signin">) {
  return (
    <Suspense fallback={<AuthForm mode="signin" />}>
      <SignIn searchParams={props.searchParams} />
    </Suspense>
  );
}
