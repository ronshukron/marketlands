export const COMMUNITY_WEEKLY_PROMOTION_SHARE_TITLE = 'מבצע לוס לידר של בסטה בסקט:';
export const COMMUNITY_WEEKLY_PROMOTION_SITE_BASE_URL = 'https://www.bastabasket.com';

const clean = (value) => String(value || '').trim();

const formatPromotionPrice = (value) => {
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0) return '';
  return Number.isInteger(price) ? String(price) : price.toFixed(2).replace(/\.00$/, '');
};

export const formatCommunityWeeklyPromotionShareItems = (products = []) => (
  (Array.isArray(products) ? products : [])
    .map((product) => {
      const name = clean(product?.name || product?.productName || product?.title);
      const price = formatPromotionPrice(product?.promotionPrice ?? product?.promotionalPrice);
      if (!name || !price) return '';
      return `• ${name} - ${price}₪`;
    })
    .filter(Boolean)
    .join('\n')
);

export const buildCommunityStoreUrlForCode = ({
  origin,
  communityCode,
  communityName,
} = {}) => {
  const base = clean(origin) || COMMUNITY_WEEKLY_PROMOTION_SITE_BASE_URL;
  const url = new URL(base.includes('://') ? base : `https://${base}`);
  url.search = '';
  url.hash = '';
  url.pathname = '/';
  if (clean(communityCode)) url.searchParams.set('c', clean(communityCode));
  else if (clean(communityName)) url.searchParams.set('community', clean(communityName));
  return url.toString();
};

export const buildCommunityWeeklyPromotionShareMessage = ({
  promotion,
  communityName,
  communityCode,
  storeUrl,
  whatsappGroupLink,
} = {}) => {
  const items = formatCommunityWeeklyPromotionShareItems(promotion?.productSnapshots);
  const store = clean(storeUrl);
  const groupLink = clean(whatsappGroupLink);
  const place = clean(communityName);

  const parts = [COMMUNITY_WEEKLY_PROMOTION_SHARE_TITLE];
  if (items) parts.push(items);
  if (groupLink) {
    parts.push(place ? `קבוצת הוואטסאפ של ${place}:\n${groupLink}` : groupLink);
  }
  if (store) {
    parts.push(place ? `להזמנה באתר (${place}):\n${store}` : `להזמנה באתר:\n${store}`);
  }
  return parts.join('\n\n').trim();
};
