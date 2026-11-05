jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  getDoc: jest.fn(),
  updateDoc: jest.fn(),
}));
jest.mock('../firebase/firebase', () => ({ db: {} }));
jest.mock('./communityWeeklyPromotionService', () => ({
  isCommunityWeeklyPricingMismatch: () => false,
  validateAppliedCommunityWeeklyPricing: jest.fn(async () => []),
}));

import { doc, getDoc } from 'firebase/firestore';
import { refreshCartCommercialTerms } from './productPromotionService';

describe('refreshCartCommercialTerms', () => {
  beforeEach(() => {
    doc.mockImplementation((db, collectionName, id) => ({ path: `${collectionName}/${id}` }));
    getDoc.mockImplementation(async (ref) => ({
      exists: () => true,
      data: () => (ref?.path === 'Orders/order-1'
        ? { minimumOrderAmount: 20, minimumOrderItemCount: 1, endingTime: '2030-01-01T00:00:00.000Z' }
        : { productPromotions: [] }),
    }));
  });

  test('returns the order documents it already read so checkout does not read them again', async () => {
    const result = await refreshCartCommercialTerms({
      items: [{
        id: 'product-1',
        orderId: 'order-1',
        businessId: 'farm-1',
        quantity: 1,
        price: 10,
        measurementType: 'package',
      }],
    });

    expect(getDoc).toHaveBeenCalledTimes(2);
    expect(result.ordersById['order-1']).toEqual(expect.objectContaining({
      minimumOrderAmount: 20,
      endingTime: '2030-01-01T00:00:00.000Z',
    }));
    expect(result.orderMinimums['order-1']).toEqual(expect.any(Object));
  });
});
