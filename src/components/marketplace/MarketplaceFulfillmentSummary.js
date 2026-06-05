import React from 'react';
import {
  formatFulfillmentSummaryLines,
  normalizeStoreFulfillment,
  resolvePromotionFulfillment,
} from '../../constants/marketplaceFulfillment';
import './marketplace.css';

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
    <section className="mp-panel mp-fulfillment-summary mp-fulfillment-board" aria-label={title}>
      <h2 className="mp-section-title mp-section-title-chalk mb-3">{title}</h2>
      <ul className="mp-fulfillment-summary-list">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {fulfillment.pickupInstructions && (
        <p className="mp-section-note text-sm mt-3 whitespace-pre-wrap">
          <strong>הוראות איסוף:</strong> {fulfillment.pickupInstructions}
        </p>
      )}
      {fulfillment.deliveryInstructions && (
        <p className="mp-section-note text-sm mt-2 whitespace-pre-wrap">
          <strong>משלוח:</strong> {fulfillment.deliveryInstructions}
        </p>
      )}
    </section>
  );
};

export default MarketplaceFulfillmentSummary;
