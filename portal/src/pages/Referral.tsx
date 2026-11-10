import { useEffect, useState } from "react";

import { ArrowRight } from "lucide-react";
import posthog from "posthog-js";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "slate-ui";
import { toast } from "sonner";

import LoadingState from "../components/LoadingState";
import { Logo } from "../components/Logo";
import client from "../utils/api";

export function Referral() {
  const { referralCode } = useParams<{ referralCode: string }>();
  const navigate = useNavigate();
  const [referrerName, setReferrerName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [validCode, setValidCode] = useState(false);

  useEffect(() => {
    if (!referralCode) {
      window.location.href = "https://acadialearning.org/evaluation";
      return;
    }

    // Fetch referral info and track the click
    const fetchReferralInfo = async () => {
      try {
        // Get referral info
        const { data, error } = await client.GET(
          "/api/lms/accounts/referral-info/{referral_code}/",
          {
            params: { path: { referral_code: referralCode } },
          }
        );

        if (error || !data?.success) {
          toast.error("Invalid referral link");
          window.location.href = "https://acadialearning.org/evaluation";
          return;
        }

        setReferrerName(data.referrer_name);
        setValidCode(true);

        // Track the click in PostHog
        posthog.capture("referral_link_clicked", {
          referral_code: referralCode,
          referrer_name: data.referrer_name,
        });
      } catch (err) {
        console.error("Error fetching referral info:", err);
        toast.error("Invalid referral link");
        window.location.href = "https://acadialearning.org/evaluation";
      } finally {
        setLoading(false);
      }
    };

    fetchReferralInfo();
  }, [referralCode]);

  if (loading) {
    return <LoadingState className="h-screen" />;
  }

  if (!validCode) {
    return null;
  }

  return (
    <div className="px-4 min-h-dvh flex flex-col items-center gap-4 justify-center">
      <div className="space-y-4 max-w-md text-center">
        <div className="flex flex-col items-center gap-2">
          <Logo />

          <h1 className="text-black text-3xl font-sans font-medium mt-2">
            You've been invited!
          </h1>
          <p className="text-gray-600 text-sm">
            <span className="font-semibold text-primary-600">
              {referrerName}
            </span>{" "}
            invited you to try Acadia Learning
          </p>
        </div>

        <Button
          variant="primary"
          onClick={() => {
            // Redirect to the optimized evaluation flow on the www site
            window.location.href = `https://acadialearning.org/evaluation?ref=${referralCode}`;
          }}
          className="w-full"
          iconRight={ArrowRight}
        >
          Book a Free Lesson
        </Button>

        <p className="text-sm text-gray-500">
          Already have an account?{" "}
          <button
            onClick={() => navigate("/login")}
            className="hover:underline text-primary cursor-pointer"
          >
            Sign In
          </button>
        </p>
      </div>
    </div>
  );
}
