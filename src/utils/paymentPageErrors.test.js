import {
  PAYMENT_PAGE_FIELD_MESSAGES,
  PAYMENT_PAGE_GENERIC_MESSAGE,
  describePaymentPageError,
} from './paymentPageErrors';

const providerError = (err) => ({ response: { data: { status: 0, err } } });

test.each([
  [{ message: 'pageField[fullName] is invalid' }, 'name'],
  [{ message: 'FULL_NAME_INVALID' }, 'name'],
  [{ message: 'יש להזין שם מלא' }, 'name'],
  [{ message: 'Request failed', providerMessage: 'phone number not valid' }, 'phone'],
  [{ message: 'מספר טלפון לא תקין' }, 'phone'],
  [{ message: 'invalid email' }, 'email'],
])('maps %j to the %s field', (err, field) => {
  expect(describePaymentPageError(providerError(err))).toEqual({ field, message: PAYMENT_PAGE_FIELD_MESSAGES[field] });
});

test('anything else gets the friendly general message, never the raw code', () => {
  expect(describePaymentPageError(providerError({ message: 'ERR_PAGE_CODE_422' }))).toEqual({
    field: '',
    message: PAYMENT_PAGE_GENERIC_MESSAGE,
  });
  expect(describePaymentPageError(new Error('Network Error'))).toEqual({ field: '', message: PAYMENT_PAGE_GENERIC_MESSAGE });
  expect(describePaymentPageError(undefined).field).toBe('');
});

test('words that only contain the letters of "שם" do not match the name field', () => {
  expect(describePaymentPageError(providerError({ message: 'העסקה לא נרשמה' })).field).toBe('');
});
