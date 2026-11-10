import React, { useState } from 'react';

import {
  useActions,
  useValues,
} from 'kea';
import {
  ArrowRight,
  Check,
  Copy,
  X,
} from 'lucide-react';
import {
  Accordion,
  ActionIcon,
  Button,
  Modal,
  PhoneInput,
  TextInput,
} from 'slate-ui';
import { toast } from 'sonner';

import { authLogic } from '../logic/authLogic';
import client from '../utils/api';

type AccountSettingsProps = {
  open: boolean;
  onClose: () => void;
};

export function AccountSettings({ open, onClose }: AccountSettingsProps) {
  const { account } = useValues(authLogic);
  const { updateProfile, updateAccount } = useActions(authLogic);
  const [copied, setCopied] = useState(false);

  if (!account) {
    return null;
  }

  const referralLink = account.referral_link;

  const copyReferralLink = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    toast.success("Referral link copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      className="rounded-lg flex flex-col max-w-4xl max-h-[90vh] overflow-hidden"
    >
      <div className="p-6 flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">Account Settings</h1>
          <p className="text-gray-500 text-sm">
            Manage your account settings and profile information.
          </p>
        </div>
        <ActionIcon variant="subtle" icon={X} onClick={onClose} />
      </div>
      <div className="overflow-y-auto flex-1 p-6 pt-0 space-y-6">
        <div className="space-y-6 max-w-4xl mx-auto border-y py-4">
          {account?.stripe_customer_id ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-primary-500 rounded-full"></div>
                <span className="text-lg font-medium">Premium Account</span>
              </div>
              <Button
                variant="secondary"
                onClick={() =>
                  window.open(
                    "https://billing.stripe.com/p/login/5kQfZh8vN8mk1rN7M1e3e00",
                    "_blank"
                  )
                }
              >
                Manage Subscription
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-lg font-medium">Free Trial</span>
              <Button
                variant="primary"
                onClick={async () => {
                  const { data, error } = await client.POST(
                    "/api/lms/accounts/stripe/checkout-session/",
                    { body: { quantity: 1 } }
                  );
                  if (error) {
                    toast.error("Failed to upgrade account");
                    return;
                  }
                  window.location.href = data.url;
                }}
                iconRight={ArrowRight}
              >
                Upgrade Now
              </Button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
          <TextInput
            label="ZIP Code"
            value={account?.zip_code || ""}
            onChange={(v) =>
              account && updateAccount({ ...account, zip_code: v })
            }
            placeholder="e.g., 10001"
          />
          <TextInput
            label="Account Phone"
            value={account?.account_phone || ""}
            disabled
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-lg font-semibold">Profiles</label>
          <Accordion
            items={account.profiles.map((p) => ({
              id: p.id,
              title: p.name || "Unnamed",
              content: (
                <div className="flex flex-col gap-2">
                  <TextInput
                    label="Name"
                    value={p.name || ""}
                    placeholder="e.g., John Doe"
                    onChange={(v) => updateProfile({ ...p, name: v })}
                  />
                  <TextInput
                    label="Email"
                    value={p.email || ""}
                    placeholder="e.g., john.doe@example.com"
                    onChange={(v) => updateProfile({ ...p, email: v })}
                  />
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Phone Number
                    </label>
                    <PhoneInput
                      value={p.phone?.replace("+1", "") || ""}
                      placeholder="(555) 123-4567"
                      onChange={(v, _, country) => {
                        // Prevent setting phone to empty if it's already set
                        if (!v && p.phone) {
                          toast.error(
                            "Phone number cannot be removed once set. Please contact support if you need to change it."
                          );
                          return;
                        }
                        updateProfile({ ...p, phone: country.dialCode + v });
                      }}
                    />
                  </div>
                </div>
              ),
            }))}
          />
        </div>

        <div className="flex flex-col gap-2 max-w-4xl mx-auto">
          <label className="text-sm font-medium">Referral Link</label>
          <div className="flex gap-2">
            <TextInput value={referralLink} disabled className="flex-1" />
            <Button
              variant="default"
              onClick={copyReferralLink}
              iconLeft={copied ? Check : Copy}
            >
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
          {account.referral_count !== undefined &&
            account.referral_count > 0 && (
              <p className="text-sm text-neutral-600">
                {account.referral_count}{" "}
                {account.referral_count === 1 ? "referral" : "referrals"}
              </p>
            )}
        </div>
      </div>
    </Modal>
  );
}
