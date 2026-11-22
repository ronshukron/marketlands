// Israeli mobile numbers for SMS verification.

/**
 * "050-123 4567", "0501234567", "+972501234567" or "972501234567" ->
 * "+972501234567". Anything that is not an Israeli mobile number -> null.
 * @param {string} value
 * @return {string|null}
 */
export const toIsraeliMobileE164 = (value) => {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('972')) digits = `0${digits.slice(3)}`;
  return /^05\d{8}$/.test(digits) ? `+972${digits.slice(1)}` : null;
};

/**
 * "+972501234567" -> "050-1234567" for display.
 * @param {string} e164
 * @return {string}
 */
export const formatIsraeliMobile = (e164) => {
  const digits = String(e164 || '').replace(/\D/g, '');
  if (!digits.startsWith('972') || digits.length !== 12) return String(e164 || '');
  const local = `0${digits.slice(3)}`;
  return `${local.slice(0, 3)}-${local.slice(3)}`;
};
