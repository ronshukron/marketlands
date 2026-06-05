/** Accidental paste of a form label only — exact value match. */
const STORE_CONTENT_EXACT_PLACEHOLDERS = new Set([
  'תיאור מלא (מופיע בדף הבסטה)',
  'תיאור קצר (מופיע בכרטיס בשוק)',
  'קצת עלינו',
  'הודעה ללקוחות',
  'יצירת קשר — הקדמה',
  'אימייל ליצירת קשר',
  'הערות ומידע נוסף',
  'מדיניות החזרות וביטולים',
  'אתר / קישור חיצוני',
  'רשתות חברתיות (קישור אחד בכל שורה)',
]);

/** Long form labels that may be pasted before real copy — strip prefix only. */
const STORE_CONTENT_PREFIX_PLACEHOLDERS = [
  'תיאור מלא (מופיע בדף הבסטה)',
  'תיאור קצר (מופיע בכרטיס בשוק)',
  'יצירת קשר — הקדמה',
];

/** Strip accidental label/placeholder text on display (never on save). */
export const cleanStoreContentField = (value) => {
  let text = String(value ?? '').trim();
  if (!text) return '';
  if (STORE_CONTENT_EXACT_PLACEHOLDERS.has(text)) return '';

  let changed = true;
  while (changed) {
    changed = false;
    for (const fragment of STORE_CONTENT_PREFIX_PLACEHOLDERS) {
      if (text.startsWith(fragment)) {
        text = text.slice(fragment.length).trim();
        changed = true;
      }
    }
  }

  if (!text || STORE_CONTENT_EXACT_PLACEHOLDERS.has(text)) return '';
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

/** Clean short card tagline (same placeholder stripping as store content fields). */
export const cleanShortDescription = (value) => cleanStoreContentField(value);

const pickFirstNonEmpty = (...values) => {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
};

const trimField = (value) => String(value ?? '').trim();

/** Store content fields for persistence or merge (optional label cleanup on save). */
export const extractStoreContentFields = (source, { clean = false } = {}) => {
  const data = source && typeof source === 'object' ? source : {};
  const text = (value) => {
    const trimmed = trimField(value);
    return clean ? cleanStoreContentField(trimmed) : trimmed;
  };

  return {
    storeDescription: text(data.storeDescription),
    aboutUs: text(data.aboutUs),
    customerNotice: text(data.customerNotice),
    contactIntro: text(data.contactIntro),
    email: text(data.email),
    whatsappContacts: normalizeWhatsappContacts(data.whatsappContacts),
    additionalNotes: text(data.additionalNotes),
    returnsPolicy: text(data.returnsPolicy),
    deliveryOptions: text(data.deliveryOptions),
    websiteUrl: text(data.websiteUrl),
    socialLinks: text(data.socialLinks),
  };
};

/** Merge marketplace store doc with legacy business profile copy. */
export const mergeStoreContentSources = (store, business) => {
  const fromStore = extractStoreContentFields(store);
  const fromBusiness = extractStoreContentFields(business);
  const legacyMoreInfo = String(business?.storeMoreInfo ?? '').trim();

  return {
    storeDescription: pickFirstNonEmpty(fromStore.storeDescription, fromBusiness.storeDescription),
    aboutUs: pickFirstNonEmpty(fromStore.aboutUs, fromBusiness.aboutUs),
    customerNotice: pickFirstNonEmpty(fromStore.customerNotice, fromBusiness.customerNotice),
    contactIntro: pickFirstNonEmpty(fromStore.contactIntro, fromBusiness.contactIntro),
    email: pickFirstNonEmpty(fromStore.email, fromBusiness.email),
    whatsappContacts: fromStore.whatsappContacts.length
      ? fromStore.whatsappContacts
      : fromBusiness.whatsappContacts,
    additionalNotes: pickFirstNonEmpty(
      fromStore.additionalNotes,
      fromBusiness.additionalNotes,
      legacyMoreInfo
    ),
    returnsPolicy: pickFirstNonEmpty(fromStore.returnsPolicy, fromBusiness.returnsPolicy),
    deliveryOptions: pickFirstNonEmpty(fromStore.deliveryOptions, fromBusiness.deliveryOptions),
    websiteUrl: pickFirstNonEmpty(fromStore.websiteUrl, fromBusiness.websiteUrl),
    socialLinks: pickFirstNonEmpty(fromStore.socialLinks, fromBusiness.socialLinks),
  };
};

const cleanStoreContentRecord = (content) => ({
  storeDescription: cleanStoreContentField(content.storeDescription),
  aboutUs: cleanStoreContentField(content.aboutUs),
  customerNotice: cleanStoreContentField(content.customerNotice),
  contactIntro: cleanStoreContentField(content.contactIntro),
  email: cleanStoreContentField(content.email),
  whatsappContacts: content.whatsappContacts,
  additionalNotes: cleanStoreContentField(content.additionalNotes),
  returnsPolicy: cleanStoreContentField(content.returnsPolicy),
  deliveryOptions: cleanStoreContentField(content.deliveryOptions),
  websiteUrl: cleanStoreContentField(content.websiteUrl),
  socialLinks: cleanStoreContentField(content.socialLinks),
});

export const normalizeStoreContent = (source) =>
  cleanStoreContentRecord(extractStoreContentFields(source, { clean: true }));

/** Customer-facing content: marketplace store + legacy business profile fallback. */
export const getEffectiveStoreContent = (store, business) =>
  cleanStoreContentRecord(mergeStoreContentSources(store, business));

/** Text blocks for public "תוכן דף הבסטה" (matches my-store editor fields). */
export const getStorePageTextSections = (store, business) => {
  const content = business ? getEffectiveStoreContent(store, business) : normalizeStoreContent(store);
  const sections = [];

  const pushUnique = (id, title, body) => {
    const text = String(body || '').trim();
    if (!text) return;
    if (sections.some((entry) => entry.body === text)) return;
    sections.push({ id, title, body: text });
  };

  pushUnique('storeDescription', 'תיאור מלא', content.storeDescription);
  pushUnique('aboutUs', 'קצת עלינו', content.aboutUs);
  pushUnique('customerNotice', 'הודעה ללקוחות', content.customerNotice);
  pushUnique('contactIntro', 'יצירת קשר', content.contactIntro);
  pushUnique('additionalNotes', 'הערות ומידע נוסף', content.additionalNotes);
  pushUnique('returnsPolicy', 'מדיניות החזרות וביטולים', content.returnsPolicy);

  return sections;
};

export const getStoreAboutText = (store, business) => {
  const content = getEffectiveStoreContent(store, business);
  const legacy = cleanStoreContentField(business?.storeDescription);
  if (content.aboutUs && content.storeDescription && content.aboutUs === content.storeDescription) {
    return content.aboutUs;
  }
  if (content.storeDescription) return content.storeDescription;
  if (content.aboutUs) return content.aboutUs;
  return legacy;
};

export const buildWhatsappLink = (phone) => {
  if (!phone) return null;
  const digits = String(phone).replace(/^0/, '').replace(/\D/g, '');
  return digits ? `https://wa.me/972${digits}` : null;
};
