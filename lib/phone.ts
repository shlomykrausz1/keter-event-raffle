/**
 * Phone helpers.
 * - normalize(input): strip everything except digits, drop leading 1 if 11 digits
 * - formatDisplay(input): (718) 123-4567
 * - isValid10(input): true if exactly 10 digits after normalization
 */

export function normalizePhone(input: string): string {
  const digits = (input || "").replace(/\D+/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

export function formatPhoneDisplay(input: string): string {
  const digits = normalizePhone(input);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

export function isValid10Digit(input: string): boolean {
  return normalizePhone(input).length === 10;
}

/** Mask phone for display on the big screen: (718) ***-4567 */
export function maskPhone(input: string): string {
  const digits = normalizePhone(input);
  if (digits.length !== 10) return formatPhoneDisplay(input);
  return `(${digits.slice(0, 3)}) ***-${digits.slice(6)}`;
}

/** Mask everything except the last 4 digits: ***-***-1234 */
export function maskPhoneLast4(input: string): string {
  const digits = normalizePhone(input);
  if (digits.length < 4) return "***-***-****";
  return `***-***-${digits.slice(-4)}`;
}
