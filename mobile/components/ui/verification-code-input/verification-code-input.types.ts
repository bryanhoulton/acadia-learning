export type VerificationCodeVariant = "primary" | "default" | "subtle";

export type VerificationCodeSize = "sm" | "md" | "lg";

export interface VerificationCodeInputProps {
  value?: string;
  onChange?: (value: string) => void;
  length?: number;
  variant?: VerificationCodeVariant;
  size?: VerificationCodeSize;
  disabled?: boolean;
  error?: boolean;
  errorMessage?: string;
  label?: string;
  autoFocus?: boolean;
}

export interface UseVerificationCodeInputProps {
  value?: string;
  onChange?: (value: string) => void;
  length: number;
  disabled?: boolean;
  autoFocus?: boolean;
}

export interface UseVerificationCodeInputReturn {
  inputValue: string;
  handleChange: (text: string) => void;
  handleKeyPress: (index: number, key: string) => void;
  inputRefs: React.RefObject<any>[];
  focusedIndex: number;
  setFocusedIndex: (index: number) => void;
}
