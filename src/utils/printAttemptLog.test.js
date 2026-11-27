import { PRINT_LOG_LIMIT, appendPrintAttempt, markPrintAttemptSync, readPrintAttempts } from './printAttemptLog';

beforeEach(() => localStorage.clear());

test('newest first, capped at 50', () => {
  for (let i = 1; i <= PRINT_LOG_LIMIT + 5; i += 1) {
    appendPrintAttempt({ orderId: `o${i}`, carton: 1, code: 'ok', durationMs: 900 }, new Date(2026, 10, 26, 10, 0, i));
  }
  const log = readPrintAttempts();
  expect(log).toHaveLength(PRINT_LOG_LIMIT);
  expect(log[0].orderId).toBe(`o${PRINT_LOG_LIMIT + 5}`);
  expect(log[0]).toEqual(expect.objectContaining({ carton: 1, code: 'ok', durationMs: 900 }));
});

test('the count save result is added to the attempt', () => {
  appendPrintAttempt({ orderId: 'o1', carton: 2, code: 'ok', durationMs: 1000 });
  markPrintAttemptSync('o1', 2, 'pending');
  expect(readPrintAttempts()[0].sync).toBe('pending');
  markPrintAttemptSync('o1', 2, 'saved');
  expect(readPrintAttempts()[0].sync).toBe('saved');
});

test('a broken log does not stop printing', () => {
  localStorage.setItem('deliveryV7::printLog', '{not json');
  expect(readPrintAttempts()).toEqual([]);
  appendPrintAttempt({ orderId: 'o1', carton: 1, code: 'timeout', durationMs: 20000 });
  expect(readPrintAttempts()).toHaveLength(1);
});
