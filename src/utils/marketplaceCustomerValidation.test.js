import {
  normalizeCustomerPhone,
  validateCheckoutCustomer,
  validateCustomerEmail,
  validateCustomerName,
  validateCustomerPhone,
} from './marketplaceCustomerValidation';

describe('checkout customer validation', () => {
  test('accepts valid customer details and formatted Israeli phone numbers', () => {
    expect(normalizeCustomerPhone('050-123 4567')).toBe('0501234567');
    expect(validateCheckoutCustomer({
      name: 'ישראל ישראלי',
      phone: '050-123-4567',
      email: 'customer@example.com',
    }).valid).toBe(true);
  });

  test.each([
    '501234567',
    '050123456',
    '05012345678',
    '031234567',
    '05012345ab',
  ])('rejects invalid or non-mobile phone number %s', (phone) => {
    expect(validateCustomerPhone(phone)).toEqual({
      valid: false,
      message: 'יש להזין מספר נייד ישראלי בן 10 ספרות המתחיל ב־05',
    });
  });

  test.each([
    'not-an-email',
    'user@domain',
    'user..name@example.com',
    '.user@example.com',
    'user@-example.com',
    'user@example..com',
    'user@example.1',
    'user @example.com',
    'user@@example.com',
  ])('rejects malformed email address %s', (email) => {
    expect(validateCustomerEmail(email)).toEqual({
      valid: false,
      message: 'אנא הזינו כתובת אימייל תקינה',
    });
  });

  test('returns a specific message for a missing name', () => {
    expect(validateCustomerName(' ')).toEqual({
      valid: false,
      message: 'שם הוא שדה חובה',
    });
  });
});
