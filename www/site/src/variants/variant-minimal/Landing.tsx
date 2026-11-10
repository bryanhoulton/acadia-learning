import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  AnimatePresence,
  motion,
} from 'framer-motion';
import {
  ArrowRight,
  Check,
  Copy,
  MessageCircle,
  Shield,
} from 'lucide-react';
import posthog from 'posthog-js';
import { QRCodeSVG } from 'qrcode.react';
import { Link } from 'react-router-dom';

import { client } from '../../client';
import {
  MobilePhoneInput,
  MobileVerificationInput,
} from '../../components/evaluation/MobileComponents';
import { Logo } from '../../components/Logo';
import {
  TutorCreatingAnimation,
} from '../../components/TutorCreatingAnimation';
import { useSignupMetadata } from '../../hooks/useUtmParams';

// Typewriter phrases for the hero
const typewriterPhrases = [
  "when math isn't clicking",
  "the 9pm homework fight",
  "parents who hate fractions",
  "making multiplication fun",
  "kids who say 'I hate math'",
  "building real confidence",
  "the Sunday night panic",
  "when school isn't enough",
  "turning C's into A's",
  "busy Tuesday nights",
  "pre-algebra breakthroughs",
];

// Typewriter effect hook
function useTypewriter(
  phrases: string[],
  typingSpeed = 50,
  deletingSpeed = 30,
  pauseDuration = 2000
) {
  const [currentPhraseIndex, setCurrentPhraseIndex] = useState(0);
  const [currentText, setCurrentText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const tick = useCallback(() => {
    const currentPhrase = phrases[currentPhraseIndex];

    if (isDeleting) {
      setCurrentText(currentPhrase.substring(0, currentText.length - 1));
    } else {
      setCurrentText(currentPhrase.substring(0, currentText.length + 1));
    }
  }, [currentPhraseIndex, currentText, isDeleting, phrases]);

  useEffect(() => {
    const currentPhrase = phrases[currentPhraseIndex];

    let timeout: ReturnType<typeof setTimeout>;

    if (!isDeleting && currentText === currentPhrase) {
      // Finished typing, pause then start deleting
      timeout = setTimeout(() => setIsDeleting(true), pauseDuration);
    } else if (isDeleting && currentText === "") {
      // Finished deleting, move to next phrase
      setIsDeleting(false);
      setCurrentPhraseIndex((prev) => (prev + 1) % phrases.length);
    } else {
      // Still typing or deleting
      timeout = setTimeout(tick, isDeleting ? deletingSpeed : typingSpeed);
    }

    return () => clearTimeout(timeout);
  }, [
    currentText,
    isDeleting,
    currentPhraseIndex,
    phrases,
    tick,
    typingSpeed,
    deletingSpeed,
    pauseDuration,
  ]);

  return currentText;
}

const ACADIA_PHONE = "+14155838050";
const ACADIA_PHONE_DISPLAY = "(415) 583-8050";
const SMS_BODY = "Hi! I'm interested in math tutoring for my kid";
const SMS_LINK = `sms:${ACADIA_PHONE}?body=${encodeURIComponent(SMS_BODY)}`;

// Detect if user is on a mobile device
const useIsMobile = () => {
  return useMemo(() => {
    if (typeof window === "undefined") return false;
    const userAgent =
      navigator.userAgent || navigator.vendor || (window as any).opera;
    // Check for mobile devices
    return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
      userAgent.toLowerCase()
    );
  }, []);
};

// Check if phone number has enough digits to be valid (10+ digits after country code)
const isValidPhone = (phone: string): boolean => {
  const digitsOnly = phone.replace(/\D/g, "");
  return digitsOnly.length >= 11; // country code + 10 digits
};

type Step = "phone" | "verify" | "creating" | "complete";

const PORTAL_URL =
  import.meta.env.VITE_FRONTEND_URL || "https://app.acadialearning.org";

