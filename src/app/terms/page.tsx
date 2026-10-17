import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Terms | Chosen Prayer",
  description: "The terms for using Chosen Prayer.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Use"
      updated="October 2026"
      intro="By using Chosen Prayer you agree to these terms. Please read them; they are short and simple."
      sections={[
        {
          title: "Using the service",
          body: (
            <p>
              You must be old enough to enter into a binding agreement where you live, give accurate information, and
              keep your account secure. You are responsible for activity on your account.
            </p>
          ),
        },
        {
          title: "Donations",
          body: (
            <p>
              Giving is voluntary and goes to the channel you choose. Donations are processed by Stripe. You can
              request a refund within 7 days of a gift, from your account page or the link in your receipt email;
              it is returned to the original payment method. Chosen Prayer does not guarantee how a channel uses
              funds.
            </p>
          ),
        },
        {
          title: "Community conduct",
          body: (
            <p>
              Be respectful. Do not post anything unlawful, hateful, harassing, misleading or spam. We may remove
              content or suspend accounts that break these rules.
            </p>
          ),
        },
        {
          title: "Your content",
          body: (
            <p>
              You keep ownership of what you post. You give us permission to display it on the service so it can work as
              intended.
            </p>
          ),
        },
        {
          title: "Liability",
          body: (
            <p>
              The service is provided as is. To the extent permitted by law, we are not liable for indirect or
              consequential losses arising from your use of it.
            </p>
          ),
        },
        {
          title: "Changes",
          body: <p>We may update these terms from time to time. Continued use means you accept the updated terms.</p>,
        },
      ]}
    />
  );
}
