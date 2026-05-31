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
    aboutUs: data.aboutUs || '',
    customerNotice: data.customerNotice || '',
    contactIntro: data.contactIntro || '',
    email: data.email || '',
    whatsappContacts: normalizeWhatsappContacts(data.whatsappContacts),
    additionalNotes: data.additionalNotes || '',
    returnsPolicy: data.returnsPolicy || '',
    deliveryOptions: data.deliveryOptions || '',
    websiteUrl: data.websiteUrl || '',
    socialLinks: data.socialLinks || '',
  };
};

export const buildWhatsappLink = (phone) => {
  if (!phone) return null;
  const digits = String(phone).replace(/^0/, '').replace(/\D/g, '');
  return digits ? `https://wa.me/972${digits}` : null;
};
