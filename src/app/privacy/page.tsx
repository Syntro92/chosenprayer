import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy | Chosen Prayer",
  description: "How Chosen Prayer collects, uses and protects your information.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="October 2026"
      intro="Chosen Prayer helps you discover channels and support them voluntarily. We collect only what we need to run the service."
      sections={[
        {
          title: "What we collect",
          body: (
            <>
              <p>Account details such as your name, email and profile information when you sign up.</p>
              <p>Content you choose to share, such as community posts, comments and blessing messages.</p>
              <p>Basic usage data, such as pages visited, to understand how the site is used and keep it healthy.</p>
            </>
          ),
        },
        {
          title: "Payments",
          body: (
            <p>
              Payments are handled by Stripe. We never see or store your full card details. We keep a record of the
              donation (amount, channel, date and receipt) so you can view your giving history.
            </p>
          ),
        },
        {
          title: "How we use your information",
          body: (
            <p>
              To provide and secure the service, process donations, send receipts and account emails, moderate
              community content and improve the site. We do not sell your personal information.
            </p>
          ),
        },
        {
          title: "Sharing",
          body: (
            <p>
              We share data only with service providers that help us operate (such as payments, hosting and email), or
              when required by law. Anonymous blessings are shown publicly without your name.
            </p>
          ),
        },
        {
          title: "Your choices",
          body: (
            <p>
              You can update your profile, delete your content, or ask us to delete your account and data at any time by
              contacting us.
            </p>
          ),
        },
        {
          title: "Contact",
          body: <p>Questions about this policy? Get in touch through the contact details on this site.</p>,
        },
      ]}
    />
  );
}
