import { act, renderHook } from '@testing-library/react';
import { isSameScaleReading, useWeightScale } from './useWeightScale';

let emitWeight = null;

beforeEach(() => {
  emitWeight = null;
  window.electron = {
    scale: {
      onWeight: (cb) => { emitWeight = cb; return () => { emitWeight = null; }; },
      onConnectionChange: () => () => {},
      onError: () => () => {},
      onReconnectRequested: () => () => {},
      onDisconnected: () => () => {},
      getStatus: () => Promise.resolve({ connected: true, type: 'serial' }),
    },
  };
});

afterEach(() => {
  delete window.electron;
});

const reading = (value, extra = {}) => ({
  value, unit: 'kg', stable: true, status: 'repeated', raw: `R ${value}`, timestamp: Date.now(), ...extra,
});

function renderScale(options) {
  let renders = 0;
  const hook = renderHook(() => {
    renders += 1;
    return useWeightScale(options);
  });
  return { ...hook, renders: () => renders };
}

test('isSameScaleReading compares what the screen shows, not the timestamp', () => {
  expect(isSameScaleReading(reading(1.2, { timestamp: 1 }), reading(1.2, { timestamp: 2 }))).toBe(true);
  expect(isSameScaleReading(reading(1.2), reading(1.25))).toBe(false);
  expect(isSameScaleReading(reading(1.2), reading(1.2, { stable: false }))).toBe(false);
  expect(isSameScaleReading(reading(1.2), reading(1.2, { status: 'stable' }))).toBe(false);
  expect(isSameScaleReading(null, reading(1.2))).toBe(false);
});

test('with dedupeReadings, repeated identical readings do not re-render the screen', async () => {
  const { result, renders } = renderScale({ dedupeReadings: true });
  await act(async () => {});
  act(() => emitWeight(reading(1.234)));
  const first = result.current.weight;
  const rendersAfterFirst = renders();
  for (let i = 0; i < 20; i += 1) {
    act(() => emitWeight(reading(1.234)));
  }
  // React may render once more before it bails out on an unchanged state.
  expect(renders() - rendersAfterFirst).toBeLessThanOrEqual(1);
  expect(result.current.weight).toBe(first);
  expect(result.current.lastStableWeight.value).toBe(1.234);

  act(() => emitWeight(reading(0.5, { stable: false, status: 'unstable' })));
  expect(result.current.weight.value).toBe(0.5);
  expect(result.current.lastStableWeight.value).toBe(1.234);
  act(() => emitWeight(reading(0.5)));
  expect(result.current.lastStableWeight.value).toBe(0.5);
});

test('without the option every reading still updates (V5-V7 behaviour unchanged)', async () => {
  const { result, renders } = renderScale();
  await act(async () => {});
  act(() => emitWeight(reading(1.234)));
  const first = result.current.weight;
  const rendersAfterFirst = renders();
  for (let i = 0; i < 20; i += 1) {
    act(() => emitWeight(reading(1.234)));
  }
  expect(renders() - rendersAfterFirst).toBeGreaterThanOrEqual(20);
  expect(result.current.weight).not.toBe(first);
});
