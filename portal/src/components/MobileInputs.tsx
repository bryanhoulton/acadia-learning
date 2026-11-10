import "react-international-phone/style.css";

import React, { forwardRef, useState } from "react";

import {
  defaultCountries,
  parseCountry,
  usePhoneInput,
} from "react-international-phone";
import { cn } from "slate-ui";

interface MobileInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const MobileInput = forwardRef<HTMLInputElement, MobileInputProps>(
  ({ className, label, error, ...props }, ref) => {
    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label className="block text-sm font-medium text-neutral-700">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={cn(
            "flex h-14 w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-lg ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            error && "border-error-500 focus-visible:ring-error-500",
            className
          )}
          {...props}
        />
        {error && <p className="text-sm text-error-500">{error}</p>}
      </div>
    );
  }
);

export const MobileVerificationInput = forwardRef<
  HTMLInputElement,
  MobileInputProps & { onComplete?: (value: string) => void }
>(({ className, onChange, onComplete, ...props }, ref) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow digits
    const value = e.target.value.replace(/\D/g, "").slice(0, 6);
    e.target.value = value;
    onChange?.(e);

    // Trigger onComplete when 6 digits are entered
    if (value.length === 6 && onComplete) {
      onComplete(value);
    }
  };

  return (
    <MobileInput
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      name="one-time-code"
      pattern="[0-9]*"
      maxLength={6}
      onChange={handleChange}
      className={cn("text-center text-2xl tracking-[0.5em] font-mono", className)}
      {...props}
    />
  );
});

interface MobilePhoneInputProps {
  label?: string;
  error?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}

// Convert country ISO2 code to flag emoji
const getCountryFlag = (iso2: string): string => {
  const codePoints = iso2
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
};

// Parse countries for the dropdown
const countries = defaultCountries.map((c) => parseCountry(c));

export const MobilePhoneInput = forwardRef<
  HTMLInputElement,
  MobilePhoneInputProps
>(({ label, error, value, onChange, placeholder, required }, ref) => {
  const [selectorOpen, setSelectorOpen] = useState(false);

  const { inputValue, handlePhoneValueChange, country, setCountry } =
    usePhoneInput({
      defaultCountry: "us",
      value: value,
      disableDialCodeAndPrefix: true,
      disableDialCodePrefill: true,
    });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handlePhoneValueChange(e);
    // Pass full phone with country code to parent
    const fullPhone = `+${country.dialCode}${e.target.value.replace(/\D/g, "")}`;
    onChange(fullPhone);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    // Move cursor to end of input on focus (fixes mobile cursor position)
    const len = e.target.value.length;
    requestAnimationFrame(() => {
      e.target.setSelectionRange(len, len);
    });
  };

  const handleCountrySelect = (iso2: string) => {
    setCountry(iso2);
    setSelectorOpen(false);
    // Update parent with new country
    const newCountry = countries.find((c) => c.iso2 === iso2);
    if (newCountry) {
      const digitsOnly = inputValue.replace(/\D/g, "");
      const fullPhone = `+${newCountry.dialCode}${digitsOnly}`;
      onChange(fullPhone);
    }
  };

  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-neutral-700">
          {label}
        </label>
      )}
      <div
        className={cn(
          "flex h-14 w-full items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 ring-offset-white focus-within:ring-2 focus-within:ring-primary-500 focus-within:ring-offset-2",
          error && "border-error-500 focus-within:ring-error-500"
        )}
      >
        <div className="relative">
          <button
            type="button"
            onClick={() => setSelectorOpen(!selectorOpen)}
            className="flex items-center gap-1 px-1 py-1 rounded-lg hover:bg-neutral-100 transition-colors"
            aria-label="Select country"
          >
            <span className="text-2xl select-none">
              {getCountryFlag(country.iso2)}
            </span>
            <svg
              className={cn(
                "w-4 h-4 text-neutral-400 transition-transform",
                selectorOpen && "rotate-180"
              )}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {selectorOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setSelectorOpen(false)}
              />
              <div className="absolute top-full left-0 mt-1 z-20 w-64 max-h-60 overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-lg">
                {countries.map((c) => (
                  <button
                    key={c.iso2}
                    type="button"
                    onClick={() => handleCountrySelect(c.iso2)}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-neutral-50 transition-colors",
                      c.iso2 === country.iso2 && "bg-primary-50"
                    )}
                  >
                    <span className="text-xl">{getCountryFlag(c.iso2)}</span>
                    <span className="flex-1 text-sm truncate">{c.name}</span>
                    <span className="text-sm text-neutral-400">
                      +{c.dialCode}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <input
          ref={ref}
          type="tel"
          value={inputValue}
          onChange={handleChange}
          onFocus={handleFocus}
          placeholder={placeholder || "(555) 123-4567"}
          required={required}
          className="flex-1 h-full bg-transparent text-lg placeholder:text-neutral-400 focus:outline-none"
        />
      </div>
      {error && <p className="text-sm text-error-500">{error}</p>}
    </div>
  );
});
