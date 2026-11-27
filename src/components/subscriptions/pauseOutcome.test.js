import { pauseOutcomeMessage, resumeOutcomeMessage } from './copy';

describe('pauseOutcomeMessage', () => {
  test('no open delivery: nothing to say', () => {
    expect(pauseOutcomeMessage({ ok: true, canceledOrderIds: [], keptOrders: [] })).toBeNull();
    expect(pauseOutcomeMessage(undefined)).toBeNull();
  });

  test('the open delivery was canceled', () => {
    const customer = pauseOutcomeMessage({ canceledOrderIds: ['o1'], keptOrders: [] });
    expect(customer).toMatchObject({ icon: 'success', title: 'הסל השבועי הושהה' });
    expect(customer.text).toContain('לא תחויבו');
    const admin = pauseOutcomeMessage({ canceledOrderIds: ['o1'], keptOrders: [] }, { admin: true });
    expect(admin.text).toContain('לא יופיע בסיכום השבועי ובליקוט');
  });

  test('a delivery past the cutoff stayed: named, with what to do', () => {
    const result = { canceledOrderIds: [], keptOrders: [{ orderId: 'o2', deliveryDate: '2026-12-02' }] };
    const customer = pauseOutcomeMessage(result);
    expect(customer.icon).toBe('warning');
    expect(customer.text).toContain('המשלוח של יום רביעי, 2.12 כבר נסגר להזמנות ויגיע כרגיל');
    const admin = pauseOutcomeMessage(result, { admin: true });
    expect(admin.title).toBe('הושהה, אבל משלוח אחד נשאר');
    expect(admin.text).toContain('בטלו אותו בדף ההזמנות השבועיות');
  });
});

describe('resumeOutcomeMessage', () => {
  test('nothing restored: nothing to say', () => {
    expect(resumeOutcomeMessage({ ok: true, restoredDeliveries: [] })).toBeNull();
  });

  test('the paused delivery came back, with sold-out products named', () => {
    expect(resumeOutcomeMessage({ restoredDeliveries: [{ deliveryDate: '2026-12-02', droppedProductNames: [] }] }))
      .toEqual({ icon: 'success', title: 'הסל השבועי חודש', text: 'המשלוח של יום רביעי, 2.12 חזר.' });
    const partial = resumeOutcomeMessage({ restoredDeliveries: [{ deliveryDate: '2026-12-02', droppedProductNames: ['פטל'] }] });
    expect(partial.icon).toBe('info');
    expect(partial.text).toContain('אזלו ולא נכנסו: פטל');
  });
});
