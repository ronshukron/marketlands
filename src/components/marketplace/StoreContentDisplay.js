import React from 'react';
import { buildWhatsappLink, normalizeStoreContent } from '../../constants/marketplaceStoreContent';

const StoreContentDisplay = ({ store, business }) => {
  const content = normalizeStoreContent(store);
  const phone = store?.phone || business?.phone;
  const primaryWhatsapp = buildWhatsappLink(phone);
  const email = content.email;
  const websiteUrl = content.websiteUrl?.trim();
  const socialLines = (content.socialLinks || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const hasAbout = Boolean(content.aboutUs?.trim());
  const hasNotice = Boolean(content.customerNotice?.trim());
  const hasContact =
    Boolean(content.contactIntro?.trim()) ||
    phone ||
    primaryWhatsapp ||
    email ||
    (content.whatsappContacts || []).length > 0;
  const hasNotes = Boolean(content.additionalNotes?.trim());
  const hasReturns = Boolean(content.returnsPolicy?.trim());
  const hasDelivery = Boolean(content.deliveryOptions?.trim());
  const hasSocial = socialLines.length > 0 || websiteUrl;

  if (!hasAbout && !hasNotice && !hasContact && !hasNotes && !hasReturns && !hasDelivery && !hasSocial) {
    return null;
  }

  return (
    <div className="mp-store-content mp-stack">
      {hasAbout && (
        <section className="mp-panel mp-store-content-section">
          <h2 className="mp-section-title mb-3">קצת עלינו</h2>
          <p className="mp-store-content-text whitespace-pre-wrap">{content.aboutUs}</p>
        </section>
      )}

      {hasNotice && (
        <section className="mp-panel mp-store-content-section mp-store-notice">
          <h2 className="mp-section-title mb-3">הודעה ללקוחות</h2>
          <p className="mp-store-content-text whitespace-pre-wrap">{content.customerNotice}</p>
        </section>
      )}

      {hasContact && (
        <section className="mp-panel mp-store-content-section">
          <h2 className="mp-section-title mb-3">יצירת קשר</h2>
          {content.contactIntro && (
            <p className="mp-store-content-text whitespace-pre-wrap mb-4">{content.contactIntro}</p>
          )}
          <div className="mp-store-contact-actions">
            {phone && (
              <a href={`tel:${phone}`} className="mp-btn mp-btn-primary">
                {phone}
              </a>
            )}
            {primaryWhatsapp && (
              <a
                href={primaryWhatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="mp-btn mp-btn-wood"
              >
                WhatsApp
              </a>
            )}
            {content.whatsappContacts.map((contact) => {
              const link = buildWhatsappLink(contact.phone);
              if (!link) return null;
              return (
                <a
                  key={`${contact.label}-${contact.phone}`}
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mp-btn mp-btn-wood"
                >
                  WhatsApp{contact.label ? ` · ${contact.label}` : ''}
                </a>
              );
            })}
            {email && (
              <a href={`mailto:${email}`} className="mp-btn mp-btn-wood">
                אימייל
              </a>
            )}
          </div>
        </section>
      )}

      {hasNotes && (
        <section className="mp-panel mp-store-content-section">
          <h2 className="mp-section-title mb-3">הערות ומידע נוסף</h2>
          <p className="mp-store-content-text whitespace-pre-wrap">{content.additionalNotes}</p>
        </section>
      )}

      {hasReturns && (
        <section className="mp-panel mp-store-content-section">
          <h2 className="mp-section-title mb-3">מדיניות החזרות וביטולים</h2>
          <p className="mp-store-content-text whitespace-pre-wrap">{content.returnsPolicy}</p>
        </section>
      )}

      {hasDelivery && (
        <section className="mp-panel mp-store-content-section">
          <h2 className="mp-section-title mb-3">אפשרויות אספקה</h2>
          <p className="mp-store-content-text whitespace-pre-wrap">{content.deliveryOptions}</p>
        </section>
      )}

      {hasSocial && (
        <section className="mp-panel mp-store-content-section">
          <h2 className="mp-section-title mb-3">תמצאו אותנו גם כאן</h2>
          <div className="mp-store-contact-actions">
            {websiteUrl && (
              <a
                href={websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mp-btn mp-btn-wood"
              >
                אתר
              </a>
            )}
            {socialLines.map((url) => (
              <a
                key={url}
                href={url.startsWith('http') ? url : `https://${url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mp-btn mp-btn-wood"
              >
                קישור
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default StoreContentDisplay;
