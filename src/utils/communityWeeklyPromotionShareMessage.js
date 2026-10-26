// WhatsApp renders *text* as bold. Lines in the default copy use "* " as a bullet.
export const COMMUNITY_WEEKLY_PROMOTION_SITE_BASE_URL = 'https://www.bastabasket.com';

const STORE_LINK_LABEL = 'ועוד חקלאים באתר של הבסטה:';
const WHATSAPP_LINK_LABEL = 'לקבוצה וואטסאפ ביישוב:';
const CLOSING_LINE_PATTERN = /(?:^|\n\n)(מגיעים[^\n]*)$/;

export const COMMUNITY_WEEKLY_PROMOTION_DEFAULT_SHARE_BODY = String.raw`🍄פטריות של מוגו🍄
* דואט שמפיניון פורטבלה - 15.5₪
* רעמת האריה - 14.9₪
* ארינג'י - 12.9₪ עוד

🥬ירוקים🥬
* לאליק\סלנובה\תרד - 8₪
* לבבות קיסר\בצל ירוק - 6₪ ועוד

💣רימונים💣
* קרטון 6 ק"ג - 40₪
* קרטון 6 ק"ג למיץ - 24₪

🥔משק דמארי אורגני🥔
* תפוא אדום\באטר - 4 ק"ג 20₪ ועוד

🫐פירות יער - משק 77🫐
* פטל אדום - 2 ב-40₪

🥑אבוקדו🥑
* אטינגר 3 ק"ג - 25₪
* גויאבה - 11.9₪ לק"ג

מגיעים ברביעי.`;

const clean = (value) => String(value || '').trim();

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const stripGeneratedLinkBlocks = (text) => {
  const labels = [STORE_LINK_LABEL, WHATSAPP_LINK_LABEL].map(escapeRegExp).join('|');
  return String(text || '')
    .replace(new RegExp(`(?:^|\\n\\n)(?:${labels})\\n\\S+(?=\\n\\n|$)`, 'g'), '')
    .replace(new RegExp(`(?:^|\\n\\n)(?:${labels})(?=\\n\\n|$)`, 'g'), '')
    .replaceAll('{{storeUrl}}', '')
    .replaceAll('{{whatsappUrl}}', '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const splitClosingLine = (text) => {
  const match = text.match(CLOSING_LINE_PATTERN);
  if (!match) return { body: text, closing: '' };
  return {
    body: text.slice(0, match.index).trim(),
    closing: match[1].trim(),
  };
};

const buildCommunityLinkFooter = ({ storeUrl, whatsappGroupLink } = {}) => {
  const blocks = [];
  const store = clean(storeUrl);
  const group = clean(whatsappGroupLink);
  if (store) blocks.push(`${STORE_LINK_LABEL}\n${store}`);
  if (group) blocks.push(`${WHATSAPP_LINK_LABEL}\n${group}`);
  return blocks.join('\n\n');
};

export const communityWeeklyPromotionManualShareMessage = (promotion) => clean(
  promotion?.shareConfig?.message || promotion?.message
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
  storeUrl,
  whatsappGroupLink,
} = {}) => {
  const manual = communityWeeklyPromotionManualShareMessage(promotion);
  const source = stripGeneratedLinkBlocks(manual || COMMUNITY_WEEKLY_PROMOTION_DEFAULT_SHARE_BODY);
  const { body, closing } = splitClosingLine(source);
  const links = buildCommunityLinkFooter({ storeUrl, whatsappGroupLink });
  return [body, links, closing].filter(Boolean).join('\n\n').trim();
};
