import {
  formatBatchChargeFailureLine,
  getActionErrorDetail,
  interpretHandleSuspendedPaymentError,
  readAmountAboveHoldError,
} from './actionErrorV7';

const missingHoldError = {
  response: {
    status: 409,
    data: {
      status: 0,
      err: {
        message: 'חסר אישור Grow להזמנה זו',
        code: 'missing_grow_hold',
        state: 'abandoned',
      },
      error: {
        code: 'missing_grow_hold',
        message: 'חסר אישור Grow להזמנה זו',
        state: 'abandoned',
      },
    },
  },
  message: 'Request failed with status code 409',
};

describe('interpretHandleSuspendedPaymentError', () => {
  test('409 missing_grow_hold shows the Hebrew message and is not retryable', () => {
    const result = interpretHandleSuspendedPaymentError(missingHoldError);
    expect(getActionErrorDetail(missingHoldError)).toBe('חסר אישור Grow להזמנה זו');
    expect(result.message).toBe('חסר אישור Grow להזמנה זו');
    expect(result.missingGrowHold).toBe(true);
    expect(result.shouldRetry).toBe(false);
    expect(result.markCompleted).toBe(false);
    expect(formatBatchChargeFailureLine('נורית', result.message)).toBe(
      'נורית: חסר אישור Grow להזמנה זו',
    );
  });
});

describe('amount above the card hold (422 from handleSuspendedPayment)', () => {
  const aboveHoldError = () => Object.assign(new Error('Request failed with status code 422'), {
    response: {
      status: 422,
      data: {
        status: 0,
        err: { code: 'amount_above_hold', message: 'Charge of 104.50 is above the card hold of 100.00', total: 104.5, holdSum: 100 },
        error: { code: 'amount_above_hold', total: 104.5, holdSum: 100 },
      },
    },
  });

  test('reads the amounts so the station can offer the hold', () => {
    expect(readAmountAboveHoldError(aboveHoldError())).toEqual({ total: 104.5, holdSum: 100 });
    expect(readAmountAboveHoldError(new Error('boom'))).toBeNull();
    expect(readAmountAboveHoldError({ response: { data: { err: { code: 'amount_above_hold', total: 'x', holdSum: 100 } } } })).toBeNull();
  });

  test('the failure line is in Hebrew with both amounts', () => {
    const interpreted = interpretHandleSuspendedPaymentError(aboveHoldError());
    expect(interpreted.aboveHold).toEqual({ total: 104.5, holdSum: 100 });
    expect(interpreted.message).toBe('הסכום ₪104.50 גבוה מהמקסימום לסליקה ₪100.00');
    expect(interpreted.missingGrowHold).toBe(false);
  });
});
