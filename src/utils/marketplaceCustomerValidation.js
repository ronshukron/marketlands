const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISRAELI_PHONE_REGEX = /^0\d{8,9}$/;

export const normalizeCustomerPhone = (phone = '') => String(phone).replace(/[-\s]/g, '');

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
  if (!ISRAELI_PHONE_REGEX.test(normalized)) {
    return { valid: false, message: 'מספר טלפון לא תקין (יש להזין מספר ישראלי)' };
  }
  return { valid: true, message: '' };
};

export const validateCustomerEmail = (email) => {
  const trimmed = String(email || '').trim();
  if (!trimmed) {
    return { valid: false, message: 'אימייל הוא שדה חובה' };
  }
  if (!EMAIL_REGEX.test(trimmed)) {
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
