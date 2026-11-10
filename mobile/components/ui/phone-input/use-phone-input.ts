import {
  useEffect,
  useState,
} from 'react';

import {
  formatPhoneNumber,
  getCountryByCode,
} from './countries';
import type {
  UsePhoneInputProps,
  UsePhoneInputReturn,
} from './phone-input.types';

export function usePhoneInput({
  value = "",
  onChange,
  defaultCountryCode,
  disabled = false,
}: UsePhoneInputProps): UsePhoneInputReturn {
  const [phoneNumber, setPhoneNumber] = useState(value);
  const [countryCode, setCountryCode] = useState(
    getCountryByCode(defaultCountryCode)
  );

  useEffect(() => {
    setPhoneNumber(value);
  }, [value]);

  const handlePhoneChange = (text: string) => {
    // Only allow digits
    const cleaned = text.replace(/\D/g, "");
    setPhoneNumber(cleaned);

    const fullNumber = `${countryCode.dialCode}${cleaned}`;
    onChange?.(cleaned, fullNumber);
  };

  const handleCountryChange = (country: typeof countryCode) => {
    setCountryCode(country);
    const fullNumber = `${country.dialCode}${phoneNumber}`;
    onChange?.(phoneNumber, fullNumber);
  };

  const formattedNumber = formatPhoneNumber(phoneNumber, countryCode.code);
  const fullNumber = `${countryCode.dialCode} ${formattedNumber}`;

  return {
    phoneNumber,
    countryCode,
    handlePhoneChange,
    handleCountryChange,
    formattedNumber,
    fullNumber,
  };
}
