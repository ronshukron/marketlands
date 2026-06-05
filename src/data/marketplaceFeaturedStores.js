/**
 * Pinned בסטה cards on the marketplace — not loaded from Firestore.
 * Use `href` for custom routes (e.g. main weekly store on `/`).
 */
import fieldImage from '../images/Field.jpg';

export const MARKETPLACE_FEATURED_STORES = [
  {
    id: 'bastaha-main-store',
    title: 'הבסקט של בסטה',
    businessName: 'הבסקט של בסטה',
    shortDescription: 'החנות של בסטה בסקט.',
    coverImageUrl: fieldImage,
    homeCommunity: 'כל הקהילות',
    businessKind: 'חנות ראשית',
    tags: ['מכירה שבועית'],
    href: '/',
    ctaLabel: 'למכירה השבועית ←',
    pinned: true,
  },
];
