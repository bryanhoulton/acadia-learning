import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

import { Logo } from "../../components/Logo";

/**
 * Minimal Privacy Policy Page
 *
 * Privacy policy styled consistently with the minimal landing variant
 */
export function MinimalPrivacyPolicy() {
  return (
    <div className="min-h-screen bg-[#fafaf9]">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 bg-[#fafaf9]/80 backdrop-blur-sm z-10">
        <div className="max-w-4xl mx-auto px-6 sm:px-8 py-6 flex items-center justify-between">
          <Link
            to="/?variant=variant-minimal"
            className="flex items-center gap-3"
          >
            <div className="p-1 bg-primary rounded-lg">
              <Logo className="w-6 h-6" />
            </div>
            <span className="font-serif text-xl tracking-tight text-neutral-900">
              Acadia
            </span>
          </Link>
          <Link
            to="/?variant=variant-minimal"
            className="flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="pt-24 pb-16 px-6 sm:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-3xl mx-auto"
        >
          <h1 className="text-3xl sm:text-4xl font-serif text-neutral-900 mb-4">
            Privacy Policy
          </h1>
          <div className="text-sm text-neutral-500 mb-8 space-y-1">
            <p>Effective Date: October 27, 2025</p>
            <p>Last Updated: October 27, 2025</p>
          </div>

          <div className="prose prose-neutral max-w-none">
            <p className="text-neutral-600 leading-relaxed mb-8">
              Orin Labs Inc. ("we," "our," "us") provides Acadia Learning, a
              mobile AI tutoring and homework help application (the "Service").
              We take privacy seriously. This Privacy Policy explains what
              information we collect, how we use and share it, and the choices
              you have.
            </p>

            <p className="text-neutral-600 leading-relaxed mb-8">
              Acadia Learning is designed for parents and their children.
              Parents create accounts and provide consent for any child who uses
              the Service, including children under 13, in compliance with the
              Children's Online Privacy Protection Act ("COPPA").
            </p>

            <Section title="1. Information We Collect">
              <p>
                We collect information directly from parents and through the use
                of the Service.
              </p>
              <h4 className="font-semibold text-neutral-800 mt-4 mb-2">
                Account & Profile Information
              </h4>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Parent phone number (primary identifier)</li>
                <li>Optional parent email address for communication</li>
                <li>Child name and grade level</li>
                <li>ZIP code (used to infer time zone)</li>
              </ul>

              <h4 className="font-semibold text-neutral-800 mt-4 mb-2">
                Content & Tutoring Data
              </h4>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Homework photos uploaded by parents</li>
                <li>
                  Chat messages between parents, students, and the tutoring
                  system
                </li>
                <li>SMS message content exchanged with the Service</li>
              </ul>

              <h4 className="font-semibold text-neutral-800 mt-4 mb-2">
                Device & Usage Information
              </h4>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>
                  Technical details such as device type, OS version, IP address,
                  app usage analytics (collected by our analytics provider,
                  PostHog)
                </li>
              </ul>

              <p className="mt-4">
                We do <strong>not</strong> collect biometric data, voice
                recordings, or real-time camera access.
              </p>
            </Section>

            <Section title="2. How We Use Information">
              <p>We use the information we collect to:</p>
              <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
                <li>Provide and personalize tutoring services</li>
                <li>Authenticate and manage accounts</li>
                <li>Improve and train our AI systems</li>
                <li>
                  Communicate with parents (support, updates, billing
                  notifications)
                </li>
                <li>Process payments</li>
                <li>Maintain and improve app performance and security</li>
                <li>Comply with legal obligations</li>
              </ul>
              <p className="mt-4 font-semibold">
                We do not sell personal information.
              </p>
            </Section>

            <Section title="3. Sharing of Information">
              <p>
                We may share data with trusted service providers only as needed
                to operate the Service:
              </p>
              <div className="mt-4 space-y-2">
                <div className="flex gap-4">
                  <span className="font-semibold min-w-[120px]">Render</span>
                  <span>App and data hosting</span>
                </div>
                <div className="flex gap-4">
                  <span className="font-semibold min-w-[120px]">Stripe</span>
                  <span>Payment processing</span>
                </div>
                <div className="flex gap-4">
                  <span className="font-semibold min-w-[120px]">Twilio</span>
                  <span>SMS messaging services</span>
                </div>
                <div className="flex gap-4">
                  <span className="font-semibold min-w-[120px]">PostHog</span>
                  <span>Product analytics</span>
                </div>
                <div className="flex gap-4">
                  <span className="font-semibold min-w-[120px]">
                    OpenAI & Anthropic
                  </span>
                  <span>AI model processing for tutoring/chat</span>
                </div>
              </div>
              <p className="mt-4">
                These providers are contractually required to protect data and
                may only use it to support our Service. Some providers may
                process data on servers located outside your state or country;
                by using the Service, you consent to such transfers.
              </p>
              <p className="mt-2">We may also disclose information:</p>
              <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
                <li>To comply with law or valid legal process</li>
                <li>
                  To protect the rights, safety, and security of users and the
                  Service
                </li>
                <li>
                  As part of a merger, acquisition, or sale of assets (with
                  notice where required)
                </li>
              </ul>
            </Section>

            <Section title="4. Children's Privacy (COPPA)">
              <p>
                Parents create and manage accounts for their children. By doing
                so, parents consent to the collection and use of their child's
                data as described in this Policy.
              </p>
              <p className="mt-2">
                Parents can review, update, or delete their child's information
                at any time.
              </p>
              <p className="mt-2">
                We do not allow children to create standalone accounts.
              </p>
            </Section>

            <Section title="5. Cookies and Tracking Technologies">
              <p>
                We use cookies and similar technologies (pixels, local storage)
                to:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
                <li>Keep you logged in</li>
                <li>Remember your preferences</li>
                <li>Understand how you use the Service</li>
                <li>Improve our products and marketing</li>
              </ul>
              <p className="mt-2">
                You can control cookies through your browser settings. Disabling
                cookies may affect Service functionality.
              </p>
            </Section>

            <Section title="6. SMS and Text Messaging">
              <p>
                By providing your phone number and using the Service, you
                consent to receive SMS text messages from us, including:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
                <li>Verification codes for account access</li>
                <li>Tutoring session content and interactions</li>
                <li>Progress updates and notifications</li>
                <li>Service announcements</li>
              </ul>
              <p className="mt-2">
                Message frequency varies. Message and data rates may apply. You
                can opt out of non-essential messages by replying STOP, but this
                may limit Service functionality.
              </p>
            </Section>

            <Section title="7. Data Security">
              <p>We use security measures such as:</p>
              <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
                <li>Encryption in transit (HTTPS) and at rest</li>
                <li>Secure authentication mechanisms</li>
                <li>Restricted access to sensitive data</li>
                <li>Regular security assessments</li>
              </ul>
              <p className="mt-2">
                No system is 100% secure, but we strive to protect all personal
                data from unauthorized access, loss, or misuse.
              </p>
            </Section>

            <Section title="8. Data Retention">
              <p>
                We retain tutoring logs and related account information for up
                to 1 year, or as needed to provide the Service and comply with
                legal obligations.
              </p>
              <p className="mt-2">You may request earlier deletion.</p>
            </Section>

            <Section title="9. Data Rights & Choices">
              <p>Parents may:</p>
              <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
                <li>Access and correct account or child information</li>
                <li>Delete their account and associated data</li>
                <li>Withdraw consent to continue collecting child data</li>
              </ul>
              <p className="mt-4">
                To exercise any of the above, contact us at:{" "}
                <a
                  href="mailto:info@acadialearning.org"
                  className="text-neutral-900 underline hover:text-neutral-600"
                >
                  info@acadialearning.org
                </a>
              </p>
            </Section>

            <Section title="10. California Privacy Rights (CCPA)">
              <p>
                If you are a California resident, you have additional rights
                under the California Consumer Privacy Act (CCPA):
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
                <li>
                  <strong>Right to Know:</strong> Request details about the
                  personal information we collect, use, and disclose
                </li>
                <li>
                  <strong>Right to Delete:</strong> Request deletion of your
                  personal information, subject to certain exceptions
                </li>
                <li>
                  <strong>Right to Opt-Out:</strong> We do not sell personal
                  information, so this right does not apply
                </li>
                <li>
                  <strong>Right to Non-Discrimination:</strong> We will not
                  discriminate against you for exercising your privacy rights
                </li>
              </ul>
              <p className="mt-2">
                To exercise these rights, contact us at info@acadialearning.org.
                We may need to verify your identity before processing your
                request.
              </p>
            </Section>

            <Section title="11. Communication Preferences">
              <p>
                Parents may opt out of optional communications (e.g., marketing
                messages).
              </p>
              <p className="mt-2">
                Transactional messages (e.g., receipts, account notices) may
                still be sent.
              </p>
            </Section>

            <Section title="12. Third-Party Links">
              <p>
                The Service may contain links to third-party websites or
                services. We are not responsible for the privacy practices of
                these external sites. We encourage you to review the privacy
                policies of any third-party sites you visit.
              </p>
            </Section>

            <Section title="13. Changes to This Policy">
              <p>
                We may update this Privacy Policy occasionally. Changes will be
                posted in the app with a revised "Effective Date." Continued use
                of the Service means you accept those changes.
              </p>
            </Section>

            <Section title="14. Contact Us">
              <p>
                If you have questions about this Privacy Policy or our data
                practices, you can contact us at:
              </p>
              <div className="mt-4 p-4 bg-neutral-100 rounded-lg">
                <p className="font-semibold">Orin Labs Inc.</p>
                <p>41 Decatur St</p>
                <p>San Francisco, CA 94103</p>
                <p className="mt-2">
                  Email:{" "}
                  <a
                    href="mailto:info@acadialearning.org"
                    className="text-neutral-900 underline hover:text-neutral-600"
                  >
                    info@acadialearning.org
                  </a>
                </p>
              </div>
            </Section>
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-200 py-8 px-6 sm:px-8">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-neutral-500">
          <p>© {new Date().getFullYear()} Orin Labs Inc.</p>
          <div className="flex gap-6">
            <Link
              to="/privacy"
              className="hover:text-neutral-900 transition-colors font-medium text-neutral-700"
            >
              Privacy
            </Link>
            <Link
              to="/terms"
              className="hover:text-neutral-900 transition-colors"
            >
              Terms
            </Link>
            <Link
              to="/coppa"
              className="hover:text-neutral-900 transition-colors"
            >
              COPPA
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="text-xl font-semibold text-neutral-900 mb-3">{title}</h2>
      <div className="text-neutral-600 leading-relaxed">{children}</div>
    </section>
  );
}
