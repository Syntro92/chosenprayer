import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = {
  title: "Create Account | Chosen Prayer",
  description: "Create a Chosen Prayer account and join the community.",
};

export default function Page() {
  return <AuthForm mode="signup" />;
}
