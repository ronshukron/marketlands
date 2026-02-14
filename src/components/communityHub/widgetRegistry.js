import React from 'react';
import CommunityDiscountWidget from './widgets/CommunityDiscountWidget';
import CommunityStatsWidget from './widgets/CommunityStatsWidget';
import PopularItemsWidget from './widgets/PopularItemsWidget';
import ShareWidget from './widgets/ShareWidget';
import RecipeWidget from './widgets/RecipeWidget';

/**
 * Widget registry – maps widget IDs to their component and metadata.
 * Each widget receives { communityName } as a prop.
 */
const WIDGET_REGISTRY = {
  communityDiscount: {
    id: 'communityDiscount',
    component: CommunityDiscountWidget,
    title: 'הנחת קהילה',
    icon: '💰',
    description: 'מעקב אחר הנחות קהילתיות לפי סכום הזמנות שבועי',
  },
  communityStats: {
    id: 'communityStats',
    component: CommunityStatsWidget,
    title: 'סטטיסטיקות קהילה',
    icon: '📊',
    description: 'נתוני הזמנות שבועיים ומגמות',
  },
  popularItems: {
    id: 'popularItems',
    component: PopularItemsWidget,
    title: 'מוצרים פופולריים',
    icon: '🔥',
    description: 'המוצרים הנמכרים ביותר בקהילה',
  },
  share: {
    id: 'share',
    component: ShareWidget,
    title: 'שיתוף ומכרים',
    icon: '📤',
    description: 'שיתוף לינק הקהילה והזמנת חברים',
  },
  recipes: {
    id: 'recipes',
    component: RecipeWidget,
    title: 'מתכונים',
    icon: '🍳',
    description: 'שיתוף וצפייה במתכונים של חברי הקהילה',
  },
};

/**
 * Get a widget component by its ID.
 */
export const getWidgetById = (widgetId) => {
  return WIDGET_REGISTRY[widgetId] || null;
};

/**
 * Get all registered widget definitions (for admin config).
 */
export const getAllWidgets = () => {
  return Object.values(WIDGET_REGISTRY);
};

export default WIDGET_REGISTRY;
