import { motion } from "framer-motion";
import { ArrowLeft, Home } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { Logo } from "../components/Logo";

export function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#fafaf9] flex flex-col">
      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6">
        {/* Animated 404 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="text-center"
        >
          {/* Large 404 with floating animation */}
          <motion.div
            animate={{
              y: [0, -10, 0],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="relative mb-8"
          >
            {/* Background blur decoration */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-48 h-48 bg-primary-200/30 rounded-full blur-3xl" />
            </div>

            {/* 404 with logo in the middle */}
            <div className="relative flex items-center justify-center gap-2 sm:gap-4">
              <span className="text-[120px] sm:text-[180px] font-serif font-bold text-neutral-200 leading-none select-none">
                4
              </span>
              <motion.div
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{
                  duration: 6,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="w-20 h-20 sm:w-28 sm:h-28 rounded-3xl bg-primary-500 flex items-center justify-center shadow-lg shadow-primary-500/20"
              >
                <Logo className="w-12 h-12 sm:w-16 sm:h-16" />
              </motion.div>
              <span className="text-[120px] sm:text-[180px] font-serif font-bold text-neutral-200 leading-none select-none">
                4
              </span>
            </div>
          </motion.div>

          {/* Message */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="space-y-3 mb-10"
          >
            <h1 className="font-serif text-2xl sm:text-3xl text-neutral-800">
              Oops! Page not found
            </h1>
            <p className="text-neutral-500 max-w-md mx-auto">
              Looks like this page wandered off. Let's get you back on track to
              finding the perfect tutor for your child.
            </p>
          </motion.div>

          {/* Action buttons */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-3"
          >
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full text-neutral-600 hover:text-neutral-800 hover:bg-neutral-100 transition-all duration-200 group"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              <span>Go back</span>
            </button>

            <Link
              to="/"
              className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-primary-500 text-white hover:bg-primary-600 transition-all duration-200 shadow-md shadow-primary-500/20 hover:shadow-lg hover:shadow-primary-500/30 group"
            >
              <Home className="w-4 h-4" />
              <span>Back to home</span>
            </Link>
          </motion.div>
        </motion.div>

        {/* Decorative elements */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 1 }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2"
        >
          <div className="flex items-center gap-2 text-neutral-400 text-sm">
            <div className="w-8 h-px bg-neutral-300" />
            <span>Lost? We'll help you find your way</span>
            <div className="w-8 h-px bg-neutral-300" />
          </div>
        </motion.div>
      </main>
    </div>
  );
}
