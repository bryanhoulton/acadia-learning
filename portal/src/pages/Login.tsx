import React, { useCallback, useEffect, useState } from "react";

import { useActions, useValues } from "kea";
import { ArrowRight, Loader2, Shield } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { Logo } from "../components/Logo";
import {
  MobilePhoneInput,
  MobileVerificationInput,
} from "../components/MobileInputs";
import { authLogic } from "../logic/authLogic";
import { verificationLogic } from "../logic/verificationLogic";

function Login() {
  const { account } = useValues(authLogic);
  const {
    isLoading,
    verificationCode,
    didFail,
    codeSent,
    phoneNumber,
    showAlternatives,
    emailCodeSent,
    supportRequested,
    signingIn,
  } = useValues(verificationLogic);
  const {
    sendVerificationCode,
    verifyCode,
    setVerificationCode,
    setCountryCode,
    setPhoneNumber,
    setReferralCode,
    setRedirectUrl,
    sendEmailVerificationCode,
    verifyEmailCode,
    requestSupportAuth,
  } = useActions(verificationLogic);

  // Local state for full phone number (with country code)
  const [fullPhoneNumber, setFullPhoneNumber] = useState("");

  const [searchParams] = useSearchParams();

  // If already logged in, redirect to the intended destination
  useEffect(() => {
    if (account) {
      const redirect = searchParams.get("redirect");
      window.location.href = redirect || "/";
    }
  }, [account, searchParams]);

  // Extract referral code, phone, and redirect from URL params
  useEffect(() => {
    const refCode = searchParams.get("ref");
    if (refCode) {
      setReferralCode(refCode);
    }

    const redirect = searchParams.get("redirect");
    if (redirect) {
      setRedirectUrl(redirect);
    }

    // Pre-fill phone number if redirected from www with existing account
    const phone = searchParams.get("phone");
    if (phone) {
      // Phone comes URL encoded with country code, e.g. "+15551234567"
      // Extract the country code and number
      const decoded = decodeURIComponent(phone);
      if (decoded.startsWith("+1")) {
        setCountryCode("+1");
        setPhoneNumber(decoded.slice(2)); // Remove +1
      } else if (decoded.startsWith("+")) {
        // Handle other country codes - find where the country code ends
        // Most country codes are 1-3 digits
        const match = decoded.match(/^\+(\d{1,3})/);
        if (match) {
          setCountryCode("+" + match[1]);
          setPhoneNumber(decoded.slice(match[0].length));
        }
      } else {
        setPhoneNumber(decoded);
      }
    }
  }, [searchParams, setReferralCode, setRedirectUrl, setCountryCode, setPhoneNumber]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!phoneNumber) {
        toast.error("Please enter a phone number");
        return;
      }
      await sendVerificationCode(false);
    },
    [phoneNumber, sendVerificationCode],
  );

  // Determine which step we're on
  const step = signingIn
    ? "signingIn"
    : supportRequested
      ? "support"
      : !codeSent
        ? "phone"
        : "verify";

  return (
    <div className="min-h-screen bg-[#fafaf9] flex flex-col">
      {/* Logo - top left */}
      <div className="absolute top-4 left-4 sm:top-8 sm:left-8 z-10">
        <Link to="/" className="flex items-center gap-2">
          <Logo className="w-8 h-8" />
          <span className="font-serif text-xl tracking-tight text-neutral-900">
            Acadia
          </span>
        </Link>
      </div>

      {/* Main content - vertically centered */}
      <main className="flex-1 flex items-center justify-center px-5 sm:px-8">
        <div className="max-w-md w-full relative">
          <AnimatePresence mode="wait">
            {step === "signingIn" ? (
              <motion.div
                key="signingIn"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="space-y-6 text-center"
              >
                <div className="space-y-4">
                  <div className="flex justify-center">
                    <Loader2 className="w-12 h-12 text-primary-500 animate-spin" />
                  </div>
                  <h1 className="text-4xl sm:text-5xl font-serif text-neutral-900 leading-[1.1] tracking-tight">
                    Signing you in...
                  </h1>
                  <p className="text-base sm:text-lg text-neutral-500 leading-relaxed">
                    Just a moment
                  </p>
                </div>
              </motion.div>
            ) : step === "support" ? (
              <motion.div
                key="support"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div className="space-y-2">
                  <h1 className="text-4xl sm:text-5xl font-serif text-neutral-900 leading-[1.1] tracking-tight">
                    Support Requested
                  </h1>
                  <p className="text-base sm:text-lg text-neutral-500 leading-relaxed">
                    We've notified our support team. Please contact us at:
                  </p>
                </div>

                <div className="bg-neutral-50 p-5 rounded-xl border border-neutral-200 space-y-2">
                  <p className="text-lg font-medium text-neutral-900">
                    📧 bryan@acadialearning.org
                  </p>
                  <p className="text-sm text-neutral-500">
                    Mention you need authentication help and provide your phone
                    number.
                  </p>
                </div>

                <button
                  onClick={() => window.location.reload()}
                  className="h-14 w-full px-5 bg-neutral-100 text-neutral-700 rounded-xl hover:bg-neutral-200 transition-colors flex items-center justify-center gap-2 font-medium"
                >
                  Try Again
                </button>
              </motion.div>
            ) : step === "phone" ? (
              <motion.div
                key="phone"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div className="space-y-2">
                  <h1 className="text-4xl sm:text-5xl font-serif text-neutral-900 leading-[1.1] tracking-tight">
                    Welcome back
                  </h1>
                  <p className="text-base sm:text-lg text-neutral-500 leading-relaxed">
                    Sign in with a one-time phone code
                  </p>
                </div>

                <form
                  onSubmit={handleSubmit}
                  className="space-y-3"
                  data-testid="login-form"
                >
                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-2">
                    <div className="flex-1">
                      <MobilePhoneInput
                        value={fullPhoneNumber}
                        placeholder="(555) 123-4567"
                        required
                        onChange={(value) => {
                          setFullPhoneNumber(value);
                          // Extract country code and number for the logic
                          // The value is like "+15551234567"
                          const match = value.match(/^\+(\d{1,3})(.*)$/);
                          if (match) {
                            setCountryCode("+" + match[1]);
                            setPhoneNumber(match[2]);
                          }
                        }}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={!phoneNumber || isLoading}
                      className="h-14 w-full sm:w-auto px-5 bg-primary-500 text-anti-primary rounded-xl hover:bg-primary-600 transition-colors disabled:bg-primary-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      data-testid="login-button"
                    >
                      {isLoading ? (
                        <div className="w-5 h-5 border-2 border-anti-primary/30 border-t-anti-primary rounded-full animate-spin" />
                      ) : (
                        <ArrowRight className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </form>

                <div className="space-y-3 pt-2">
                  <p className="text-sm text-neutral-500">
                    Don't have an account?{" "}
                    <a
                      href="https://acadialearning.org"
                      className="text-primary-600 hover:text-primary-700 font-medium transition-colors"
                    >
                      Get started
                    </a>
                  </p>

                  <button
                    type="button"
                    onClick={() => {
                      if (!phoneNumber) {
                        toast.error(
                          "Please enter a phone number and we'll find the email associated with the account.",
                        );
                        return;
                      }
                      sendEmailVerificationCode();
                    }}
                    className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
                  >
                    📧 Send code to email instead
                  </button>
                </div>
              </motion.div>
            ) : step === "verify" ? (
              <motion.div
                key="verify"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div className="space-y-2">
                  <h1 className="text-4xl sm:text-5xl font-serif text-neutral-900 leading-[1.1] tracking-tight">
                    Enter the code
                  </h1>
                  <p className="text-base sm:text-lg text-neutral-500 leading-relaxed">
                    {emailCodeSent
                      ? "Enter the code sent to your email"
                      : "Enter the code sent to your phone"}
                  </p>
                  {!emailCodeSent && (
                    <p className="text-sm text-neutral-400">
                      Code may take up to 2 minutes to arrive
                    </p>
                  )}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (emailCodeSent) {
                      verifyEmailCode();
                    } else {
                      verifyCode();
                    }
                  }}
                  className="space-y-4"
                  data-testid="login-form"
                >
                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-2">
                    <div className="flex-1">
                      <MobileVerificationInput
                        value={verificationCode}
                        placeholder="------"
                        onChange={(e) => {
                          setVerificationCode(e.target.value);
                        }}
                        onComplete={() => {
                          if (emailCodeSent) {
                            verifyEmailCode();
                          } else {
                            verifyCode();
                          }
                        }}
                        autoFocus
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={
                        !verificationCode ||
                        verificationCode.length !== 6 ||
                        isLoading
                      }
                      className="h-14 w-full sm:w-auto px-5 bg-primary-500 text-anti-primary rounded-xl hover:bg-primary-600 transition-colors disabled:bg-primary-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isLoading ? (
                        <div className="w-5 h-5 border-2 border-anti-primary/30 border-t-anti-primary rounded-full animate-spin" />
                      ) : (
                        <ArrowRight className="w-5 h-5" />
                      )}
                    </button>
                  </div>

                  {didFail && (
                    <div className="space-y-3">
                      <p className="text-sm text-error-500">
                        Invalid code. Please try again.
                      </p>
                      {showAlternatives && !emailCodeSent && (
                        <div className="space-y-2">
                          <p className="text-sm text-neutral-500">
                            Having trouble receiving the SMS?
                          </p>
                          <div className="flex flex-col gap-2">
                            <button
                              type="button"
                              onClick={sendEmailVerificationCode}
                              disabled={isLoading}
                              className="h-12 px-4 bg-neutral-100 text-neutral-700 rounded-xl hover:bg-neutral-200 transition-colors disabled:opacity-50 text-sm font-medium"
                            >
                              📧 Send code to email instead
                            </button>
                            <button
                              type="button"
                              onClick={requestSupportAuth}
                              disabled={isLoading}
                              className="h-12 px-4 bg-neutral-100 text-neutral-700 rounded-xl hover:bg-neutral-200 transition-colors disabled:opacity-50 text-sm font-medium"
                            >
                              💬 Contact support for help
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-3 pt-2">
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => window.location.reload()}
                      className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
                    >
                      ← Back to phone entry
                    </button>
                  </div>
                </form>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </main>

      {/* Footer - hide when signing in */}
      <AnimatePresence>
        {step !== "signingIn" && (
          <motion.footer
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="py-4 px-5 sm:px-8 shrink-0"
          >
            <div className="max-w-2xl mx-auto flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-neutral-400">
              <span className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" />
                We never sell your data
              </span>
              <span className="text-neutral-300">·</span>
              <a
                href="https://acadialearning.org/privacy"
                className="hover:text-neutral-600 transition-colors"
              >
                Privacy
              </a>
              <span className="text-neutral-300">·</span>
              <a
                href="https://acadialearning.org/terms"
                className="hover:text-neutral-600 transition-colors"
              >
                Terms
              </a>
              <span className="text-neutral-300">·</span>
              <a
                href="https://acadialearning.org/coppa"
                className="hover:text-neutral-600 transition-colors"
              >
                COPPA
              </a>
            </div>
          </motion.footer>
        )}
      </AnimatePresence>
    </div>
  );
}

export default Login;
