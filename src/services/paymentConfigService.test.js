import { DEFAULT_WEIGHT_BUFFER_PERCENT } from '../utils/pricing';
import { resolveWeightBufferPercent } from './paymentConfigService';

describe('resolveWeightBufferPercent', () => {
  test('uses the configured percent', () => {
    expect(resolveWeightBufferPercent({ weightBufferPercent: 7 })).toBe(7);
  });

  test('uses the default when the setting was never saved', () => {
    expect(resolveWeightBufferPercent({})).toBe(DEFAULT_WEIGHT_BUFFER_PERCENT);
    expect(resolveWeightBufferPercent({ weightBufferPercent: null })).toBe(DEFAULT_WEIGHT_BUFFER_PERCENT);
  });

  test('keeps an explicit zero and caps an excessive percent', () => {
    expect(resolveWeightBufferPercent({ weightBufferPercent: 0 })).toBe(0);
    expect(resolveWeightBufferPercent({ weightBufferPercent: 80 })).toBe(30);
    expect(resolveWeightBufferPercent({ weightBufferPercent: 'nope' })).toBe(0);
  });
});
