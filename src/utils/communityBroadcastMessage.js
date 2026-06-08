export const DEFAULT_BROADCAST_TEMPLATE = {
  intro: 'היי חברים שבוע טוב, האתר פתוח להזמנות 🚜',
  productsBody: `* ירוקים שדה דוד - תרד, חסה לאליק\\סלנובה 8₪, סלק עלים 4.5₪ ועוד.
* פטריות רווחה - דואט פורטובלו/שמפיניון 14.90₪.
* פירות הדר כוכב - תפוז\\קלמנטינה 3 ק"ג 15₪\\18₪.
* אוכמניות עין הבשור - 4 מארזים 50₪, 12 135₪
* פירות קיץ כוכב - אפרסק 15.5₪\\12.5₪
* חווה אורגנית זיקים - קרטון תפוא 4.5₪ לק"ג, כרוב 5.9₪
* מוצרי בסיס סיטונאי - מלפפון, עגבנייה ועוד`,
  linkLabel: 'קישור לאתר:',
  siteBaseUrl: 'https://www.bastabasket.com',
  category: 'הכל',
  defaultDeliveryNote: 'מגיעים ברביעי.',
};

export function buildCommunityStoreLink(communityName, template = {}) {
  const customLink = String(template.storeLink || '').trim();
  if (customLink) return customLink;

  const baseUrl = String(template.siteBaseUrl || DEFAULT_BROADCAST_TEMPLATE.siteBaseUrl).trim()
    || DEFAULT_BROADCAST_TEMPLATE.siteBaseUrl;
  const category = String(template.category || DEFAULT_BROADCAST_TEMPLATE.category).trim()
    || DEFAULT_BROADCAST_TEMPLATE.category;
  const community = String(communityName || '').trim();
  if (!community) return baseUrl;

  const params = new URLSearchParams();
  params.set('category', category);
  params.set('community', community);
  return `${baseUrl.replace(/\/$/, '')}/?${params.toString()}`;
}

export function buildCommunityBroadcastMessage({
  communityName,
  community = {},
  template = {},
}) {
  const mergedTemplate = { ...DEFAULT_BROADCAST_TEMPLATE, ...template };
  const intro = String(mergedTemplate.intro || '').trim();
  const productsBody = String(mergedTemplate.productsBody || '').trim();
  const linkLabel = String(mergedTemplate.linkLabel || DEFAULT_BROADCAST_TEMPLATE.linkLabel).trim();
  const storeLink = buildCommunityStoreLink(communityName, {
    ...mergedTemplate,
    storeLink: community.storeLink,
  });
  const deliveryNote = String(
    community.broadcastDeliveryNote || mergedTemplate.defaultDeliveryNote || ''
  ).trim();

  const parts = [];
  if (intro) parts.push(intro);
  if (productsBody) parts.push(productsBody);
  if (linkLabel && storeLink) {
    parts.push(`${linkLabel}\n${storeLink}`);
  } else if (storeLink) {
    parts.push(storeLink);
  }
  if (deliveryNote) parts.push(deliveryNote);

  return parts.join('\n\n').trim();
}

export function buildWhatsAppShareUrl(message) {
  const text = String(message || '').trim();
  if (!text) return '';
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