export function MinimalLanding() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [step, setStep] = useState<Step>("phone");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [copied, setCopied] = useState(false);
  const [isNewAccount, setIsNewAccount] = useState(true);
  const signupMetadata = useSignupMetadata();
  const isMobile = useIsMobile();
  const typewriterText = useTypewriter(typewriterPhrases);

  // Memoized callback to prevent typewriter re-renders from resetting animation timer
  const handleAnimationComplete = useCallback(() => {
    setStep("complete");
  }, []);

  // Static family count for social proof
  const trustedFamilies = 1000;

  const handleCopyPhone = async () => {
    try {
      await navigator.clipboard.writeText(ACADIA_PHONE_DISPLAY);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = ACADIA_PHONE_DISPLAY;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const phoneValid = isValidPhone(phoneNumber);
  const codeValid = verificationCode.length === 6;

  // Countdown timer for resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneValid || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      const result = await client.POST(
        "/api/lms/accounts/request-verification-code/",
        {
          body: {
            phone_number: phoneNumber,
            allow_signup: true,
            source: "web",
            timezone: browserTimezone,
            signup_metadata:
              Object.keys(signupMetadata).length > 0
                ? signupMetadata
                : undefined,
          },
        }
      );

      if (!result.response.ok || !result.data) {
        const requestError = (result as { error?: { message?: string } }).error;
        setError(requestError?.message || "Something went wrong");
        return;
      }

      // Track whether this is a new account or existing
      const accountCreated = result.data.account_created ?? true;
      setIsNewAccount(accountCreated);

      posthog.identify(phoneNumber);
      posthog.capture("phone_submitted", {
        source: "minimal_landing",
        is_new_account: accountCreated,
      });

      setStep("verify");
      setResendCooldown(30);
    } catch {
      setError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0 || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      const result = await client.POST(
        "/api/lms/accounts/request-verification-code/",
        {
          body: {
            phone_number: phoneNumber,
            allow_signup: true,
            source: "web",
            timezone: browserTimezone,
            signup_metadata:
              Object.keys(signupMetadata).length > 0
                ? signupMetadata
                : undefined,
          },
        }
      );

      if (!result.response.ok) {
        const requestError = (result as { error?: { message?: string } }).error;
        setError(requestError?.message || "Failed to resend code");
        return;
      }

      setVerificationCode("");
      setResendCooldown(30);
    } catch {
      setError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const submitVerification = async (code?: string) => {
    const codeToVerify = code || verificationCode;
    if (codeToVerify.length !== 6 || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const verifyResult = await client.POST("/api/lms/accounts/verify-code/", {
        body: {
          phone_number: phoneNumber,
          code: codeToVerify,
        },
      });

      if (!verifyResult.response.ok || !verifyResult.data) {
        const verifyError = (verifyResult as { error?: { message?: string } })
          .error;
        setError(verifyError?.message || "Invalid code");
        return;
      }

      const accountId = verifyResult.data.account?.id;
      const tempToken = verifyResult.data.access;

      // Update account timezone from browser
      const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (accountId && browserTimezone) {
        await fetch(
          `${import.meta.env.VITE_API_URL || "http://localhost:8000"}/api/lms/accounts/accounts/${accountId}/`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${tempToken}`,
            },
            body: JSON.stringify({ timezone: browserTimezone }),
          }
        );
      }

      // If this is an existing account, create magic link and redirect to the portal
      if (!isNewAccount) {
        posthog.capture("login_complete", {
          source: "minimal_landing",
        });

        // Create a magic link token for seamless cross-domain auth
        try {
          const magicLinkResult = await fetch(
            `${import.meta.env.VITE_API_URL || "http://localhost:8000"}/api/lms/accounts/create-magic-link/`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tempToken}`,
              },
              body: JSON.stringify({}),
            }
          );

          if (magicLinkResult.ok) {
            const magicLinkData = await magicLinkResult.json();
            // Redirect with magic link token for automatic login
            window.location.href = `${PORTAL_URL}/auth/magic?token=${encodeURIComponent(magicLinkData.token)}`;
            return;
          }
        } catch {
          // Fall back to phone-based redirect if magic link fails
          console.error(
            "Failed to create magic link, falling back to phone redirect"
          );
        }

        // Fallback: redirect with phone number as hint
        window.location.href = `${PORTAL_URL}/login?phone=${encodeURIComponent(phoneNumber)}`;
        return;
      }

      // Initialize the entity but DON'T send welcome SMS - user will text first
      await fetch(
        `${import.meta.env.VITE_API_URL || "http://localhost:8000"}/api/lms/accounts/initialize-entity/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${tempToken}`,
          },
          body: JSON.stringify({ platform: "web", send_welcome_sms: false }),
        }
      );

      posthog.capture("signup_complete", {
        source: "minimal_landing",
        is_mobile: isMobile,
      });

      // Track Facebook Lead conversion
      if (typeof window !== "undefined" && (window as any).fbq) {
        (window as any).fbq("track", "Lead");
      }

      // Track Beehiiv Lead conversion
      if (typeof window !== "undefined" && (window as any).bhpx) {
        (window as any).bhpx("track", "lead");
      }

      // Go to creating animation step for new signups
      setStep("creating");
    } catch {
      setError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyCode = (e: React.FormEvent) => {
    e.preventDefault();
    submitVerification();
  };

  return (
    <div className="min-h-[110vh] bg-[#fafaf9] flex flex-col">
      {/* Logo - top left */}
      <div className="absolute top-4 left-4 sm:top-8 sm:left-8 z-10">
        <div className="flex items-center gap-2">
          <div className="p-1 bg-primary rounded-lg">
            <Logo className="w-6 h-6" />
          </div>
          <span className="font-serif text-xl tracking-tight text-neutral-900">
            Acadia
          </span>
        </div>
      </div>

      {/* Login button - top right */}
      <div className="absolute top-4 right-4 sm:top-8 sm:right-8 z-10">
        <a
          href={`${PORTAL_URL}/login`}
          className="px-4 py-2 text-sm font-medium text-neutral-700 hover:text-neutral-900 transition-colors"
        >
          Log In
        </a>
      </div>

      {/* Main content - vertically centered */}
      <main className="flex-1 flex items-start md:items-center justify-center px-5 sm:px-8 pt-20 md:pt-0">
        <div className="max-w-2xl w-full space-y-6 sm:space-y-12">
          {/* The statement */}
          <AnimatePresence mode="wait">
            {step === "creating" ? (
              <motion.div
                key="creating"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 flex items-center justify-center"
              >
                <TutorCreatingAnimation onComplete={handleAnimationComplete} />
              </motion.div>
            ) : step === "complete" ? (
              <motion.div
                key="complete"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="fixed inset-0 flex items-center justify-center px-5"
              >
                <div className="space-y-8 text-left">
                  <div className="space-y-4">
                    <h1 className="text-5xl sm:text-5xl md:text-6xl font-serif text-neutral-900 leading-[1.1] tracking-tight">
                      One last step...
                      <br />
                      <span className="italic">meet your tutor!</span>
                    </h1>
                    <p className="text-base sm:text-xl text-neutral-500 max-w-md leading-relaxed">
                      Text your math tutor to get started. They'll get your
                      first session scheduled.
                    </p>
                  </div>
                  {isMobile ? (
                    <a
                      href={SMS_LINK}
                      className="inline-flex h-14 px-8 bg-primary-500 text-white rounded-xl hover:bg-primary-600 transition-colors items-center justify-center gap-3 font-medium text-lg"
                    >
                      <MessageCircle className="w-5 h-5" />
                      Open Messages
                    </a>
                  ) : (
                    <div className="flex flex-col sm:flex-row gap-6 items-center justify-center">
                      <div className="py-4">
                        <QRCodeSVG
                          value={SMS_LINK}
                          size={160}
                          level="H"
                          bgColor="transparent"
                          fgColor="#00a071"
                        />
                      </div>
                      <div className="space-y-4 text-left">
                        <p className="text-neutral-600 max-w-xs">
                          Scan the QR code with your phone, or text us directly:
                        </p>
                        <div className="flex items-center gap-2">
                          <a
                            href={SMS_LINK}
                            className="text-2xl font-semibold text-neutral-900 tracking-tight hover:text-primary-600 transition-colors"
                          >
                            {ACADIA_PHONE_DISPLAY}
                          </a>
                          <button
                            onClick={handleCopyPhone}
                            className="p-2 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors"
                            title="Copy phone number"
                          >
                            {copied ? (
                              <Check className="w-5 h-5 text-green-600" />
                            ) : (
                              <Copy className="w-5 h-5" />
                            )}
                          </button>
                        </div>
                        <p className="text-sm text-neutral-400">
                          Just say hi and we'll take it from there!
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="content"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="space-y-6"
              >
                <h1 className="text-5xl sm:text-5xl md:text-6xl font-serif text-neutral-900 leading-[1.1] tracking-tight">
                  A K‑8 math tutor for
                  <br />
                  <span className="italic text-primary-500 inline-block min-h-[2.2em] sm:min-h-0">
                    {typewriterText}
                    <span className="animate-pulse">|</span>
                  </span>
                </h1>
                <p className="text-base sm:text-xl text-neutral-500 max-w-md leading-relaxed">
                  1‑on‑1 AI math tutoring that builds real confidence
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* CTA - always rendered to prevent layout shift */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{
              opacity: step === "creating" || step === "complete" ? 0 : 1,
              pointerEvents:
                step === "creating" || step === "complete" ? "none" : "auto",
            }}
            transition={{ duration: 0.3 }}
            className="space-y-1"
          >
            {/* Fixed height container to prevent layout shift between steps */}
            <div className="h-5">
              <AnimatePresence mode="wait">
                {step === "phone" && (
                  <motion.p
                    key="phone-text"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="ml-2 text-sm text-neutral-500"
                  >
                    Join {trustedFamilies.toLocaleString()}+ families improving
                    in math
                  </motion.p>
                )}
                {step === "verify" && (
                  <motion.p
                    key="verify-text"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="ml-2 text-sm text-neutral-500"
                  >
                    Enter the code we sent to your phone
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
            {step === "verify" || step === "creating" || step === "complete" ? (
              <form onSubmit={handleVerifyCode} className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-2">
                  <div className="w-full sm:flex-1 sm:max-w-xs">
                    <MobileVerificationInput
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      onComplete={submitVerification}
                      placeholder="------"
                      disabled={submitting}
                      autoFocus
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={!codeValid || submitting}
                    aria-label="Verify code"
                    className="h-14 w-full sm:w-auto px-5 bg-primary-500 text-white rounded-xl hover:bg-primary-600 transition-colors disabled:bg-primary-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <div
                        className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <>
                        <span className="sm:hidden">Verify</span>
                        <ArrowRight className="w-5 h-5" aria-hidden="true" />
                      </>
                    )}
                  </button>
                </div>
                {/* Resend code option - fixed height to prevent layout shift */}
                <div className="h-5">
                  {error ? (
                    <p className="text-sm text-red-500">{error}</p>
                  ) : resendCooldown > 0 ? (
                    <p className="text-sm text-neutral-400">
                      Resend code in {resendCooldown}s
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResendCode}
                      disabled={submitting}
                      className="text-sm text-neutral-600 hover:text-neutral-900 font-medium disabled:opacity-50"
                    >
                      Didn't get the code? Resend
                    </button>
                  )}
                </div>
              </form>
            ) : (
              <form onSubmit={handleSendCode} className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-2">
                  <div className="w-full sm:flex-1 sm:max-w-xs">
                    <MobilePhoneInput
                      value={phoneNumber}
                      onChange={(value: string) => {
                        setPhoneNumber(value);
                      }}
                      placeholder="(555) 123-4567"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={!phoneValid || submitting}
                    aria-label="Get started"
                    className="h-14 w-full sm:w-auto px-5 bg-primary-500 text-white rounded-xl hover:bg-primary-600 transition-colors disabled:bg-primary-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <div
                        className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <ArrowRight className="w-5 h-5" aria-hidden="true" />
                    )}
                  </button>
                </div>
                {/* Placeholder to match verify form height and prevent layout shift */}
                <div className="h-5">
                  {error && <p className="text-sm text-red-500">{error}</p>}
                </div>
              </form>
            )}
          </motion.div>

        </div>
      </main>

      {/* Footer */}
      <footer className="py-3 px-5 sm:px-8 shrink-0">
        <div className="max-w-2xl mx-auto flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-neutral-400">
          <span className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" />
            We never sell your data
          </span>
          <span className="text-neutral-300">·</span>
          <Link
            to="/privacy"
            className="hover:text-neutral-600 transition-colors"
          >
            Privacy
          </Link>
          <span className="text-neutral-300">·</span>
          <Link
            to="/terms"
            className="hover:text-neutral-600 transition-colors"
          >
            Terms
          </Link>
          <span className="text-neutral-300">·</span>
          <Link
            to="/coppa"
            className="hover:text-neutral-600 transition-colors"
          >
            COPPA
          </Link>
        </div>
      </footer>
    </div>
  );
}
