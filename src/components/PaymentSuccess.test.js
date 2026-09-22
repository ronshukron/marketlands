import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { getDoc } from 'firebase/firestore';
import { confirmDelayedPayment } from '../services/delayedPaymentGatewayService';
import { useCart } from '../contexts/CartContext';
import PaymentSuccess, { PaymentSuccessStatusView } from './PaymentSuccess';
import {
  resetDelayedPaymentConfirmTestState,
  resolveDelayedPaymentSuccessView,
} from '../utils/delayedPaymentConfirm';

jest.mock('../firebase/firebase', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({})),
  getDoc: jest.fn(),
}));
jest.mock('../services/delayedPaymentGatewayService', () => ({
  confirmDelayedPayment: jest.fn(),
}));
jest.mock('../contexts/CartContext', () => ({
  useCart: jest.fn(),
}));

const pendingDoc = {
  paymentStatus: 'pending_payment',
  delayedOrderStatus: 'created_in_fe',
  delayedPayment: { status: 'created' },
};

const clearCart = jest.fn();

const renderPage = (search = '?customerOrderId=ord-1&response=success') => render(
  <MemoryRouter initialEntries={[`/payment-success${search}`]}>
    <PaymentSuccess />
  </MemoryRouter>,
);

describe('PaymentSuccess views', () => {
  test.each([
    ['success', 'תודה רבה!'],
    ['not_paid', 'התשלום לא הושלם. העגלה נשמרה.'],
    ['unrecoverable', 'לא ניתן לאשר את התשלום אוטומטית. פנו לתמיכה ואל תשלמו שוב.'],
    ['pending', 'חזרתם מ-Grow בהצלחה. ההזמנה עדיין ממתינה לאישור בשרת. אין צורך לשלם שוב.'],
  ])('%s shows the matching copy', (kind, copy) => {
    render(
      <PaymentSuccessStatusView
        view={{ kind, orderId: 'ord-1', growResponse: 'success' }}
        onBackToHome={() => {}}
      />,
    );
    expect(screen.getByText(copy)).toBeInTheDocument();
    expect(screen.queryByText(/Grow אישר את העסקה/)).not.toBeInTheDocument();
  });

  test('abandoned + Grow success keeps do-not-pay-again copy', () => {
    render(
      <PaymentSuccessStatusView
        view={{ kind: 'abandoned', orderId: 'ord-1', growResponse: 'success' }}
        onBackToHome={() => {}}
      />,
    );
    expect(screen.getByText(/אל תשלמו שוב/)).toBeInTheDocument();
    expect(screen.getByText(/Grow אישר את העסקה/)).toBeInTheDocument();
  });
});

describe('PaymentSuccess confirm flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetDelayedPaymentConfirmTestState();
    useCart.mockReturnValue({ clearCart });
  });

  test('held from confirm shows success and clears the cart', async () => {
    confirmDelayedPayment.mockResolvedValue({
      ok: true,
      state: 'held',
      recovered: true,
      missingEndpoint: false,
      customerOrderId: 'ord-1',
    });
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => pendingDoc,
    });

    renderPage();
    expect(await screen.findByText('תודה רבה!')).toBeInTheDocument();
    expect(clearCart).toHaveBeenCalledTimes(1);
    expect(confirmDelayedPayment).toHaveBeenCalledWith({ customerOrderId: 'ord-1' });
  });

  test('not_paid preserves the cart and does not use webhook-loss copy', async () => {
    confirmDelayedPayment.mockResolvedValue({
      ok: true,
      state: 'not_paid',
      recovered: false,
      missingEndpoint: false,
    });
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => pendingDoc,
    });

    renderPage();
    expect(await screen.findByText('התשלום לא הושלם. העגלה נשמרה.')).toBeInTheDocument();
    expect(screen.queryByText(/Grow אישר את העסקה/)).not.toBeInTheDocument();
    expect(clearCart).not.toHaveBeenCalled();
  });

  test('does not show a permissions error when Grow returned success', async () => {
    getDoc.mockRejectedValue({
      code: 'permission-denied',
      message: 'Missing or insufficient permissions.',
    });
    confirmDelayedPayment.mockResolvedValue({
      ok: true,
      state: 'held',
      recovered: false,
      missingEndpoint: false,
    });

    renderPage('?response=success&cField2=temp_1789899795750');
    expect(await screen.findByText('תודה רבה!')).toBeInTheDocument();
    expect(screen.queryByText(/Missing or insufficient permissions/)).not.toBeInTheDocument();
    expect(screen.queryByText('שגיאה בעיבוד התשלום')).not.toBeInTheDocument();
    expect(clearCart).toHaveBeenCalledTimes(1);
  });
});

