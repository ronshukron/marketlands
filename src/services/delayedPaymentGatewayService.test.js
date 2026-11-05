jest.mock('axios', () => ({ post: jest.fn() }));
jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  getDoc: jest.fn(),
}));
jest.mock('../firebase/firebase', () => ({ db: {} }));
jest.mock('../utils/functionsClient', () => ({
  __esModule: true,
  functionsEndpoint: jest.fn((name) => `https://example.test/${name}`),
}));

import axios from 'axios';
import { getDoc } from 'firebase/firestore';
import { functionsEndpoint } from '../utils/functionsClient';
import { confirmDelayedPayment, getDelayedPaymentGateway } from './delayedPaymentGatewayService';

describe('getDelayedPaymentGateway', () => {
  beforeEach(() => {
    localStorage.removeItem('delayedPaymentGatewayOverride');
    getDoc.mockReset();
  });

  test('a browser override wins and does not read payment settings', async () => {
    localStorage.setItem('delayedPaymentGatewayOverride', 'grow_j5_legacy');
    await expect(getDelayedPaymentGateway({
      paymentConfig: { delayedPaymentGateway: 'grow_payment_link' },
    })).resolves.toBe('grow_j5_legacy');
    expect(getDoc).not.toHaveBeenCalled();
  });

  test('uses a payment config already loaded by checkout instead of reading it again', async () => {
    const envGateway = process.env.REACT_APP_DELAYED_PAYMENT_GATEWAY;
    if (envGateway) {
      await getDelayedPaymentGateway({ paymentConfig: { delayedPaymentGateway: 'grow_j5_legacy' } });
      expect(getDoc).not.toHaveBeenCalled();
      return;
    }

    await expect(getDelayedPaymentGateway({
      paymentConfig: { delayedPaymentGateway: ' GROW_PAYMENT_LINK ' },
    })).resolves.toBe('grow_payment_link');
    await expect(getDelayedPaymentGateway({
      paymentConfig: { delayedPaymentGateway: 'not-a-gateway' },
    })).resolves.toBe('grow_j5_legacy');
    expect(getDoc).not.toHaveBeenCalled();
  });
});

describe('confirmDelayedPayment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    functionsEndpoint.mockImplementation((name) => `https://example.test/${name}`);
  });

  test('posts only customerOrderId and returns parsed state', async () => {
    axios.post.mockResolvedValue({
      data: {
        ok: true,
        state: 'held',
        recovered: true,
        customerOrderId: 'ord-1',
        paymentStatus: 'held',
        delayedOrderStatus: 'pending_weighing',
      },
    });

    const result = await confirmDelayedPayment({
      customerOrderId: 'ord-1',
      response: 'success',
      processId: 'should-not-send',
    });

    expect(axios.post).toHaveBeenCalledWith(
      'https://example.test/confirmDelayedPayment',
      { customerOrderId: 'ord-1' },
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      state: 'held',
      recovered: true,
      missingEndpoint: false,
      status: 200,
    });
    expect(result).not.toHaveProperty('processId');
  });

  test('404 returns missingEndpoint true', async () => {
    axios.post.mockRejectedValue({
      response: { status: 404, data: 'Not Found' },
    });
    const result = await confirmDelayedPayment({ customerOrderId: 'ord-1' });
    expect(result).toEqual({
      ok: false,
      missingEndpoint: true,
      status: 404,
      raw: null,
    });
  });

  test('502 returns ok false with status 502', async () => {
    axios.post.mockRejectedValue({
      response: {
        status: 502,
        data: { ok: false, error: { code: 'grow_unavailable', message: 'Grow down' } },
      },
    });
    const result = await confirmDelayedPayment({ customerOrderId: 'ord-1' });
    expect(result.ok).toBe(false);
    expect(result.missingEndpoint).toBe(false);
    expect(result.status).toBe(502);
    expect(result.error).toEqual({ code: 'grow_unavailable', message: 'Grow down' });
  });
});
