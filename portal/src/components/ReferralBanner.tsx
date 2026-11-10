import { useState } from "react";

import { useValues } from "kea";
import { Check, Copy, Sparkles, X } from "lucide-react";
import { ActionIcon, Icon } from "slate-ui";
import { toast } from "sonner";

import { authLogic } from "../logic/authLogic";
import client from "../utils/api";

const SESSION_STORAGE_KEY = "referral-banner-dismissed";
const FREE_TRIAL_BANNER_STORAGE_KEY = "free-trial-banner-dismissed";

export function ReferralBanner() {
  const { account } = useValues(authLogic);
  const [dismissed, setDismissed] = useState(() => {
    return sessionStorage.getItem(SESSION_STORAGE_KEY) === "true";
  });
  const [freeTrialDismissed, setFreeTrialDismissed] = useState(() => {
    return sessionStorage.getItem(FREE_TRIAL_BANNER_STORAGE_KEY) === "true";
  });
  const [copied, setCopied] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState(false);

  if (!account) {
    return null;
  }

  const isPaidAccount = !!account.stripe_customer_id;

  // Show free trial banner for non-paid accounts
  if (!isPaidAccount) {
    if (freeTrialDismissed) {
      return null;
    }

    const handleUpgrade = async () => {
      setUpgradeLoading(true);
      const { data, error } = await client.POST(
        "/api/lms/accounts/stripe/checkout-session/",
        { body: { quantity: 1 } },
      );
      setUpgradeLoading(false);
      if (error) {
        toast.error("Failed to start upgrade process");
        return;
      }
      window.location.href = data.url;
    };

    const handleDismiss = () => {
      sessionStorage.setItem(FREE_TRIAL_BANNER_STORAGE_KEY, "true");
      setFreeTrialDismissed(true);
    };

    return (
      <div className="bg-gray-900 px-4 py-2.5 flex items-center justify-between gap-4">
        <span className="text-sm text-gray-300">
          You're on a <span className="font-medium text-white">free trial</span>
          . Upgrade to unlock unlimited sessions.
        </span>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleUpgrade}
            disabled={upgradeLoading}
            className="px-4 py-1.5 text-sm cursor-pointer font-medium text-gray-900 bg-white rounded-full hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            {upgradeLoading ? "Loading..." : "Upgrade"}
          </button>
          <ActionIcon
            variant="subtle"
            icon={X}
            onClick={handleDismiss}
            tooltip="Dismiss"
            className="text-gray-500 hover:text-white hover:bg-gray-800"
          />
        </div>
      </div>
    );
  }

  // Show referral banner for paid accounts
  if (dismissed) {
    return null;
  }

  const referralLink = account.referral_link;

  const copyReferralLink = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    toast.success("Referral link copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDismiss = () => {
    sessionStorage.setItem(SESSION_STORAGE_KEY, "true");
    setDismissed(true);
  };

  return (
    <div className="bg-gray-900 px-4 py-3 flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 min-w-0">
        <Icon icon={Sparkles} className="w-5 h-5 text-yellow-400" />
        <span className="text-sm font-medium text-white">
          Share Acadia with a friend — you both get a free month!
        </span>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <ActionIcon
          variant="subtle"
          icon={copied ? Check : Copy}
          onClick={copyReferralLink}
          tooltip={copied ? "Copied!" : "Copy Link"}
          className="text-white hover:bg-gray-800"
        />
        <ActionIcon
          variant="subtle"
          icon={X}
          onClick={handleDismiss}
          tooltip="Dismiss"
          className="text-gray-400 hover:text-white hover:bg-gray-800"
        />
      </div>
    </div>
  );
}
