/// <reference types="vite/client" />

export {};

declare global {
  interface Window {
    fbq?: (
      command: string,
      eventName: string,
      parameters?: Record<string, unknown>,
      options?: Record<string, unknown>
    ) => void;
    gtag?: (
      command: string,
      targetId: string,
      parameters?: Record<string, unknown>
    ) => void;
  }
}
