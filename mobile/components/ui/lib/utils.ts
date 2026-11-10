import {
  type ClassValue,
  clsx,
} from 'clsx';

/**
 * Utility function to merge Tailwind CSS classes
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/**
 * Generate a unique ID
 */
export function gid(): string {
  return Math.random().toString(36).substring(2, 11);
}
