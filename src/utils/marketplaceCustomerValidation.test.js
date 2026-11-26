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

describe('full name', () => {
  test.each([
    'ישראל ישראלי',
    'דנה בן-דוד',
    "ז'אן ד'ארק",
    "Mary O'Neil",
    '  רון   כהן  ',
    'אנה מריה לופז',
  ])('accepts %s', (name) => {
    expect(validateCustomerName(name)).toEqual({ valid: true, message: '' });
  });

  test.each([
    ['רון', 'נא לכתוב שם פרטי ושם משפחה, למשל: דנה כהן'],
    ['רון -', 'נא לכתוב שם פרטי ושם משפחה, למשל: דנה כהן'],
    ['ר כהן', 'נא לכתוב את השם המלא, בלי ראשי תיבות. למשל: דנה כהן'],
    ['רון כהן 2', 'השם יכול להכיל רק אותיות, בלי מספרים או סימנים'],
    ['רון@כהן', 'השם יכול להכיל רק אותיות, בלי מספרים או סימנים'],
  ])('rejects %s', (name, message) => {
    expect(validateCustomerName(name)).toEqual({ valid: false, message });
  });

  test('a one-word name fails the whole checkout check', () => {
    const result = validateCheckoutCustomer({ name: 'רון', phone: '0501234567', email: 'ron@example.com' });
    expect(result.valid).toBe(false);
    expect(result.errors.name).toBe('נא לכתוב שם פרטי ושם משפחה, למשל: דנה כהן');
  });
});
