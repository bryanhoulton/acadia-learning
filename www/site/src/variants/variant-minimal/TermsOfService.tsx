import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

import { Logo } from "../../components/Logo";

/**
 * Minimal Terms of Service Page
 *
 * Terms of service styled consistently with the minimal landing variant
 */
export function MinimalTermsOfService() {
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
            Terms of Service
          </h1>
          <div className="text-sm text-neutral-500 mb-8 space-y-1">
            <p>Effective Date: October 27, 2025</p>
            <p>Last Updated: October 27, 2025</p>
          </div>

          <div className="prose prose-neutral max-w-none">
            <p className="text-neutral-600 leading-relaxed mb-8">
              Welcome to Acadia Learning ("Acadia," "Service"). These Terms of
              Service ("Terms") apply to your use of the Service provided by
              Orin Labs Inc. ("we," "us," or "our"). By creating an account or
              using Acadia, you agree to these Terms.
            </p>

            <p className="text-neutral-600 leading-relaxed mb-8 font-semibold">
              If you do not agree, do not use the Service.
            </p>

            <Section title="1. Who May Use the Service">
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>
                  You must be <strong>at least 18 years old</strong> and a{" "}
                  <strong>parent or legal guardian</strong> to create an
                  account.
                </li>
                <li>
                  You may allow your child to use Acadia only with your
                  supervision and consent.
                </li>
                <li>
                  You are responsible for all activity on your account,
                  including by your child.
                </li>
              </ul>
              <p className="mt-4">Acadia is intended for U.S. users only.</p>
            </Section>

            <Section title="2. Your Account">
              <p>
                You must provide accurate information when creating an account.
              </p>
              <p className="mt-2">
                You are responsible for maintaining the confidentiality of your
                login credentials (e.g., phone verification codes).
              </p>
              <p className="mt-2">
                You must notify us immediately if you believe your account has
                been accessed without authorization.
              </p>
            </Section>

            <Section title="3. Use of the Service">
              <p>You agree not to:</p>
              <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
                <li>Use Acadia for unlawful purposes</li>
                <li>
                  Upload harmful, inappropriate, or copyrighted content you
                  don't have rights to
                </li>
                <li>
                  Attempt to reverse engineer, modify, or disrupt the Service
                </li>
                <li>Use Acadia to collect information about others</li>
              </ul>
              <p className="mt-4">
                We may suspend or terminate your access if you violate these
                Terms or misuse the Service.
              </p>
            </Section>

            <Section title="4. User Content">
              <p>
                You may upload content such as homework images, messages, and
                other materials ("User Content").
              </p>
              <p className="mt-2">You retain ownership of your User Content.</p>
              <p className="mt-2">
                By using the Service, you grant us a limited license to host,
                process, and analyze User Content to provide and improve the
                tutoring experience.
              </p>
              <p className="mt-2">
                We may remove or disable access to content that violates these
                Terms or applicable law.
              </p>
            </Section>

            <Section title="5. Electronic Communications">
              <p>
                By creating an account, you consent to receive electronic
                communications from us, including:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
                <li>
                  SMS text messages for tutoring sessions and notifications
                </li>
                <li>Account verification codes</li>
                <li>Service updates and announcements</li>
                <li>Billing and payment notifications</li>
              </ul>
              <p className="mt-2">
                You agree that these communications satisfy any legal
                requirement that such communications be in writing. Message and
                data rates may apply.
              </p>
            </Section>

            <Section title="6. Premium Features and Payments">
              <p>
                Some features require payment. Purchases may be processed by
                Stripe or in-app payment systems (e.g., Apple, Google).
              </p>
              <p className="mt-2">By making a purchase, you agree to:</p>
              <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
                <li>Pay all applicable fees</li>
                <li>Provide accurate billing information</li>
              </ul>

              <h4 className="font-semibold text-neutral-800 mt-4 mb-2">
                Subscriptions
              </h4>
              <p>
                If you purchase a subscription, it will automatically renew at
                the end of each billing period unless you cancel before the
                renewal date. You can cancel your subscription at any time
                through your account settings or by contacting us.
              </p>

              <h4 className="font-semibold text-neutral-800 mt-4 mb-2">
                Refunds
              </h4>
              <p>
                Except where required by law, payments are non-refundable once
                services are delivered. If you cancel a subscription, you will
                continue to have access until the end of your current billing
                period.
              </p>
            </Section>

            <Section title="7. AI Tutoring and Limitations">
              <p>
                Acadia uses artificial intelligence to provide guidance and
                homework help.
              </p>
              <p className="mt-2">
                AI-generated responses may not always be accurate. You agree to
                use your judgment and supervise your child's use of the Service.
              </p>
              <p className="mt-2">
                We are <strong>not liable</strong> for academic outcomes or
                decisions made based on AI responses.
              </p>
            </Section>

            <Section title="8. Privacy">
              <p>
                Your use of the Service is also governed by our Privacy Policy,
                which explains how we collect and handle data, including
                information about children.
              </p>
              <p className="mt-2">
                <Link
                  to="/m/privacy"
                  className="text-neutral-900 underline hover:text-neutral-600"
                >
                  View Privacy Policy
                </Link>
              </p>
            </Section>

            <Section title="9. Intellectual Property">
              <p>
                All software, text, graphics, trademarks, and other content
                provided by us are owned by or licensed to Orin Labs Inc.
              </p>
              <p className="mt-2">
                You may not copy, distribute, or modify our materials except as
                allowed by these Terms.
              </p>
            </Section>

            <Section title="10. Service Availability and Changes">
              <p>We may change, update, or discontinue features at any time.</p>
              <p className="mt-2">
                We are not responsible for outages, data loss, or interruptions
                caused by third-party providers or network issues.
              </p>
            </Section>

            <Section title="11. Termination">
              <p>You may stop using the Service at any time.</p>
              <p className="mt-2">
                We may suspend or terminate your account if:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
                <li>You violate these Terms</li>
                <li>We suspect abuse or fraud</li>
                <li>We discontinue the Service</li>
              </ul>
              <p className="mt-4">
                Upon termination, we may delete your data according to our
                Privacy Policy.
              </p>
            </Section>

            <Section title="12. Disclaimers">
              <p>The Service is provided on an "AS IS" basis.</p>
              <p className="mt-2">We make no warranties regarding:</p>
              <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
                <li>Accuracy or reliability of tutoring responses</li>
                <li>Results of using Acadia</li>
                <li>Continuous or error-free operation</li>
              </ul>
              <p className="mt-4">
                To the fullest extent permitted by law, we disclaim all implied
                warranties.
              </p>
            </Section>

            <Section title="13. Limitation of Liability">
              <p>
                To the maximum extent permitted by law, Orin Labs Inc. is not
                liable for:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
                <li>Indirect, incidental, or consequential damages</li>
                <li>Loss of data, revenue, or profits</li>
                <li>Any use of or reliance on AI-generated content</li>
              </ul>
              <p className="mt-4">
                Our total liability is limited to the greater of $50 or the
                amounts you paid in the last 6 months.
              </p>
              <p className="mt-2 text-sm">
                Some states do not allow these limitations — in those cases,
                limits apply to the extent permitted.
              </p>
            </Section>

            <Section title="14. Indemnification">
              <p>
                You agree to defend and indemnify us from claims arising out of:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
                <li>Your misuse of Acadia</li>
                <li>Your violation of these Terms</li>
                <li>Your child's use of the Service under your account</li>
              </ul>
            </Section>

            <Section title="15. Governing Law and Dispute Resolution">
              <p>
                These Terms are governed by the laws of the State of California,
                without regard to conflict-of-law principles.
              </p>
              <p className="mt-2">
                Any disputes must be resolved in state or federal courts located
                in San Francisco, California, unless otherwise required by law.
              </p>
            </Section>

            <Section title="16. Changes to These Terms">
              <p>
                We may modify these Terms. Updates will be posted with a revised
                "Effective Date." Continued use of the Service means you accept
                the changes.
              </p>
            </Section>

            <Section title="17. General Provisions">
              <h4 className="font-semibold text-neutral-800 mb-2">
                Severability
              </h4>
              <p>
                If any provision of these Terms is found to be unenforceable,
                the remaining provisions will continue in full force and effect.
              </p>

              <h4 className="font-semibold text-neutral-800 mt-4 mb-2">
                Entire Agreement
              </h4>
              <p>
                These Terms, together with the Privacy Policy, constitute the
                entire agreement between you and Orin Labs Inc. regarding the
                Service and supersede any prior agreements.
              </p>

              <h4 className="font-semibold text-neutral-800 mt-4 mb-2">
                No Waiver
              </h4>
              <p>
                Our failure to enforce any provision of these Terms shall not be
                deemed a waiver of that provision or our right to enforce it
                later.
              </p>

              <h4 className="font-semibold text-neutral-800 mt-4 mb-2">
                Assignment
              </h4>
              <p>
                You may not assign or transfer your rights under these Terms
                without our written consent. We may assign our rights and
                obligations without restriction.
              </p>
            </Section>

            <Section title="18. Contact Us">
              <p>If you have questions about these Terms:</p>
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
              className="hover:text-neutral-900 transition-colors"
            >
              Privacy
            </Link>
            <Link
              to="/terms"
              className="hover:text-neutral-900 transition-colors font-medium text-neutral-700"
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
