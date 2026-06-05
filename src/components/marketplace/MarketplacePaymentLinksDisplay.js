import React from 'react';
import { getActivePaymentLinksForStore } from '../../constants/marketplacePaymentLinks';
import './marketplace.css';

const MarketplacePaymentLinksDisplay = ({ store, title = 'קישורי תשלום' }) => {
  const links = getActivePaymentLinksForStore(store);

  if (links.length === 0) return null;

  return (
    <section className="mp-panel mp-store-payment-links" aria-label={title}>
      <h2 className="mp-section-title mp-section-title-chalk mb-3">{title}</h2>
      <p className="mp-section-note text-sm mb-4">
        תשלום ישירות לבעל הבסטה — לפי האמצעי שבחרתם בהזמנה
      </p>
      <div className="mp-store-payment-links-grid">
        {links.map((link) => (
          <div key={link.method} className="mp-store-payment-link-item">
            {link.url ? (
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mp-btn mp-btn-primary w-full justify-center"
              >
                {link.label}
              </a>
            ) : (
              <div className="mp-receipt-bank-box">
                <strong>{link.label}</strong>
                {link.instructions && (
                  <p className="whitespace-pre-wrap text-sm mt-1">{link.instructions}</p>
                )}
              </div>
            )}
            {link.url && link.instructions && (
              <p className="mp-section-note text-xs mt-2 whitespace-pre-wrap">{link.instructions}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};

export default MarketplacePaymentLinksDisplay;
