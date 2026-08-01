import React from 'react';
import {
  PAYMENT_LINK_LABELS,
  PAYMENT_LINK_METHODS,
  validateStorePaymentLinks,
} from '../../constants/marketplacePaymentLinks';

const MarketplacePaymentLinksEditor = ({ paymentLinks, onChange, disabled = false, disabledNote }) => {
  const links = paymentLinks || {};
  const validation = validateStorePaymentLinks({ paymentLinks: links });

  const patchSlot = (method, patch) => {
    onChange({
      ...links,
      [method]: { ...links[method], ...patch },
    });
  };

  return (
    <div className="mp-payment-links-editor mp-stack">
      <div>
        <h3 className="mp-section-title text-base">קישורי תשלום ללקוחות</h3>
        <p className="mp-section-note text-sm mt-1">
          לאחר יצירת הזמנה, הלקוח יועבר אוטומטית לקישור התשלום שבחר (Bit, PayBox וכו׳). אם אין קישור תקין — יוצג עמוד האישור עם פרטי התשלום.
        </p>
        {disabled && disabledNote && (
          <p className="mp-alert mp-alert-warn text-sm mt-2">{disabledNote}</p>
        )}
      </div>

      {PAYMENT_LINK_METHODS.map((method) => {
        const slot = links[method] || { enabled: false, url: '', instructions: '' };
        const error = validation.errors[method];
        return (
          <div
            key={method}
            className={`mp-payment-link-slot ${slot.enabled ? 'is-active' : ''}`}
          >
            <label className="inline-flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={Boolean(slot.enabled)}
                disabled={disabled}
                onChange={(e) => patchSlot(method, { enabled: e.target.checked })}
              />
              {PAYMENT_LINK_LABELS[method]}
            </label>
            {slot.enabled && (
              <div className="mp-payment-link-fields">
                {method !== 'bank_transfer' ? (
                  <label className="mp-form-label">
                    קישור לתשלום
                    <input
                      className="mp-input"
                      type="url"
                      dir="ltr"
                      disabled={disabled}
                      value={slot.url}
                      onChange={(e) => patchSlot(method, { url: e.target.value })}
                      placeholder="https://..."
                      required
                      aria-invalid={Boolean(error)}
                    />
                    {error && <span className="mp-form-error" role="alert">{error}</span>}
                  </label>
                ) : (
                  <label className="mp-form-label">
                    פרטי העברה (יוצגו ללקוח)
                    <textarea
                      className="mp-input"
                      rows={3}
                      disabled={disabled}
                      value={slot.instructions}
                      onChange={(e) => patchSlot(method, { instructions: e.target.value })}
                      placeholder="בנק, סניף, חשבון, שם מוטב..."
                      required
                      aria-invalid={Boolean(error)}
                    />
                    {error && <span className="mp-form-error" role="alert">{error}</span>}
                  </label>
                )}
                {method !== 'bank_transfer' && (
                  <label className="mp-form-label">
                    הערה ללקוח (אופציונלי)
                    <input
                      className="mp-input"
                      disabled={disabled}
                      value={slot.instructions}
                      onChange={(e) => patchSlot(method, { instructions: e.target.value })}
                      placeholder="למשל: לציין מספר הזמנה בהערות"
                    />
                  </label>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default MarketplacePaymentLinksEditor;
