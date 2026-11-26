// When the payment provider (Grow) refuses to open a payment page, its
// message can be an English code or technical text. Customers see a short
// Hebrew explanation instead, and the checkout jumps to the field to fix.

const FIELD_PATTERNS = [
  { field: 'name', pattern: /full\s*_?name|\bname\b|שם מלא|שם פרטי|שם משפחה|שם הלקוח/i },
  { field: 'phone', pattern: /phone|\bmobile\b|טלפון|נייד/i },
  { field: 'email', pattern: /e-?mail|אימייל|מייל|דוא"ל|דואר אלקטרוני/i },
];

export const PAYMENT_PAGE_FIELD_MESSAGES = {
  name: 'חברת הסליקה צריכה שם פרטי ושם משפחה, באותיות בלבד. למשל: דנה כהן',
  phone: 'חברת הסליקה לא קיבלה את מספר הטלפון. נא לבדוק שזה מספר נייד ישראלי בן 10 ספרות, למשל 0501234567',
  email: 'חברת הסליקה לא קיבלה את כתובת האימייל. נא לבדוק שהיא כתובה נכון',
};

export const PAYMENT_PAGE_GENERIC_MESSAGE = 'לא הצלחנו לפתוח את דף התשלום. נסו שוב בעוד רגע, ואם זה חוזר צרו איתנו קשר.';

/**
 * @param {any} error axios error from the payment page request
 * @return {{field: string, message: string}} field is '' when no customer field is to blame
 */
export function describePaymentPageError(error) {
  const err = error?.response?.data?.err || {};
  const raw = [err.message, err.providerMessage, err.id, err.code]
    .filter((value) => typeof value === 'string' || typeof value === 'number')
    .join(' ');
  const match = FIELD_PATTERNS.find(({ pattern }) => pattern.test(raw));
  if (match) return { field: match.field, message: PAYMENT_PAGE_FIELD_MESSAGES[match.field] };
  return { field: '', message: PAYMENT_PAGE_GENERIC_MESSAGE };
}
