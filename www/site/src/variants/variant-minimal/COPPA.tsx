import { motion } from "framer-motion";
import { ArrowLeft, Shield } from "lucide-react";
import { Link } from "react-router-dom";

import { Logo } from "../../components/Logo";

/**
 * COPPA Compliance Page
 *
 * Children's Online Privacy Protection Act compliance information
 */
export function COPPA() {
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
          <div className="flex items-center gap-3 mb-4">
            <Shield className="w-8 h-8 text-primary" />
            <h1 className="text-3xl sm:text-4xl font-serif text-neutral-900">
              COPPA Compliance
            </h1>
          </div>
          <p className="text-neutral-500 mb-8">
            Children's Online Privacy Protection Act
          </p>

          <div className="prose prose-neutral max-w-none">
            <div className="bg-primary-50 border border-primary-200 rounded-xl p-6 mb-8">
              <p className="text-neutral-800 font-medium mb-2">
                Our Commitment to Children's Privacy
              </p>
              <p className="text-neutral-600 text-sm">
                Acadia Learning is committed to protecting the privacy of
                children. We comply with the Children's Online Privacy
                Protection Act (COPPA), which requires parental consent before
                collecting personal information from children under 13.
              </p>
            </div>

            <Section title="What is COPPA?">
              <p>
                The Children's Online Privacy Protection Act (COPPA) is a United
                States federal law designed to protect the privacy of children
                under 13 years of age. It requires websites and online services
                directed at children, or that knowingly collect personal
                information from children, to:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
                <li>
                  Provide notice to parents about data collection practices
                </li>
                <li>
                  Obtain verifiable parental consent before collecting data
                </li>
                <li>
                  Give parents the ability to review and delete their child's
                  information
                </li>
                <li>
                  Limit data collection to what is necessary for the service
                </li>
                <li>
                  Maintain reasonable security measures for children's data
                </li>
              </ul>
            </Section>

            <Section title="How Acadia Complies with COPPA">
              <h4 className="font-semibold text-neutral-800 mt-4 mb-2">
                Parental Account Requirement
              </h4>
              <p>
                Children cannot create accounts on Acadia. All accounts are
                created and managed by parents or legal guardians. By creating
                an account for their child, parents provide verifiable consent
                for us to collect and use their child's information as described
                in our Privacy Policy.
              </p>

              <h4 className="font-semibold text-neutral-800 mt-4 mb-2">
                Limited Data Collection
              </h4>
              <p>
                We only collect information necessary to provide tutoring
                services:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
                <li>Child's first name (for personalized tutoring)</li>
                <li>Grade level (to provide age-appropriate content)</li>
                <li>
                  Learning interactions and progress (to improve tutoring
                  quality)
                </li>
              </ul>
              <p className="mt-2">
                We do <strong>not</strong> collect:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
                <li>Social security numbers</li>
                <li>Physical addresses of children</li>
                <li>Photos or videos of children</li>
                <li>Geolocation data</li>
                <li>Voice recordings</li>
              </ul>

              <h4 className="font-semibold text-neutral-800 mt-4 mb-2">
                No Third-Party Advertising
              </h4>
              <p>
                We do not display behavioral advertising to children. We do not
                sell children's personal information to third parties. We do not
                share children's data with advertisers.
              </p>

              <h4 className="font-semibold text-neutral-800 mt-4 mb-2">
                Data Security
              </h4>
              <p>
                We implement industry-standard security measures to protect
                children's personal information, including encryption in transit
                and at rest, secure authentication, and restricted access
                controls.
              </p>
            </Section>

            <Section title="Parental Rights">
              <p>As a parent or guardian, you have the right to:</p>
              <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
                <li>
                  <strong>Review</strong> your child's personal information by
                  contacting us
                </li>
                <li>
                  <strong>Request deletion</strong> of your child's personal
                  information
                </li>
                <li>
                  <strong>Withdraw consent</strong> for future collection of
                  your child's information
                </li>
                <li>
                  <strong>Refuse</strong> to allow further collection or use of
                  your child's information
                </li>
              </ul>
              <p className="mt-4">
                To exercise any of these rights, contact us at:{" "}
                <a
                  href="mailto:info@acadialearning.org"
                  className="text-neutral-900 underline hover:text-neutral-600"
                >
                  info@acadialearning.org
                </a>
              </p>
            </Section>

            <Section title="Data We Do Not Sell">
              <div className="bg-green-50 border border-green-200 rounded-xl p-6">
                <p className="text-green-900 font-semibold mb-2">
                  We Never Sell Your Data
                </p>
                <p className="text-green-800 text-sm">
                  Acadia Learning does not sell, rent, or trade any personal
                  information — including children's data — to third parties for
                  marketing or any other purpose. Your family's privacy is our
                  priority.
                </p>
              </div>
            </Section>

            <Section title="Contact Information">
              <p>
                If you have questions about our COPPA compliance or wish to
                exercise your parental rights, please contact us:
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

            <Section title="Related Policies">
              <p>
                For more information about how we handle data, please review our
                other policies:
              </p>
              <div className="flex gap-4 mt-4">
                <Link
                  to="/privacy"
                  className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 rounded-lg text-neutral-700 transition-colors"
                >
                  Privacy Policy
                </Link>
                <Link
                  to="/terms"
                  className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 rounded-lg text-neutral-700 transition-colors"
                >
                  Terms of Service
                </Link>
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
              className="hover:text-neutral-900 transition-colors"
            >
              Terms
            </Link>
            <Link
              to="/coppa"
              className="hover:text-neutral-900 transition-colors font-medium text-neutral-700"
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
