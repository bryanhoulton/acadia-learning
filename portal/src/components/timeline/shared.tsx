import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';

export function LoadingScreen({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center">
        <motion.div
          className="w-8 h-8 rounded-full border-2 border-neutral-200 border-t-neutral-900 mx-auto"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        />
        <p className="text-neutral-400 text-sm mt-4">{message}</p>
      </div>
    </div>
  );
}

export function LoadingSpinner() {
  return (
    <motion.div
      className="w-5 h-5 rounded-full border-2 border-neutral-200 border-t-neutral-600"
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
    />
  );
}

export function AccessDenied() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <motion.div
        className="text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <Lock size={24} className="text-red-500" />
        </div>
        <h1 className="text-lg font-semibold text-neutral-900 mb-1">Access Denied</h1>
        <p className="text-neutral-400 text-sm">
          This page is only available to admin accounts.
        </p>
      </motion.div>
    </div>
  );
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-1.5">
      {children}
    </div>
  );
}

export function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="text-sm text-neutral-700 bg-neutral-50 rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-words max-h-60 overflow-y-auto border border-neutral-100 leading-relaxed">
      {children}
    </pre>
  );
}
