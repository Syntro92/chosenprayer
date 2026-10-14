import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { safeNext } from "@/lib/safe-redirect";
import { getActor } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Create Account | Chosen Prayer",
  description: "Create your Chosen Prayer account.",
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function SignUp({ searchParams }: { searchParams: PageProps<"/signup">["searchParams"] }) {
  const sp = await searchParams;
  const next = safeNext(first(sp.next));
  if (await getActor()) redirect(next);
  return <AuthForm mode="signup" next={next} />;
}

export default function Page(props: PageProps<"/signup">) {
  return (
    <Suspense fallback={<AuthForm mode="signup" />}>
      <SignUp searchParams={props.searchParams} />
    </Suspense>
  );
}
