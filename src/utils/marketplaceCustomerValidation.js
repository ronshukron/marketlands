const ISRAELI_MOBILE_REGEX = /^05\d{8}$/;
const EMAIL_LOCAL_PART_REGEX = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/i;
const EMAIL_DOMAIN_LABEL_REGEX = /^[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?$/i;
const EMAIL_MAX_LENGTH = 254;
const EMAIL_LOCAL_PART_MAX_LENGTH = 64;

export const normalizeCustomerPhone = (phone = '') =>
  String(phone).replace(/[\s().-]/g, '');

export const validateCustomerName = (name) => {
  const trimmed = String(name || '').trim();
  if (!trimmed) {
    return { valid: false, message: 'שם הוא שדה חובה' };
  }
  if (trimmed.length < 2) {
    return { valid: false, message: 'השם חייב להכיל לפחות 2 תווים' };
  }
  return { valid: true, message: '' };
};

export const validateCustomerPhone = (phone) => {
  const normalized = normalizeCustomerPhone(phone);
  if (!normalized) {
    return { valid: false, message: 'טלפון הוא שדה חובה' };
  }
  if (!ISRAELI_MOBILE_REGEX.test(normalized)) {
    return { valid: false, message: 'יש להזין מספר נייד ישראלי בן 10 ספרות המתחיל ב־05' };
  }
  return { valid: true, message: '' };
};

export const validateCustomerEmail = (email) => {
  const trimmed = String(email || '').trim();
  if (!trimmed) {
    return { valid: false, message: 'אימייל הוא שדה חובה' };
  }
  if (trimmed.length > EMAIL_MAX_LENGTH || /\s/.test(trimmed)) {
    return { valid: false, message: 'אנא הזינו כתובת אימייל תקינה' };
  }

  const atIndex = trimmed.lastIndexOf('@');
  if (atIndex <= 0 || atIndex !== trimmed.indexOf('@')) {
    return { valid: false, message: 'אנא הזינו כתובת אימייל תקינה' };
  }

  const localPart = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  const domainLabels = domain.split('.');
  const hasValidLocalPart =
    localPart.length <= EMAIL_LOCAL_PART_MAX_LENGTH &&
    EMAIL_LOCAL_PART_REGEX.test(localPart) &&
    !localPart.startsWith('.') &&
    !localPart.endsWith('.') &&
    !localPart.includes('..');
  const hasValidDomain =
    domain.length <= 253 &&
    domainLabels.length >= 2 &&
    domainLabels.every((label) => EMAIL_DOMAIN_LABEL_REGEX.test(label)) &&
    domainLabels[domainLabels.length - 1].length >= 2 &&
    !/^\d+$/.test(domainLabels[domainLabels.length - 1]);

  if (!hasValidLocalPart || !hasValidDomain) {
    return { valid: false, message: 'אנא הזינו כתובת אימייל תקינה' };
  }
  return { valid: true, message: '' };
};

export const validateCheckoutCustomer = ({ name, phone, email }) => {
  const nameResult = validateCustomerName(name);
  const phoneResult = validateCustomerPhone(phone);
  const emailResult = validateCustomerEmail(email);

  return {
    valid: nameResult.valid && phoneResult.valid && emailResult.valid,
    errors: {
      name: nameResult.message,
      phone: phoneResult.message,
      email: emailResult.message,
    },
  };
};
