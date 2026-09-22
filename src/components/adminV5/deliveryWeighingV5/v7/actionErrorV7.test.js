import {
  formatBatchChargeFailureLine,
  getActionErrorDetail,
  interpretHandleSuspendedPaymentError,
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
