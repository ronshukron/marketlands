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
import { functionsEndpoint } from '../utils/functionsClient';
import { confirmDelayedPayment } from './delayedPaymentGatewayService';

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
