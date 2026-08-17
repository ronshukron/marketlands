import React from 'react';
import CommunityDiscountWidget from './widgets/CommunityDiscountWidget';
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
