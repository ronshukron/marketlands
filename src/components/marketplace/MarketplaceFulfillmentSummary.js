import React from 'react';
import {
  formatFulfillmentSummaryLines,
  normalizeStoreFulfillment,
  resolvePromotionFulfillment,
} from '../../constants/marketplaceFulfillment';

const MarketplaceFulfillmentSummary = ({ store, promotion = null, title = 'אפשרויות אספקה' }) => {
  const fulfillment = promotion
    ? resolvePromotionFulfillment(promotion, store)
    : normalizeStoreFulfillment(store);

  const lines = formatFulfillmentSummaryLines({
    ...fulfillment,
    batchDeliveryDate: promotion?.deliveryDate || fulfillment.batchDeliveryDate,
    promotionType: promotion?.promotionType || fulfillment.promotionType,
  });

  if (lines.length === 0) return null;

  return (
    <section className="mp-panel mp-fulfillment-summary">
      <h2 className="mp-section-title mb-3">{title}</h2>
      <ul className="mp-fulfillment-summary-list">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {fulfillment.pickupInstructions && (
        <p className="mp-section-note text-sm mt-2 whitespace-pre-wrap">
          {fulfillment.pickupInstructions}
        </p>
      )}
      {fulfillment.deliveryInstructions && (
        <p className="mp-section-note text-sm mt-1 whitespace-pre-wrap">
          {fulfillment.deliveryInstructions}
        </p>
      )}
    </section>
  );
};

export default MarketplaceFulfillmentSummary;
