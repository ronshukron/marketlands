import React from 'react';
import {
  buildWhatsappLink,
  getEffectiveStoreContent,
  getStorePageTextSections,
} from '../../constants/marketplaceStoreContent';
import { normalizeStoreFulfillment } from '../../constants/marketplaceFulfillment';
import './marketplace.css';

const socialLinkLabel = (url) => {
  const lower = String(url).toLowerCase();
  if (lower.includes('facebook.com') || lower.includes('fb.com')) return 'Facebook';
  if (lower.includes('instagram.com')) return 'Instagram';
  if (lower.includes('wa.me') || lower.includes('whatsapp')) return 'WhatsApp';
  if (lower.includes('youtube.com')) return 'YouTube';
  if (lower.includes('tiktok.com')) return 'TikTok';
  try {
    const hostname = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return 'קישור';
  }
};

export const hasStoreContactSection = (store, business) => {
  const content = getEffectiveStoreContent(store, business);
  const phone = store?.phone || business?.phone;
  return (
    Boolean(content.contactIntro?.trim()) ||
    Boolean(phone) ||
    Boolean(buildWhatsappLink(phone)) ||
    Boolean(content.email) ||
    (content.whatsappContacts || []).length > 0
  );
};

export const hasStorePageEditorContent = (store, business, { showDeliverySection = true } = {}) => {
  if (getStorePageTextSections(store, business).length > 0) return true;
  if (hasStoreContactSection(store, business)) return true;

  const content = getEffectiveStoreContent(store, business);
  const fulfillment = normalizeStoreFulfillment(store);
  const hasStructuredFulfillment =
    fulfillment.pickupEnabled || fulfillment.deliveryEnabled;
  const socialLines = (content.socialLinks || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    (showDeliverySection &&
      !hasStructuredFulfillment &&
      Boolean(content.deliveryOptions?.trim())) ||
    socialLines.length > 0 ||
    Boolean(content.websiteUrl?.trim())
  );
};

const StoreContentDisplay = ({
  store,
  business,
  showDeliverySection = true,
  showGroupTitle = false,
}) => {
  const content = getEffectiveStoreContent(store, business);
  const textSections = getStorePageTextSections(store, business);
  const fulfillment = normalizeStoreFulfillment(store);
  const hasStructuredFulfillment =
    fulfillment.pickupEnabled || fulfillment.deliveryEnabled;
  const phone = store?.phone || business?.phone;
  const primaryWhatsapp = buildWhatsappLink(phone);
  const email = content.email;
  const websiteUrl = content.websiteUrl?.trim();
  const socialLines = (content.socialLinks || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const hasContact = hasStoreContactSection(store, business);
  const hasDelivery =
    showDeliverySection &&
    !hasStructuredFulfillment &&
    Boolean(content.deliveryOptions?.trim());
  const hasSocial = socialLines.length > 0 || Boolean(websiteUrl);

  if (!textSections.length && !hasContact && !hasDelivery && !hasSocial) {
    return null;
  }

  const showContactIntro =
    Boolean(content.contactIntro?.trim()) &&
    !textSections.some((section) => section.body === content.contactIntro.trim());

  return (
    <div className="mp-store-content mp-stack" id="stall-page-content">
      {showGroupTitle && textSections.length > 0 && (
        <header className="mp-store-content-group-head">
          <h2 className="mp-section-title mp-section-title-chalk">תוכן דף הבסטה</h2>
        </header>
      )}

      {textSections.map((section) => (
        <section
          key={section.id}
          className={`mp-panel mp-store-content-section mp-stall-story${
            section.id === 'customerNotice' ? ' mp-store-notice' : ''
          }`}
        >
          <h3 className="mp-section-title mp-section-title-chalk mb-3">{section.title}</h3>
          <p className="mp-stall-story-text whitespace-pre-wrap">{section.body}</p>
        </section>
      ))}

      {hasContact && (
        <section className="mp-panel mp-store-content-section">
          <h3 className="mp-section-title mp-section-title-chalk mb-3">דברו איתנו</h3>
          {showContactIntro && (
            <p className="mp-stall-story-text whitespace-pre-wrap mb-4">{content.contactIntro}</p>
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
                {email}
              </a>
            )}
          </div>
        </section>
      )}

      {hasDelivery && (
        <section className="mp-panel mp-store-content-section">
          <h3 className="mp-section-title mb-3">אפשרויות אספקה (טקסט חופשי)</h3>
          <p className="mp-stall-story-text whitespace-pre-wrap">{content.deliveryOptions}</p>
        </section>
      )}

      {hasSocial && (
        <section className="mp-panel mp-store-content-section">
          <h3 className="mp-section-title mb-3">תמצאו אותנו גם</h3>
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
                {socialLinkLabel(url)}
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default StoreContentDisplay;
