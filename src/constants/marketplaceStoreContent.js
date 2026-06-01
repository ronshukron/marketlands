/** Label text that must never be shown as customer-facing copy (bad paste / empty field). */
const STORE_CONTENT_PLACEHOLDER_FRAGMENTS = [
  'תיאור מלא (מופיע בדף הבסטה)',
  'תיאור קצר (מופיע בכרטיס בשוק)',
  'תיאור מלא',
];

/** Strip accidental label/placeholder text from saved store fields. */
export const cleanStoreContentField = (value) => {
  let text = String(value ?? '').trim();
  if (!text) return '';

  STORE_CONTENT_PLACEHOLDER_FRAGMENTS.forEach((fragment) => {
    text = text.split(fragment).join('').trim();
  });

  return text;
};

/** Default empty store page content (seller-editable sections). */
export const DEFAULT_MARKETPLACE_STORE_CONTENT = {
  aboutUs: '',
  customerNotice: '',
  contactIntro: '',
  email: '',
  whatsappContacts: [],
  additionalNotes: '',
  returnsPolicy: '',
  deliveryOptions: '',
  websiteUrl: '',
  socialLinks: '',
};

export const normalizeWhatsappContacts = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => ({
      label: String(entry?.label || '').trim(),
      phone: String(entry?.phone || '').trim(),
    }))
    .filter((entry) => entry.phone);
};

export const normalizeStoreContent = (source) => {
  const data = source && typeof source === 'object' ? source : {};
  return {
    aboutUs: cleanStoreContentField(data.aboutUs),
    customerNotice: cleanStoreContentField(data.customerNotice),
    contactIntro: cleanStoreContentField(data.contactIntro),
    email: cleanStoreContentField(data.email),
    whatsappContacts: normalizeWhatsappContacts(data.whatsappContacts),
    additionalNotes: cleanStoreContentField(data.additionalNotes),
    returnsPolicy: cleanStoreContentField(data.returnsPolicy),
    deliveryOptions: cleanStoreContentField(data.deliveryOptions),
    websiteUrl: cleanStoreContentField(data.websiteUrl),
    socialLinks: cleanStoreContentField(data.socialLinks),
  };
};

export const getStoreAboutText = (store, business) => {
  const legacy = cleanStoreContentField(store?.storeDescription || business?.storeDescription);
  const about = cleanStoreContentField(store?.aboutUs);
  if (about && legacy && about === legacy) return about;
  if (about) return about;
  return legacy;
};

export const buildWhatsappLink = (phone) => {
  if (!phone) return null;
  const digits = String(phone).replace(/^0/, '').replace(/\D/g, '');
  return digits ? `https://wa.me/972${digits}` : null;
};
