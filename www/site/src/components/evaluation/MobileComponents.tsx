import 'react-international-phone/style.css';

import React, {
  forwardRef,
  useState,
} from 'react';

import {
  defaultCountries,
  parseCountry,
  usePhoneInput,
} from 'react-international-phone';
import { cn } from 'slate-ui';

interface MobileInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const MobileInput = forwardRef<HTMLInputElement, MobileInputProps>(
  ({ className, label, error, ...props }, ref) => {
    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label className="block text-sm font-medium text-gray-700">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={cn(
            "flex h-14 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-lg ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            error && "border-red-500 focus-visible:ring-red-500",
            className
          )}
          {...props}
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    );
  }
);

interface MobileSelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { label: string; value: string | number }[];
  placeholder?: string;
}

export const MobileSelect = forwardRef<HTMLSelectElement, MobileSelectProps>(
  ({ className, label, error, options, placeholder, ...props }, ref) => {
    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label className="block text-sm font-medium text-gray-700">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            className={cn(
              "flex h-14 w-full appearance-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-lg ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
              error && "border-red-500 focus-visible:ring-red-500",
              className
            )}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-500">
            <svg
              className="h-5 w-5"
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
          </div>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    );
  }
);

export const MobileDateInput = ({
  value,
  onChange,
  ...props
}: Omit<MobileInputProps, "value" | "onChange"> & {
  value: Date | null;
  onChange: (date: Date | null) => void;
}) => {
  // Format date to YYYY-MM-DD for input
  // Use en-CA locale which always produces YYYY-MM-DD
  const dateString = value ? value.toLocaleDateString("en-CA") : "";

  return (
    <MobileInput
      type="date"
      value={dateString}
      onChange={(e) => {
        if (!e.target.value) {
          onChange(null);
          return;
        }
        const [y, m, d] = e.target.value.split("-").map(Number);
        // Construct date at noon to avoid timezone issues
        onChange(new Date(y, m - 1, d, 12, 0, 0));
      }}
      {...props}
    />
  );
};

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
      className={cn(
        "text-center text-2xl tracking-[0.5em] font-mono",
        className
      )}
      {...props}
    />
  );
});

interface MobileButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "primary"
    | "secondary"
    | "subtle"
    | "outline"
    | "ghost"
    | "default";
  size?: "sm" | "md" | "lg"; // Kept for compatibility
  loading?: boolean;
  iconRight?: React.ElementType;
}

export const MobileButton = forwardRef<HTMLButtonElement, MobileButtonProps>(
  (
    {
      className,
      variant = "primary",
      loading,
      children,
      iconRight: Icon,
      disabled,
      ...props
    },
    ref
  ) => {
    const variants = {
      primary:
        "bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 shadow-sm",
      secondary:
        "bg-secondary-600 text-white hover:bg-secondary-700 active:bg-secondary-800",
      subtle: "bg-gray-100 text-gray-900 hover:bg-gray-200 active:bg-gray-300",
      outline:
        "border-2 border-gray-200 bg-transparent hover:bg-gray-50 text-gray-900",
      ghost: "bg-transparent hover:bg-gray-100 text-gray-900",
      default:
        "bg-white border border-gray-200 text-gray-900 hover:bg-gray-50 hover:border-gray-300 shadow-sm",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex h-14 items-center justify-center rounded-xl px-6 text-lg font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          variants[variant],
          className
        )}
        {...props}
      >
        {loading && (
          <svg
            className="mr-2 h-5 w-5 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
        {Icon && !loading && <Icon className="ml-2 h-5 w-5" />}
      </button>
    );
  }
);

export const MobileDateCard = ({
  date,
  selected,
  onClick,
}: {
  date: Date;
  selected: boolean;
  onClick: () => void;
}) => {
  const isToday = new Date().toDateString() === date.toDateString();
  const isTomorrow =
    new Date(Date.now() + 86400000).toDateString() === date.toDateString();

  const dayLabel = isToday
    ? "Today"
    : isTomorrow
      ? "Tomorrow"
      : date.toLocaleDateString("en-US", { weekday: "long" });
  const dateLabel = date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
  });

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-w-[100px] flex-col items-center justify-center gap-1 rounded-2xl border p-4 transition-all",
        selected
          ? "border-primary-500 bg-primary-50 shadow-sm"
          : "border-gray-200 bg-white shadow-sm hover:border-gray-300"
      )}
    >
      <span
        className={cn(
          "text-sm font-medium",
          selected ? "text-primary-900" : "text-gray-500"
        )}
      >
        {dayLabel}
      </span>
      <span
        className={cn(
          "text-lg font-bold",
          selected ? "text-primary-700" : "text-gray-900"
        )}
      >
        {dateLabel}
      </span>
    </button>
  );
};

export const MobileTimeCard = ({
  label,
  subLabel,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  subLabel?: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-center justify-center gap-0.5 rounded-2xl border py-4 px-2 transition-all h-full",
        selected
          ? "border-primary-500 bg-primary-50 shadow-sm"
          : "border-gray-200 bg-white shadow-sm hover:border-gray-300",
        disabled &&
          "opacity-50 cursor-not-allowed bg-gray-50 border-gray-100 shadow-none"
      )}
    >
      <span
        className={cn(
          "text-sm font-bold whitespace-nowrap",
          selected ? "text-primary-700" : "text-gray-900"
        )}
      >
        {label}
      </span>
      {subLabel && (
        <span
          className={cn(
            "text-xs",
            selected ? "text-primary-600" : "text-primary-500"
          )}
        >
          {subLabel}
        </span>
      )}
    </button>
  );
};

interface MobilePhoneInputProps {
  label?: string;
  error?: string;
  value: string;
  onChange: (value: string, data?: any, country?: any) => void;
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
    onChange(fullPhone, undefined, country);
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
      onChange(fullPhone, undefined, newCountry);
    }
  };

  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <div
        className={cn(
          "flex h-14 w-full items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 ring-offset-white focus-within:ring-2 focus-within:ring-primary-500 focus-within:ring-offset-2",
          error && "border-red-500 focus-within:ring-red-500"
        )}
      >
        <div className="relative">
          <button
            type="button"
            onClick={() => setSelectorOpen(!selectorOpen)}
            className="flex items-center gap-1 px-1 py-1 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Select country"
          >
            <span className="text-2xl select-none">
              {getCountryFlag(country.iso2)}
            </span>
            <svg
              className={cn(
                "w-4 h-4 text-gray-400 transition-transform",
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
              <div className="absolute top-full left-0 mt-1 z-20 w-64 max-h-60 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
                {countries.map((c) => (
                  <button
                    key={c.iso2}
                    type="button"
                    onClick={() => handleCountrySelect(c.iso2)}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 transition-colors",
                      c.iso2 === country.iso2 && "bg-primary-50"
                    )}
                  >
                    <span className="text-xl">{getCountryFlag(c.iso2)}</span>
                    <span className="flex-1 text-sm truncate">{c.name}</span>
                    <span className="text-sm text-gray-400">+{c.dialCode}</span>
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
          className="flex-1 h-full bg-transparent text-lg placeholder:text-gray-400 focus:outline-none"
        />
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
});
