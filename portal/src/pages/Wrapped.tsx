import { useEffect, useState } from "react";

import { AlertCircle, Gift } from "lucide-react";
import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";

import LoadingState from "../components/LoadingState";
import { Logo } from "../components/Logo";
import client from "../utils/api";

interface WrappedItem {
  id: string;
  profile_id: string;
  profile_name: string;
  year: number;
  created_at: string;
}

const BRAND = {
  primary: "#00a071",
};

export function Wrapped() {
  const navigate = useNavigate();
  const [wraps, setWraps] = useState<WrappedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchWraps() {
      setLoading(true);
      const { data, error: fetchError } = await client.GET(
        "/api/lms/accounts/wrapped/"
      );

      if (fetchError) {
        console.error(fetchError);
        setError("Could not load your wraps. Please try again later.");
        setLoading(false);
        return;
      }

      const wrapsData = data as WrappedItem[];
      setWraps(wrapsData);

      // If there's exactly one wrap, redirect to it automatically
      if (wrapsData.length === 1) {
        const wrap = wrapsData[0];
        navigate(`/wrapped/${wrap.profile_id}/${wrap.year}`, { replace: true });
        return;
      }

      setLoading(false);
    }

    fetchWraps();
  }, [navigate]);

  if (loading) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center"
        style={{ backgroundColor: "#0a0a0a" }}
      >
        <LoadingState message="Loading your wraps..." className="text-white" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center px-8"
        style={{ backgroundColor: "#0a0a0a" }}
      >
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">
            Something went wrong
          </h2>
          <p className="text-white/60">{error}</p>
        </div>
      </div>
    );
  }

  if (wraps.length === 0) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center px-8"
        style={{ backgroundColor: "#0a0a0a" }}
      >
        <div className="text-center">
          <Gift className="w-16 h-16 text-white/40 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">
            No Wraps Available
          </h2>
          <p className="text-white/60">
            Your year in learning summary isn't ready yet. Check back soon!
          </p>
        </div>
      </div>
    );
  }

  // Multiple wraps - show picker
  return (
    <div
      className="fixed inset-0 overflow-auto"
      style={{ backgroundColor: "#0a0a0a" }}
    >
      <div className="min-h-full flex flex-col items-center justify-center px-6 py-12">
        <motion.div
          className="w-full max-w-md"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {/* Header */}
          <div className="flex items-center justify-center gap-3 mb-8">
            <Logo className="w-10 h-10 rounded-lg" />
            <span className="text-white text-xl font-bold tracking-tight">
              Acadia Learning
            </span>
          </div>

          <motion.div
            className="text-center mb-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <h1 className="text-3xl font-black text-white mb-2 tracking-tight">
              Your Year in Learning
            </h1>
            <p className="text-white/60">
              Choose which summary you'd like to view
            </p>
          </motion.div>

          {/* Wrap cards */}
          <div className="space-y-3">
            {wraps.map((wrap, index) => (
              <motion.button
                key={wrap.id}
                onClick={() =>
                  navigate(`/wrapped/${wrap.profile_id}/${wrap.year}`)
                }
                className="w-full text-left p-5 border-4 border-white/20 hover:border-white transition-colors group"
                style={{ backgroundColor: "transparent" }}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + index * 0.1 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-white font-bold text-lg group-hover:text-white/90">
                      {wrap.profile_name}
                    </div>
                    <div className="text-white/50 text-sm">{wrap.year}</div>
                  </div>
                  <div
                    className="w-10 h-10 flex items-center justify-center rounded-full"
                    style={{ backgroundColor: BRAND.primary }}
                  >
                    <Gift className="w-5 h-5 text-white" />
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

