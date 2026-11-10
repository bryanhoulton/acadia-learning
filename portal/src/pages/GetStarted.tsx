import { useMemo, useState } from "react";
import { useActions, useValues } from "kea";
import { ArrowRight, Check, Copy, MessageCircle } from "lucide-react";
import { motion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";

import { AuthShell } from "../components/AuthShell";
import { Logo } from "../components/Logo";
import { authLogic } from "../logic/authLogic";

const ACADIA_PHONE = "+14155838050";
const ACADIA_PHONE_DISPLAY = "(415) 583-8050";
const SMS_BODY = "Hi!";
const SMS_LINK = `sms:${ACADIA_PHONE}?body=${encodeURIComponent(SMS_BODY)}`;

// Detect if user is on a mobile device
const useIsMobile = () => {
  return useMemo(() => {
    if (typeof window === "undefined") return false;
    const userAgent =
      navigator.userAgent || navigator.vendor || (window as Window & typeof globalThis & { opera?: string }).opera || "";
    // Check for mobile devices
    return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
      userAgent.toLowerCase()
    );
  }, []);
};

export function GetStarted() {
  const { account, isProfileRequestLoading } = useValues(authLogic);
  const { createProfile } = useActions(authLogic);
  const [name, setName] = useState("");
  const [copied, setCopied] = useState(false);
  const isMobile = useIsMobile();

  // Check if user has sent an SMS first
  const hasTextedTutor = account?.has_texted_tutor || false;

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createProfile({
      name: name.trim(),
      profile_type: "student",
    });
  };

  return (
    <div className="fixed inset-0 bg-[#fafaf9] flex flex-col">
      {/* Main content - vertically centered */}
      <main className="flex-1 flex items-center justify-center px-5 sm:px-8">
        <div className="max-w-2xl w-full space-y-8 sm:space-y-12">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="space-y-6"
          >
            <header className="mb-4 sm:mb-8">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1 bg-primary rounded-lg">
                  <Logo className="w-6 h-6 sm:w-8 sm:h-8" />
                </div>
                <span className="font-serif text-xl sm:text-2xl tracking-tight text-neutral-900">
                  Acadia
                </span>
              </div>
            </header>

            <h1 className="text-3xl sm:text-5xl md:text-6xl font-serif text-neutral-900 leading-[1.1] tracking-tight">
              {hasTextedTutor ? (
                <>
                  Almost there...
                  <br />
                  <span className="italic">who's learning?</span>
                </>
              ) : (
                <>
                  One last step...
                  <br />
                  <span className="italic">meet your tutor!</span>
                </>
              )}
            </h1>
            <p className="text-base sm:text-xl text-neutral-500 max-w-md leading-relaxed">
              {hasTextedTutor
                ? "Enter your student's name to create their profile and access the classroom."
                : "Text your tutor to get started. They'll get your first session scheduled."}
            </p>
          </motion.div>

          {/* Form/Instructions */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.8 }}
          >
            {hasTextedTutor ? (
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-2">
                  <div className="w-full sm:flex-1 sm:max-w-xs">
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Student's name"
                      disabled={isProfileRequestLoading}
                      className="w-full h-14 px-4 bg-white border border-neutral-200 rounded-xl text-base placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                      autoFocus
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={!name.trim() || isProfileRequestLoading}
                    aria-label="Get started"
                    className="h-14 w-full sm:w-auto px-5 bg-primary-500 text-white rounded-xl hover:bg-primary-600 transition-colors disabled:bg-primary-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isProfileRequestLoading ? (
                      <div
                        className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <ArrowRight className="w-5 h-5" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </form>
            ) : isMobile ? (
              <a
                href={SMS_LINK}
                className="inline-flex h-14 px-8 bg-neutral-900 text-white rounded-xl hover:bg-neutral-800 transition-colors items-center justify-center gap-3 font-medium text-lg"
              >
                <MessageCircle className="w-5 h-5" />
                Open Messages
              </a>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row gap-6 items-center">
                  {/* QR Code */}
                  <div className="p-4">
                    <QRCodeSVG
                      value={SMS_LINK}
                      size={160}
                      level="H"
                      bgColor="transparent"
                      fgColor="#00a071"
                    />
                  </div>

                  {/* Instructions */}
                  <div className="space-y-4">
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
              </div>
            )}
          </motion.div>
        </div>
      </main>
    </div>
  );
}

// Wrapped version for direct route access
export function GetStartedPage() {
  return (
    <AuthShell>
      <GetStarted />
    </AuthShell>
  );
}
