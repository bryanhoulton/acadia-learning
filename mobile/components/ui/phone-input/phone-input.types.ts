import type { Size, Variant } from '../lib/types';

export type PhoneInputVariant = Variant;

export type PhoneInputSize = Size;

export interface CountryCode {
  code: string;
  dialCode: string;
  flag: string;
  name: string;
}

export interface PhoneInputProps {
  value?: string;
  onChange?: (value: string, fullNumber: string) => void;
  variant?: PhoneInputVariant;
  size?: PhoneInputSize;
  disabled?: boolean;
  error?: boolean;
  errorMessage?: string;
  label?: string;
  placeholder?: string;
  defaultCountryCode?: string;
  autoFocus?: boolean;
}

export interface UsePhoneInputProps {
  value?: string;
  onChange?: (value: string, fullNumber: string) => void;
  defaultCountryCode: string;
  disabled?: boolean;
}

export interface UsePhoneInputReturn {
  phoneNumber: string;
  countryCode: CountryCode;
  handlePhoneChange: (text: string) => void;
  handleCountryChange: (country: CountryCode) => void;
  formattedNumber: string;
  fullNumber: string;
}
