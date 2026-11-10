import { kea } from 'kea';
import posthog from 'posthog-js';
import { toast } from 'sonner';

import client from '../utils/api';
import { authLogic } from './authLogic';
import type { verificationLogicType } from './verificationLogicType';

export const verificationLogic = kea<verificationLogicType>({
  path: ["src", "logic", "verificationLogic"],
  connect: [authLogic],

  actions: {
    setVerificationCode: (verificationCode: string) => ({ verificationCode }),
    setPhoneNumber: (phoneNumber: string) => ({ phoneNumber }),
    setCountryCode: (countryCode: string) => ({ countryCode }),
    setReferralCode: (referralCode: string | null) => ({ referralCode }),
    setRedirectUrl: (redirectUrl: string | null) => ({ redirectUrl }),
    sendVerificationCode: (allowSignup?: boolean) => ({ allowSignup }),
    verifyCode: true,
    sendEmailVerificationCode: true,
    verifyEmailCode: true,
    requestSupportAuth: true,
    setIsLoading: (isLoading: boolean) => ({ isLoading }),
    setCodeSent: (codeSent: boolean) => ({ codeSent }),
    setDidFail: (didFail: boolean) => ({ didFail }),
    setRetryCount: (retryCount: number) => ({ retryCount }),
    setShowAlternatives: (showAlternatives: boolean) => ({ showAlternatives }),
    setEmailCodeSent: (emailCodeSent: boolean) => ({ emailCodeSent }),
    setSupportRequested: (supportRequested: boolean) => ({ supportRequested }),
    setSigningIn: (signingIn: boolean) => ({ signingIn }),
  },

  reducers: {
    verificationCode: [
      "",
      {
        setVerificationCode: (_, { verificationCode }) => verificationCode,
        sendVerificationCode: () => "",
      },
    ],
    isLoading: [
      false,
      {
        setIsLoading: (_, { isLoading }) => isLoading,
      },
    ],
    codeSent: [
      false,
      {
        setCodeSent: (_, { codeSent }) => codeSent,
      },
    ],
    phoneNumber: [
      "",
      {
        setPhoneNumber: (_, { phoneNumber }) => phoneNumber,
      },
    ],
    countryCode: [
      "+1",
      {
        setCountryCode: (_, { countryCode }) => countryCode,
      },
    ],
    referralCode: [
      null as string | null,
      {
        setReferralCode: (_, { referralCode }) => referralCode,
      },
    ],
    redirectUrl: [
      null as string | null,
      {
        setRedirectUrl: (_, { redirectUrl }) => redirectUrl,
      },
    ],
    signingIn: [
      false,
      {
        setSigningIn: (_, { signingIn }) => signingIn,
      },
    ],
    didFail: [false, { setDidFail: (_, { didFail }) => didFail }],
    retryCount: [0, { setRetryCount: (_, { retryCount }) => retryCount }],
    showAlternatives: [
      false,
      { setShowAlternatives: (_, { showAlternatives }) => showAlternatives },
    ],
    emailCodeSent: [
      false,
      { setEmailCodeSent: (_, { emailCodeSent }) => emailCodeSent },
    ],
    supportRequested: [
      false,
      { setSupportRequested: (_, { supportRequested }) => supportRequested },
    ],
  },

  listeners: ({ actions, values }) => ({
    sendVerificationCode: async ({ allowSignup }) => {
      const shouldAllowSignup = allowSignup ?? true;
      actions.setDidFail(false);
      actions.setIsLoading(true);
      
      // Get browser timezone
      const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      
      const { error } = await client.POST(
        "/api/lms/accounts/request-verification-code/",
        {
          body: {
            phone_number: values.countryCode + values.phoneNumber,
            allow_signup: shouldAllowSignup,
            source: "web",
            referral_code: values.referralCode || undefined,
            timezone: browserTimezone,
          },
        }
      );
      actions.setIsLoading(false);
      if (error) {
        toast.error(error.message);
        actions.setCodeSent(false);
        return;
      }
      posthog.identify(values.countryCode + values.phoneNumber);
      actions.setCodeSent(true);
    },
    verifyCode: async () => {
      actions.setIsLoading(true);
      const { data, error } = await client.POST(
        "/api/lms/accounts/verify-code/",
        {
          body: {
            phone_number: values.countryCode + values.phoneNumber,
            code: values.verificationCode,
          },
        }
      );
      actions.setIsLoading(false);
      if (error) {
        toast.error(error.message);
        actions.setDidFail(true);
        actions.setVerificationCode("");
        const newRetryCount = values.retryCount + 1;
        actions.setRetryCount(newRetryCount);
        if (newRetryCount >= 2) {
          actions.setShowAlternatives(true);
        }
      } else {
        actions.setDidFail(false);
        actions.setSigningIn(true);
        posthog.identify(values.phoneNumber);
        authLogic.actions.setAccount(data.account);
        authLogic.actions.setTokens(data.access, data.refresh);
        // Redirect after a short delay for animation
        setTimeout(() => {
          window.location.href = values.redirectUrl || "/";
        }, 1500);
      }
    },
    sendEmailVerificationCode: async () => {
      actions.setIsLoading(true);
      const { error } = await client.POST(
        "/api/lms/accounts/request-email-verification-code/",
        { body: { phone_number: values.countryCode + values.phoneNumber } }
      );
      actions.setIsLoading(false);
      if (error) {
        toast.error(error.message || "Failed to send email verification code");
      } else {
        toast.success("Verification code sent to your email!");
        actions.setEmailCodeSent(true);
        actions.setCodeSent(true); // This is the key change - transition to verification screen
        actions.setVerificationCode("");
      }
    },
    verifyEmailCode: async () => {
      actions.setIsLoading(true);
      const { data, error } = await client.POST(
        "/api/lms/accounts/verify-email-code/",
        {
          body: {
            phone_number: values.countryCode + values.phoneNumber,
            code: values.verificationCode,
          },
        }
      );
      actions.setIsLoading(false);
      if (error) {
        toast.error(error.message || "Invalid or expired code");
        actions.setDidFail(true);
        actions.setVerificationCode("");
      } else {
        actions.setDidFail(false);
        actions.setSigningIn(true);
        posthog.identify(values.phoneNumber);
        authLogic.actions.setAccount(data.account);
        authLogic.actions.setTokens(data.access, data.refresh);
        // Redirect after a short delay for animation
        setTimeout(() => {
          window.location.href = values.redirectUrl || "/";
        }, 1500);
      }
    },
    requestSupportAuth: async () => {
      actions.setIsLoading(true);
      const { error } = await client.POST(
        "/api/lms/accounts/request-support-auth/",
        { body: { phone_number: values.countryCode + values.phoneNumber } }
      );
      actions.setIsLoading(false);
      if (error) {
        toast.error(error.message || "Failed to request support");
      } else {
        toast.success("Support request sent! Please contact support.");
        actions.setSupportRequested(true);
      }
    },
  }),
});
