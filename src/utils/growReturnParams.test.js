import { buildGrowSuccessUrl, getGrowReturnOrigin } from './growReturnParams';

const at = (origin) => {
  const url = new URL(origin);
  return { origin: url.origin, hostname: url.hostname };
};

describe('getGrowReturnOrigin', () => {
  it('returns the customer to the host they are on, with or without www', () => {
    expect(getGrowReturnOrigin(at('https://www.bastabasket.com'), '')).toBe('https://www.bastabasket.com');
    expect(getGrowReturnOrigin(at('https://bastabasket.com'), '')).toBe('https://bastabasket.com');
  });

  it('ignores the dev override on a real host, even if it was baked into the build', () => {
    expect(getGrowReturnOrigin(at('https://www.bastabasket.com'), 'https://bastabasket.com'))
      .toBe('https://www.bastabasket.com');
  });

  it('uses the dev override on localhost, where Grow rejects the local URL', () => {
    expect(getGrowReturnOrigin(at('http://localhost:3000'), 'https://bastabasket.com/'))
      .toBe('https://bastabasket.com');
    expect(getGrowReturnOrigin(at('http://127.0.0.1:3000'), 'https://tunnel.example'))
      .toBe('https://tunnel.example');
  });

  it('falls back to the local origin when no override is set', () => {
    expect(getGrowReturnOrigin(at('http://localhost:3000'), undefined)).toBe('http://localhost:3000');
  });
});

describe('buildGrowSuccessUrl', () => {
  it('keeps the host and carries the order id', () => {
    expect(buildGrowSuccessUrl('https://www.bastabasket.com', 'temp_1'))
      .toBe('https://www.bastabasket.com/payment-success/?customerOrderId=temp_1');
  });
});
