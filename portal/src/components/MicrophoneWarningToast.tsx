import {
  AlertTriangle,
  ChevronRight,
  Mic,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';

type Variant = "pill" | "classic" | "banner";

type MicrophoneWarningToastProps = {
  onOpenSettings: () => void;
  variant?: Variant;
};

export function MicrophoneWarningToast({
  onOpenSettings,
  variant = "pill", // Try "pill", "classic", or "banner"
}: MicrophoneWarningToastProps) {
  
  // Variant 1: Floating Pill (Modern, Minimal, Dark)
  // Good for not obstructing the UI, looks like a system notification
  if (variant === "pill") {
    return (
      <motion.div
        initial={{ y: -20, opacity: 0, scale: 0.9 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: -20, opacity: 0, scale: 0.9 }}
        transition={{ type: "spring", duration: 0.5 }}
        className="fixed top-6 left-1/2 -translate-x-1/2 z-50"
      >
        <div className="bg-neutral-900/90 backdrop-blur-md text-white pl-4 pr-2 py-2 rounded-full shadow-2xl border border-white/10 flex items-center gap-3">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <span className="text-sm font-medium">No audio detected</span>
          <div className="h-4 w-px bg-white/20 mx-1" />
          <button
            onClick={onOpenSettings}
            className="text-xs font-semibold hover:bg-white/10 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1.5"
          >
            Check Settings <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </motion.div>
    );
  }

  // Variant 2: Classic Toast (Clean, Professional, Side)
  // Standard SaaS look, informative but not alarming
  if (variant === "classic") {
    return (
      <motion.div
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: -20, opacity: 0 }}
        className="fixed bottom-6 left-6 z-50 w-80"
      >
        <div className="bg-white rounded-lg shadow-lg border border-gray-100 p-4 flex gap-3">
          <div className="bg-orange-100 p-2 rounded-md h-fit">
            <AlertTriangle className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-gray-900">Microphone Issue</h4>
            <p className="text-xs text-gray-500 mt-1 mb-3">
              We aren't receiving any audio.
            </p>
            <button
              onClick={onOpenSettings}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              Troubleshoot &rarr;
            </button>
          </div>
          <button className="text-gray-400 hover:text-gray-600 ml-auto h-fit">
            <X className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    );
  }

  // Variant 3: Banner (High visibility, Top or embedded)
  // Good for critical errors that must be addressed
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="fixed bottom-20 left-6 z-50"
    >
      <div className="bg-red-50 text-red-900 border border-red-100 px-4 py-3 rounded-md flex items-center gap-3 shadow-sm">
        <Mic className="w-4 h-4 text-red-500" />
        <span className="text-sm font-medium">Microphone seems quiet.</span>
        <button
          onClick={onOpenSettings}
          className="text-sm font-bold underline decoration-red-300 underline-offset-2 hover:decoration-red-500"
        >
          Fix it
        </button>
      </div>
    </motion.div>
  );
}