describe('resolveDelayedPaymentSuccessView', () => {
  beforeEach(() => {
    resetDelayedPaymentConfirmTestState();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    console.warn.mockRestore?.();
  });

  test('maps each backend confirm state without polling', async () => {
    const cases = [
      ['held', 'success'],
      ['already_settled', 'success'],
      ['not_paid', 'not_paid'],
      ['unrecoverable', 'unrecoverable'],
      ['pending', 'pending'],
    ];
    await Promise.all(cases.map(async ([state, kind]) => {
      const result = await resolveDelayedPaymentSuccessView({
        orderId: 'ord-1',
        growResponse: 'success',
        readDelayedOrder: jest.fn().mockResolvedValue({ exists: true, data: pendingDoc }),
        confirmDelayedPaymentFn: jest.fn().mockResolvedValue({
          ok: true,
          state,
          missingEndpoint: false,
        }),
        pollAttempts: 1,
        pollMs: 0,
        waitFn: jest.fn().mockResolvedValue(undefined),
      });
      expect(result.kind).toBe(kind);
    }));
  });

  test('404 missingEndpoint is treated as pending and warns once', async () => {
    const confirmDelayedPaymentFn = jest.fn().mockResolvedValue({
      ok: false,
      missingEndpoint: true,
      status: 404,
    });
    const first = await resolveDelayedPaymentSuccessView({
      orderId: 'ord-1',
      growResponse: 'success',
      readDelayedOrder: jest.fn().mockResolvedValue({ exists: true, data: pendingDoc }),
      confirmDelayedPaymentFn,
      pollAttempts: 1,
      pollMs: 0,
      waitFn: jest.fn().mockResolvedValue(undefined),
    });
    const second = await resolveDelayedPaymentSuccessView({
      orderId: 'ord-1',
      growResponse: 'success',
      readDelayedOrder: jest.fn().mockResolvedValue({ exists: true, data: pendingDoc }),
      confirmDelayedPaymentFn,
      pollAttempts: 1,
      pollMs: 0,
      waitFn: jest.fn().mockResolvedValue(undefined),
    });
    expect(first.kind).toBe('pending');
    expect(second.kind).toBe('pending');
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  test('does not treat delayedPayment.status=held as a confirmed hold', async () => {
    const result = await resolveDelayedPaymentSuccessView({
      orderId: 'ord-1',
      growResponse: 'success',
      readDelayedOrder: jest.fn().mockResolvedValue({
        exists: true,
        data: {
          paymentStatus: 'pending_payment',
          delayedPayment: { status: 'held' },
        },
      }),
      confirmDelayedPaymentFn: jest.fn().mockResolvedValue({
        ok: true,
        state: 'pending',
        missingEndpoint: false,
      }),
      pollAttempts: 1,
      pollMs: 0,
      waitFn: jest.fn().mockResolvedValue(undefined),
    });
    expect(result.kind).toBe('pending');
  });

  test('heldAt short-circuits confirm', async () => {
    const confirmDelayedPaymentFn = jest.fn();
    const result = await resolveDelayedPaymentSuccessView({
      orderId: 'ord-1',
      readDelayedOrder: jest.fn().mockResolvedValue({
        exists: true,
        data: {
          paymentStatus: 'pending_payment',
          delayedPayment: { status: 'created', heldAt: '2026-09-15T09:31:00.000Z' },
        },
      }),
      confirmDelayedPaymentFn,
    });
    expect(result.kind).toBe('success');
    expect(confirmDelayedPaymentFn).not.toHaveBeenCalled();
  });

  test('Firestore permission errors still confirm and can show success', async () => {
    const confirmDelayedPaymentFn = jest.fn().mockResolvedValue({
      ok: true,
      state: 'held',
      recovered: false,
      missingEndpoint: false,
    });
    const result = await resolveDelayedPaymentSuccessView({
      orderId: 'temp_1789899795750',
      growResponse: 'success',
      readDelayedOrder: jest.fn().mockRejectedValue({
        code: 'permission-denied',
        message: 'Missing or insufficient permissions.',
      }),
      confirmDelayedPaymentFn,
    });
    expect(result.kind).toBe('success');
    expect(confirmDelayedPaymentFn).toHaveBeenCalledWith({ customerOrderId: 'temp_1789899795750' });
  });

  test('unreadable Firestore with pending confirm shows pending, not an error', async () => {
    const result = await resolveDelayedPaymentSuccessView({
      orderId: 'temp_1',
      growResponse: 'success',
      readDelayedOrder: jest.fn().mockResolvedValue({ readable: false, exists: false, data: null }),
      confirmDelayedPaymentFn: jest.fn().mockResolvedValue({
        ok: true,
        state: 'pending',
        missingEndpoint: false,
      }),
    });
    expect(result.kind).toBe('pending');
  });
});
