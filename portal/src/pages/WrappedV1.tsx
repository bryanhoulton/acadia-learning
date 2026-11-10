/**
 * DESIGN OPTION 1: "Brutalist" with Custom Math Visuals
 *
 * Uses custom mathematical visualizations with raw, industrial typography
 * High contrast, stark layouts, bold blocky shapes
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { toPng } from 'html-to-image';
import {
  AlertCircle,
  ArrowRight,
  Download,
  Heart,
  Share,
} from 'lucide-react';
import {
  AnimatePresence,
  motion,
} from 'motion/react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';

import LoadingState from '../components/LoadingState';
import { Logo } from '../components/Logo';
import {
  ConstellationBackground,
  FractalTreeBackground,
  OrbitingParticlesBackground,
  PendulumWaveBackground,
  RadialBurstBackground,
  SineWaveBackground,
} from '../components/MathVisuals';
import client from '../utils/api';

interface WrappedData {
  student_name: string;
  period: string;
  year: number;
  total_hours: number;
  total_sessions: number;
  favorite_time: string;
  favorite_day: string;
  favorite_time_comment: string;
  max_streak: number;
  streak_dates: string;
  main_breakthrough: {
    title: string;
    description: string;
    date: string;
  };
  tutor_observations: Array<{
    emoji: string;
    observation: string;
  }>;
}

// Brutalist palette
const BRAND = {
  primary: "#00a071",
  secondary: "#0a0a0a",
};

function IntroSlide({
  data,
  onNext,
}: {
  data: WrappedData;
  onNext: () => void;
}) {
  return (
    <motion.div
      className="relative flex flex-col items-center justify-center h-full text-center px-8"
      style={{ backgroundColor: BRAND.primary }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <OrbitingParticlesBackground color="white" />

      <div className="relative z-10">
        <motion.div
          className="border-4 border-white px-6 py-2 mb-8 inline-block"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <span className="text-white text-sm font-bold tracking-widest uppercase">
            {data.period} Review
          </span>
        </motion.div>

        <motion.h1
          className="text-6xl md:text-8xl font-black text-white mb-6 tracking-tighter"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          {data.student_name}
        </motion.h1>

        <motion.p
          className="text-white/90 text-xl mb-12 max-w-md mx-auto italic"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
        >
          An amazing year of learning
        </motion.p>

        <motion.button
          onClick={onNext}
          className="group flex items-center gap-3 bg-black text-white px-10 py-5 font-black uppercase tracking-wide border-4 border-white hover:bg-white hover:text-black transition-colors mx-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
          whileTap={{ scale: 0.98 }}
        >
          <span>Begin</span>
          <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </motion.button>
      </div>
    </motion.div>
  );
}

function TotalTimeSlide({
  data,
  onNext,
}: {
  data: WrappedData;
  onNext: () => void;
}) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const target = Math.round(data.total_hours);
    const duration = 1500;
    const steps = 60;
    const increment = target / steps;
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [data.total_hours]);

  return (
    <motion.div
      className="relative flex flex-col h-full px-8 py-16 cursor-pointer"
      style={{ backgroundColor: BRAND.secondary }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onNext}
    >
      <PendulumWaveBackground color="white" />

      <div className="relative z-10 flex-1 flex flex-col justify-center">
        <motion.div
          className="border-l-4 border-white pl-4 mb-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <span className="text-white/90 text-sm font-bold uppercase tracking-wide">
            Time Learning
          </span>
        </motion.div>

        <div className="mb-8">
          <motion.span
            className="text-[140px] md:text-[200px] font-black text-white leading-none block tracking-tighter"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {count}
          </motion.span>
          <span className="text-4xl md:text-5xl font-black text-white/90 tracking-tight">
            hours
          </span>
        </div>
      </div>

      <motion.div
        className="relative z-10 grid grid-cols-2 gap-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <div className="bg-white p-5 border-4 border-white">
          <div className="text-4xl font-black text-black tracking-tighter">
            {data.total_sessions}
          </div>
          <div className="text-black/60 text-sm font-semibold">sessions</div>
        </div>
        <div className="bg-transparent p-5 border-4 border-white">
          <div className="text-4xl font-black text-white tracking-tighter">
            {Math.round((data.total_hours * 60) / data.total_sessions)}
          </div>
          <div className="text-white/60 text-sm font-semibold">avg minutes</div>
        </div>
      </motion.div>

      <motion.p
        className="relative z-10 text-center text-white/40 text-sm mt-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
      >
        Tap to continue →
      </motion.p>
    </motion.div>
  );
}

function FavoriteTimeSlide({
  data,
  onNext,
}: {
  data: WrappedData;
  onNext: () => void;
}) {
  return (
    <motion.div
      className="relative flex flex-col items-center justify-center h-full text-center px-8 cursor-pointer"
      style={{ backgroundColor: "#FF6B35" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onNext}
    >
      <SineWaveBackground color="white" />

      <div className="relative z-10">
        <motion.div
          className="bg-black px-6 py-2 mb-8 inline-block"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <span className="text-white text-sm font-bold tracking-wide uppercase">
            Your Favorite Time
          </span>
        </motion.div>

        <motion.div
          className="bg-white px-10 py-8 mb-6 border-8 border-black"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.4, type: "spring" }}
        >
          <div className="text-6xl md:text-7xl font-black text-black mb-2 tracking-tighter">
            {data.favorite_time}
          </div>
          <div className="text-xl text-black/70 font-bold border-t-4 border-black pt-3 mt-3">
            {data.favorite_day}s
          </div>
        </motion.div>

        <motion.p
          className="text-white text-lg max-w-sm italic leading-relaxed"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          "{data.favorite_time_comment}"
        </motion.p>
      </div>

      <motion.p
        className="absolute bottom-8 text-white/40 text-sm z-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
      >
        Tap to continue →
      </motion.p>
    </motion.div>
  );
}

function StreakSlide({
  data,
  onNext,
}: {
  data: WrappedData;
  onNext: () => void;
}) {
  return (
    <motion.div
      className="relative flex flex-col items-center justify-center h-full text-center px-8 cursor-pointer"
      style={{ backgroundColor: "#F59E0B" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onNext}
    >
      <FractalTreeBackground color="white" />

      <div className="relative z-10">
        <motion.div
          className="border-4 border-black bg-black px-6 py-2 mb-6 inline-block"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <span className="text-white text-sm font-bold tracking-wide uppercase">
            Longest Streak
          </span>
        </motion.div>

        <motion.div
          className="text-[160px] md:text-[220px] font-black text-black leading-none tracking-tighter"
          style={{
            textShadow: "8px 8px 0 white",
          }}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.4, type: "spring" }}
        >
          {data.max_streak}
        </motion.div>

        <motion.p
          className="text-black text-2xl font-black tracking-tight -mt-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          days straight
        </motion.p>

        {data.streak_dates && (
          <motion.div
            className="mt-8 bg-black px-6 py-3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
          >
            <span className="text-white text-sm">{data.streak_dates}</span>
          </motion.div>
        )}
      </div>

      <motion.p
        className="absolute bottom-8 text-black/40 text-sm z-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
      >
        Tap to continue →
      </motion.p>
    </motion.div>
  );
}

function BreakthroughSlide({
  data,
  onNext,
}: {
  data: WrappedData;
  onNext: () => void;
}) {
  return (
    <motion.div
      className="relative flex flex-col items-center justify-center h-full px-8 cursor-pointer"
      style={{ backgroundColor: BRAND.primary }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onNext}
    >
      <RadialBurstBackground color="white" />

      <div className="relative z-10 w-full max-w-lg text-center">
        <motion.div
          className="bg-white px-6 py-2 mb-6 inline-block"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <span className="text-black text-sm font-bold tracking-wide uppercase">
            Biggest Win
          </span>
        </motion.div>

        <motion.h2
          className="text-4xl md:text-5xl font-black text-white mb-8 leading-tight tracking-tight"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5 }}
        >
          {data.main_breakthrough.title}
        </motion.h2>

        <motion.div
          className="bg-white p-8 text-left border-8 border-black"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <p className="text-black text-lg leading-relaxed mb-4">
            {data.main_breakthrough.description}
          </p>
          {data.main_breakthrough.date && (
            <p className="text-black/50 text-sm border-t-4 border-black pt-3 mt-4">
              {data.main_breakthrough.date}
            </p>
          )}
        </motion.div>
      </div>

      <motion.p
        className="absolute bottom-8 text-white/40 text-sm z-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
      >
        Tap to continue →
      </motion.p>
    </motion.div>
  );
}

function TutorObservationsSlide({
  data,
  onNext,
}: {
  data: WrappedData;
  onNext: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const observations = data.tutor_observations;
  const currentObs = observations[currentIndex];

  const handleTap = () => {
    if (currentIndex < observations.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      onNext();
    }
  };

  return (
    <motion.div
      className="relative flex flex-col h-full px-8 py-16 cursor-pointer"
      style={{ backgroundColor: "#0a0a0a" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={handleTap}
    >
      <ConstellationBackground color={BRAND.primary} />

      {/* Header */}
      <div className="relative z-10 shrink-0 mb-8">
        <motion.div
          className="border-l-4 border-white pl-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <span className="text-white/70 text-xs font-bold uppercase tracking-wide">
            From the Tutor
          </span>
        </motion.div>
      </div>

      {/* Main content - single observation */}
      <div className="relative z-10 flex-1 flex flex-col justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="text-center"
          >
            <span className="text-6xl mb-6 block">{currentObs.emoji}</span>
            <p className="text-white text-2xl md:text-3xl leading-relaxed font-medium max-w-lg mx-auto">
              "{currentObs.observation}"
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Progress dots */}
      <div className="relative z-10 flex justify-center gap-2 mt-8">
        {observations.map((_, i) => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full transition-colors ${
              i === currentIndex ? "bg-white" : "bg-white/30"
            }`}
          />
        ))}
      </div>

      <motion.p
        className="relative z-10 text-center text-white/40 text-sm mt-6 shrink-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
      >
        {currentIndex < observations.length - 1
          ? "Tap for next →"
          : "Tap to continue →"}
      </motion.p>
    </motion.div>
  );
}

// Shareable card component (rendered off-screen for image capture)
function ShareableCard({
  data,
  cardRef,
}: {
  data: WrappedData;
  cardRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={cardRef}
      className="w-[400px] p-8 flex flex-col"
      style={{ backgroundColor: BRAND.primary }}
    >
      {/* Logo + Header */}
      <div className="flex items-center justify-center gap-3 mb-6">
        <Logo className="w-12 h-12 rounded-lg" />
        <span className="text-white text-2xl font-black tracking-tight">
          Acadia Learning
        </span>
      </div>

      {/* Name + Period */}
      <div className="text-center mb-6">
        <div className="inline-block border-4 border-white px-4 py-1 mb-4">
          <span className="text-white text-xs font-bold tracking-wide uppercase">
            {data.period} Review
          </span>
        </div>
        <h2 className="text-4xl font-black text-white tracking-tight mb-2">
          {data.student_name}
        </h2>
        <p className="text-white/80 text-sm italic">
          An amazing year of learning
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white p-4 text-center">
          <div className="text-3xl font-black text-black tracking-tighter">
            {Math.round(data.total_hours)}h
          </div>
          <div className="text-black/60 text-xs font-semibold">learning</div>
        </div>
        <div className="bg-black p-4 text-center">
          <div className="text-3xl font-black text-white tracking-tighter">
            {data.max_streak}
          </div>
          <div className="text-white/60 text-xs font-semibold">day streak</div>
        </div>
        <div className="bg-white p-4 text-center">
          <div className="text-3xl font-black text-black tracking-tighter">
            {data.total_sessions}
          </div>
          <div className="text-black/60 text-xs font-semibold">sessions</div>
        </div>
      </div>

      {/* Breakthrough */}
      {data.main_breakthrough && (
        <div className="bg-white p-4 mb-6 border-l-8 border-black">
          <div className="text-xs font-bold text-black/50 uppercase mb-1">
            Biggest Win
          </div>
          <div className="text-sm font-bold text-black">
            {data.main_breakthrough.title}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-center mt-auto pt-4 border-t-2 border-white/30">
        <p className="text-white/90 text-sm font-semibold">
          AcadiaLearning.org
        </p>
        <p className="text-white/60 text-xs mt-1">
          AI-powered tutoring for every student
        </p>
      </div>
    </div>
  );
}

function FinalSlide({ data }: { data: WrappedData }) {
  const shareCardRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const generateImage = async (): Promise<Blob | null> => {
    if (!shareCardRef.current) return null;

    try {
      const dataUrl = await toPng(shareCardRef.current, {
        quality: 1,
        pixelRatio: 2,
      });

      // Convert data URL to blob
      const response = await fetch(dataUrl);
      return await response.blob();
    } catch (error) {
      console.error("Error generating image:", error);
      return null;
    }
  };

  const handleShare = async () => {
    setIsGenerating(true);

    try {
      const blob = await generateImage();
      if (!blob) {
        toast.error("Failed to generate image");
        return;
      }

      const file = new File(
        [blob],
        `${data.student_name}-wrapped-${data.year}.png`,
        {
          type: "image/png",
        }
      );

      // Check if Web Share API is available and supports files
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: `${data.student_name}'s ${data.year} Year of Learning`,
          text: `Check out ${data.student_name}'s ${data.year} year of learning with Acadia!`,
          files: [file],
        });
        toast.success("Shared successfully!");
      } else {
        // Fallback: download the image
        handleDownload();
      }
    } catch (error) {
      // User cancelled share or error occurred
      if ((error as Error).name !== "AbortError") {
        console.error("Share failed:", error);
        toast.error("Share failed. Try downloading instead.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async () => {
    setIsGenerating(true);

    try {
      const blob = await generateImage();
      if (!blob) {
        toast.error("Failed to generate image");
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${data.student_name}-wrapped-${data.year}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Image downloaded!");
    } catch (error) {
      console.error("Download failed:", error);
      toast.error("Failed to download image");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <motion.div
      className="relative flex flex-col items-center justify-center h-full text-center px-8"
      style={{ backgroundColor: "#0a0a0a" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <OrbitingParticlesBackground color={BRAND.primary} />

      {/* Hidden shareable card for image generation */}
      <div className="fixed -left-[9999px] -top-[9999px]">
        <ShareableCard data={data} cardRef={shareCardRef} />
      </div>

      <div className="relative z-10">
        <motion.h2
          className="text-4xl md:text-6xl font-black mb-4 tracking-tighter"
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <span className="text-white">Here's to</span>
          <br />
          <span
            className="inline-block border-b-8 text-6xl md:text-8xl"
            style={{ color: BRAND.primary, borderColor: BRAND.primary }}
          >
            {data.student_name.split(" ")[0]}
          </span>
        </motion.h2>

        <motion.p
          className="text-white/60 text-xl mb-8 italic"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          I can't wait to keep learning with you in 2026!
        </motion.p>

        <motion.div
          className="flex gap-4 justify-center mb-10"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
        >
          <div className="bg-white px-6 py-5 text-center border-4 border-white">
            <div className="text-3xl font-black text-black tracking-tighter">
              {Math.round(data.total_hours)}h
            </div>
            <div className="text-black/60 text-xs font-semibold mt-1">
              learning
            </div>
          </div>
          <div className="bg-transparent px-6 py-5 text-center border-4 border-white">
            <div className="text-3xl font-black text-white tracking-tighter">
              {data.max_streak}
            </div>
            <div className="text-white/60 text-xs font-semibold mt-1">
              day streak
            </div>
          </div>
          <div className="bg-transparent px-6 py-5 text-center border-4 border-white">
            <div className="text-3xl font-black text-white tracking-tighter">
              {data.total_sessions}
            </div>
            <div className="text-white/60 text-xs font-semibold mt-1">
              sessions
            </div>
          </div>
        </motion.div>

        {/* Share/Download buttons */}
        <motion.div
          className="flex gap-4 justify-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2 }}
        >
          <button
            onClick={handleShare}
            disabled={isGenerating}
            className="flex items-center gap-2 bg-white text-black px-6 py-3 font-bold hover:bg-white/90 transition-colors disabled:opacity-50 border-4 border-white"
          >
            <Share className="w-5 h-5" />
            <span>{isGenerating ? "Generating..." : "Share"}</span>
          </button>
          <button
            onClick={handleDownload}
            disabled={isGenerating}
            className="flex items-center gap-2 bg-transparent text-white px-6 py-3 font-bold border-4 border-white hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <Download className="w-5 h-5" />
            <span>Download</span>
          </button>
        </motion.div>
      </div>

      <motion.div
        className="absolute bottom-8 flex items-center gap-2 text-white/50 text-sm z-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
      >
        <Heart className="w-4 h-4" style={{ color: BRAND.primary }} />
        <span>Acadia</span>
      </motion.div>
    </motion.div>
  );
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="fixed top-0 left-0 right-0 h-2 bg-black z-50 flex">
      {Array.from({ length: total }).map((_, i) => (
        <motion.div
          key={i}
          className="flex-1 border-r-2 border-black last:border-r-0"
          style={{
            backgroundColor:
              i <= current ? BRAND.primary : "rgba(255,255,255,0.1)",
          }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.2, delay: i * 0.05 }}
        />
      ))}
    </div>
  );
}

export function WrappedV1() {
  const { profileId, year } = useParams<{ profileId: string; year: string }>();
  const [slideIndex, setSlideIndex] = useState(0);
  const [wrappedData, setWrappedData] = useState<WrappedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const totalSlides = 7;

  useEffect(() => {
    async function fetchWrapped() {
      if (!profileId || !year) {
        setError("Missing profile ID or year");
        setLoading(false);
        return;
      }

      setLoading(true);
      const { data, error: fetchError } = await client.GET(
        "/api/lms/accounts/profiles/{profile_id}/wrapped/{year}/",
        {
          params: { path: { profile_id: profileId, year: parseInt(year) } },
        }
      );

      if (fetchError) {
        console.error(fetchError);
        setError("Could not load your wrapped. It may not be available yet.");
        toast.error("Failed to load wrapped data");
        setLoading(false);
        return;
      }

      setWrappedData(data.data as WrappedData);
      setLoading(false);
    }

    fetchWrapped();
  }, [profileId, year]);

  const nextSlide = useCallback(() => {
    if (slideIndex < totalSlides - 1) {
      setSlideIndex((prev) => prev + 1);
    }
  }, [slideIndex, totalSlides]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        nextSlide();
      } else if (e.key === "ArrowLeft" && slideIndex > 0) {
        setSlideIndex((prev) => prev - 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [slideIndex, nextSlide]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-gray-900 flex items-center justify-center">
        <LoadingState
          message="Loading your wrapped..."
          className="text-white"
        />
      </div>
    );
  }

  if (error || !wrappedData) {
    return (
      <div className="fixed inset-0 bg-gray-900 flex items-center justify-center px-8">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">
            Wrapped Not Found
          </h2>
          <p className="text-white/60">
            {error || "Could not load your wrapped."}
          </p>
        </div>
      </div>
    );
  }

  const slides = [
    <IntroSlide key="intro" data={wrappedData} onNext={nextSlide} />,
    <TotalTimeSlide key="time" data={wrappedData} onNext={nextSlide} />,
    <FavoriteTimeSlide key="favorite" data={wrappedData} onNext={nextSlide} />,
    <StreakSlide key="streak" data={wrappedData} onNext={nextSlide} />,
    <BreakthroughSlide
      key="breakthrough"
      data={wrappedData}
      onNext={nextSlide}
    />,
    <TutorObservationsSlide
      key="tutor"
      data={wrappedData}
      onNext={nextSlide}
    />,
    <FinalSlide key="final" data={wrappedData} />,
  ];

  return (
    <div className="fixed inset-0 overflow-hidden select-none">
      <ProgressBar current={slideIndex} total={totalSlides} />
      <AnimatePresence mode="wait">{slides[slideIndex]}</AnimatePresence>
    </div>
  );
}
