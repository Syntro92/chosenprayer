import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy | Chosen Prayer",
  description: "How Chosen Prayer collects, uses and protects your information.",
};

const list = "list-disc space-y-1 pl-5";
const EMAIL = "contact@chosenprayer.com";

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="October 19, 2026"
      intro="Your privacy is important to us. This policy explains how Chosen Prayer (“we”, “our” or “us”), operated by SYNTRO SOLUTIONS LLC, collects, uses, processes and protects personal information when you visit chosenprayer.com or use our content and services."
      sections={[
        {
          title: "Information we collect",
          body: (
            <>
              <p>
                When you create an account, contact us, post in the community or make a contribution, we may collect:
              </p>
              <ul className={list}>
                <li>Name, email address and profile or contact information</li>
                <li>Messages, inquiries and content you choose to share, such as community posts and comments</li>
                <li>Payment transaction references, contribution amounts and payment status</li>
              </ul>
              <p>We only request information reasonably necessary for the relevant service or interaction.</p>
              <p>
                Our hosting, security or analytics providers may also collect technical information such as IP address,
                browser type and version, device type, operating system, pages visited, website interactions, referring
                website and access times. This is used for website functionality, security, performance monitoring and
                analytics where enabled.
              </p>
            </>
          ),
        },
        {
          title: "How we use your information",
          body: (
            <>
              <p>We may use collected information to:</p>
              <ul className={list}>
                <li>Operate and maintain our website and manage your account</li>
                <li>Deliver and improve digital content</li>
                <li>Respond to visitor inquiries</li>
                <li>Process voluntary contributions, send confirmations and provide support</li>
                <li>Maintain transaction records</li>
                <li>Moderate community content</li>
                <li>Detect fraudulent or unauthorized activity</li>
                <li>Improve website performance and security</li>
                <li>Comply with applicable legal obligations</li>
              </ul>
              <p>Where required by law, we rely on an appropriate legal basis for processing personal information.</p>
            </>
          ),
        },
        {
          title: "Payment processing",
          body: (
            <>
              <p>
                Chosen Prayer may accept voluntary financial contributions. Payments are processed through Stripe, a
                third-party payment service provider. You may be redirected to a secure Stripe-hosted checkout page or
                use a Stripe-powered payment form.
              </p>
              <p>
                Stripe may collect and process payment information, including card details, billing information and
                transaction data, according to its own privacy practices (see{" "}
                <a
                  href="https://stripe.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-charcoal-deep underline underline-offset-2"
                >
                  stripe.com/privacy
                </a>
                ). We do not intentionally store complete payment card numbers or card security codes on our servers.
              </p>
              <p>
                We may receive limited payment-related information necessary to confirm transactions, keep accounting
                records, handle refunds and provide support, including a record of each contribution (amount, channel,
                date and receipt) so you can view your giving history.
              </p>
            </>
          ),
        },
        {
          title: "Cookies and similar technologies",
          body: (
            <>
              <p>
                We may use cookies or similar technologies to support essential website functions, maintain security,
                remember preferences and analyze performance.
              </p>
              <p>
                Where non-essential cookies or tracking technologies are used, we will provide appropriate information
                and consent choices when required by law. You can manage cookies through your browser settings.
              </p>
            </>
          ),
        },
        {
          title: "Sharing of information",
          body: (
            <>
              <p>We do not sell personal information to third-party advertisers.</p>
              <p>We may share limited information with trusted service providers where necessary to operate our website:</p>
              <ul className={list}>
                <li>Payment processors</li>
                <li>Website hosting providers</li>
                <li>Security and infrastructure providers</li>
                <li>Analytics providers, if enabled</li>
                <li>Professional advisers where necessary</li>
              </ul>
              <p>
                We may also disclose information when required by applicable law, lawful requests, or to protect
                legitimate rights and interests. Anonymous blessings are shown publicly without your name.
              </p>
            </>
          ),
        },
        {
          title: "Data security and retention",
          body: (
            <>
              <p>
                We use reasonable technical and organizational safeguards appropriate to the information processed, such
                as encrypted connections, access controls and secure payment processing. However, no method of
                electronic transmission or storage can be guaranteed to be completely secure.
              </p>
              <p>
                We keep personal information only as long as reasonably necessary to provide our services, resolve
                disputes, maintain financial records and meet legal obligations. Retention periods depend on the type of
                information and applicable requirements.
              </p>
            </>
          ),
        },
        {
          title: "International data processing",
          body: (
            <p>
              Our website and service providers may process or store information in countries other than your country of
              residence. Where required, appropriate safeguards will be applied to international transfers.
            </p>
          ),
        },
        {
          title: "Third-party links",
          body: (
            <p>
              Chosen Prayer may link to external websites, social media platforms, videos or third-party services. We are
              not responsible for their privacy practices or content, and encourage you to review their policies.
            </p>
          ),
        },
        {
          title: "Children’s privacy",
          body: (
            <p>
              Chosen Prayer provides general inspirational content and does not intentionally solicit personal
              information from children. If we become aware that personal information has been collected from a child
              without required authorization, we will take appropriate steps in accordance with applicable law.
            </p>
          ),
        },
        {
          title: "Your privacy rights",
          body: (
            <>
              <p>Depending on your location and applicable law, you may have the right to:</p>
              <ul className={list}>
                <li>Request access to personal information</li>
                <li>Request correction of inaccurate information</li>
                <li>Request deletion of certain information, including your account and content</li>
                <li>Object to or restrict certain processing</li>
                <li>Withdraw consent where processing is based on consent</li>
                <li>Request data portability where applicable</li>
              </ul>
              <p>
                To exercise these rights, contact{" "}
                <a href={`mailto:${EMAIL}`} className="font-medium text-charcoal-deep underline underline-offset-2">
                  {EMAIL}
                </a>
                .
              </p>
            </>
          ),
        },
        {
          title: "Changes to this policy",
          body: (
            <p>
              We may update this policy periodically to reflect changes in our website, services, technology or legal
              obligations. The updated version will be published on this page with a revised date.
            </p>
          ),
        },
        {
          title: "Contact",
          body: (
            <>
              <p>
                Questions about this policy, data protection or the handling of personal information? Email{" "}
                <a href={`mailto:${EMAIL}`} className="font-medium text-charcoal-deep underline underline-offset-2">
                  {EMAIL}
                </a>
                .
              </p>
              <p>Chosen Prayer is operated by SYNTRO SOLUTIONS LLC (syntrosolution.com).</p>
            </>
          ),
        },
      ]}
    />
  );
}
