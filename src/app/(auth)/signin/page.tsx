import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = {
  title: "Sign In | Chosen Prayer",
  description: "Sign in to your Chosen Prayer account.",
};

export default function Page() {
  return <AuthForm mode="signin" />;
}
