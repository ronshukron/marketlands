import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import PrintAttemptLog from './PrintAttemptLog';
import { appendPrintAttempt, markPrintAttemptSync } from '../../utils/printAttemptLog';
import { CARTON_PRINT_TEXT, printerErrorText } from '../../utils/printerMessages';

const t = { ...CARTON_PRINT_TEXT.he, printerError: (code, detail) => printerErrorText('he', code, detail) };

beforeEach(() => localStorage.clear());

test('opens to the station log, newest first, failures readable', () => {
  appendPrintAttempt({ orderId: 'order-aaaa1111', carton: 1, code: 'ok', durationMs: 1200 }, new Date(2026, 10, 26, 9, 0, 0));
  markPrintAttemptSync('order-aaaa1111', 1, 'saved');
  appendPrintAttempt({ orderId: 'order-bbbb2222', carton: 2, code: 'timeout', durationMs: 20100 }, new Date(2026, 10, 26, 9, 1, 0));
  appendPrintAttempt({ orderId: 'order-bbbb2222', carton: 2, code: 'ok_confirmed', durationMs: 20300 }, new Date(2026, 10, 26, 9, 2, 0));
  markPrintAttemptSync('order-bbbb2222', 2, 'pending');

  render(<PrintAttemptLog t={t} />);
  expect(screen.queryByRole('table')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /יומן הדפסות/ }));

  const rows = screen.getAllByRole('row').slice(1);
  expect(rows).toHaveLength(3);
  expect(rows[0]).toHaveTextContent('הודפס (אושר ידנית)');
  expect(rows[0]).toHaveTextContent('ממתין לאינטרנט');
  expect(rows[1]).toHaveTextContent('המדפסת לא ענתה בזמן');
  expect(rows[1]).toHaveTextContent('20.1s');
  expect(rows[2]).toHaveTextContent('aaaa1111');
  expect(rows[2]).toHaveTextContent('נשמר');
});

test('an empty log says so', () => {
  render(<PrintAttemptLog t={t} />);
  fireEvent.click(screen.getByRole('button', { name: /יומן הדפסות/ }));
  expect(screen.getByText('אין הדפסות עדיין בתחנה הזו')).toBeInTheDocument();
});
