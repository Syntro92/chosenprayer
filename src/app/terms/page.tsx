import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Terms | Chosen Prayer",
  description: "The terms for using Chosen Prayer.",
};

const list = "list-disc space-y-1 pl-5";
const EMAIL = "contact@chosenprayer.com";
const mail = (
  <a href={`mailto:${EMAIL}`} className="font-medium text-charcoal-deep underline underline-offset-2">
    {EMAIL}
  </a>
);

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms and Conditions"
      updated="October 19, 2026"
      intro="These Terms govern your access to and use of chosenprayer.com, including its videos, written content, digital media, features and voluntary financial support. Chosen Prayer is operated by SYNTRO SOLUTIONS LLC. By using the website you agree to these Terms; if you do not agree, please stop using it."
      sections={[
        {
          title: "About our platform",
          body: (
            <p>
              Chosen Prayer is an independent Christian inspirational digital media platform offering faith-based videos,
              prayers, inspirational messages, biblical reflections and related media, to share encouragement, hope and
              spiritual inspiration.
            </p>
          ),
        },
        {
          title: "Using the website",
          body: (
            <>
              <p>
                You may access public content for personal, lawful and non-commercial purposes. If you create an account,
                you must be old enough to enter into a binding agreement where you live, give accurate information and
                keep your account secure. You are responsible for activity on your account.
              </p>
              <p>You agree not to:</p>
              <ul className={list}>
                <li>Use the website for unlawful purposes</li>
                <li>Attempt unauthorized access to our systems or interfere with security or functionality</li>
                <li>Distribute malware or harmful software</li>
                <li>Misrepresent your identity in communications</li>
                <li>Reproduce or commercially exploit protected content without authorization</li>
                <li>Violate the intellectual property rights of others</li>
              </ul>
              <p>
                We may restrict access where reasonably necessary to protect the website, its users or our legal rights.
              </p>
            </>
          ),
        },
        {
          title: "Community conduct and your content",
          body: (
            <>
              <p>
                Be respectful. Do not post anything unlawful, hateful, harassing, misleading or spam. We may remove
                content or suspend accounts that break these rules.
              </p>
              <p>
                You keep ownership of what you post. You give us permission to display it on the service so it can work
                as intended.
              </p>
            </>
          ),
        },
        {
          title: "Intellectual property",
          body: (
            <>
              <p>
                Unless otherwise stated, original videos, graphics, designs and written materials published by Chosen
                Prayer are owned by or licensed to the website operator. Third-party materials remain the property of
                their owners. You may not reproduce, redistribute, modify, sell or commercially exploit protected
                materials without permission or another lawful basis. Sharing links to public content is generally
                permitted.
              </p>
              <p>Copyright inquiries: {mail}</p>
            </>
          ),
        },
        {
          title: "Religious and inspirational content",
          body: (
            <p>
              Our content is published for general inspirational, educational and spiritual reflection purposes and
              expresses Christian faith-based perspectives. It is not intended to guarantee any spiritual, financial,
              medical, legal or personal outcome. You are responsible for your own decisions and should seek qualified
              professional advice when appropriate.
            </p>
          ),
        },
        {
          title: "Voluntary financial support",
          body: (
            <>
              <p>
                You may choose to provide voluntary financial support in appreciation of our published content. This may
                help fund original video production, content research, editing and publishing, website maintenance and
                the continued operation of the platform. Support is entirely optional, and public content can be accessed
                without any contribution.
              </p>
              <p>
                A contribution does not guarantee personalized services, exclusive access, special religious benefits,
                answered prayers, spiritual outcomes or additional products. Contributions are not tax-deductible
                charitable donations, and Chosen Prayer does not claim nonprofit or tax-exempt status through accepting
                them.
              </p>
            </>
          ),
        },
        {
          title: "Payment processing",
          body: (
            <p>
              Payments are processed through Stripe or other providers disclosed at checkout, and may be subject to
              their own terms and privacy policies. By submitting a payment you authorize the payment processor to charge
              the selected amount to your chosen payment method. You are responsible for ensuring the payment details are
              accurate and that you are authorized to use the payment method. Payment questions: {mail}
            </p>
          ),
        },
        {
          title: "Refunds and payment issues",
          body: (
            <>
              <p>
                You may request a full refund within 7 calendar days of the original payment date, without giving a
                reason, from your account page, the link in your receipt email, or by emailing {mail} with the payment
                date, amount and transaction reference. Refunds are returned to the original payment method; timing
                depends on Stripe and your bank.
              </p>
              <p>
                Later requests will be reviewed where required by applicable law or at our discretion, including for
                duplicate payments, unauthorized transactions, incorrect amounts or technical payment errors. Nothing in
                these Terms limits your statutory consumer rights.
              </p>
            </>
          ),
        },
        {
          title: "Third-party services",
          body: (
            <p>
              The website may link to third-party websites, social platforms, payment services or external content. We do
              not control or guarantee their availability, accuracy, security or policies, and your use of them is subject
              to their terms.
            </p>
          ),
        },
        {
          title: "Availability, warranties and liability",
          body: (
            <>
              <p>
                We aim to keep the website reliable but do not guarantee uninterrupted or error-free access, and may
                update, modify, suspend or discontinue features for maintenance, security, legal or operational reasons.
              </p>
              <p>
                To the extent permitted by law, the website and content are provided “as is” and “as available”, and we
                are not liable for indirect or consequential losses arising from your use of them. Nothing here excludes
                or limits warranties, rights or liability that cannot lawfully be excluded or limited.
              </p>
            </>
          ),
        },
        {
          title: "Privacy",
          body: (
            <p>
              Your use of the website is also subject to our{" "}
              <Link href="/privacy" className="font-medium text-charcoal-deep underline underline-offset-2">
                Privacy Policy
              </Link>
              .
            </p>
          ),
        },
        {
          title: "Changes and governing law",
          body: (
            <>
              <p>
                We may revise these Terms from time to time and will publish updates on this page with a revised date.
                Where required by law, we will give additional notice or obtain consent before material changes take
                effect. Continued use means you accept the updated Terms.
              </p>
              <p>
                These Terms are subject to the laws applicable to the website operator and the relevant transaction,
                including any mandatory consumer protections that apply in your jurisdiction.
              </p>
            </>
          ),
        },
        {
          title: "Contact",
          body: (
            <p>
              Questions about these Terms, website use, intellectual property or contributions? Email {mail}. Chosen
              Prayer is operated by SYNTRO SOLUTIONS LLC (syntrosolution.com).
            </p>
          ),
        },
      ]}
    />
  );
}
