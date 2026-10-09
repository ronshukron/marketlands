import { useCallback, useEffect, useMemo, useState } from 'react';
import { getCommunityCode } from '../../../../services/pickupSpotsService';
import { getDiscountConfig } from '../../../../services/communityDiscountService';
import { fetchWeeklyPromotionsForWeekV7, fetchWeeklyPromotionUnlocksV7 } from '../apiV7';
import { getOrderCommunityName } from './batchCommunityChargeV7';
import { findUnlockedWeeklyPromotion, resolveWeeklyPromotionForOrder } from './weeklyPromotionSettlementV7';

/**
 * Loads the weekly promotions of `selectedWeek` plus the unlock state of every
 * community that has orders, so charging can give promotion prices to orders
 * placed before their community unlocked the promotion.
 */
export default function useWeeklyPromotionSettlementV7({ selectedWeek, orders = [] }) {
  const [promotions, setPromotions] = useState([]);
  const [unlocksByKey, setUnlocksByKey] = useState({});
  const [autoApply, setAutoApply] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const communityCodesKey = useMemo(() => (
    Array.from(new Set((orders || [])
      .map((order) => getCommunityCode(getOrderCommunityName(order)))
      .filter(Boolean)))
      .sort()
      .join('|')
  ), [orders]);

  useEffect(() => {
    let cancelled = false;
    getDiscountConfig()
      .then((config) => {
        if (!cancelled) setAutoApply(config?.autoApplyWeeklyPromotionInV7 === true);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [reloadToken]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedWeek) {
      setPromotions([]);
      setUnlocksByKey({});
      return undefined;
    }
    (async () => {
      try {
        const weekPromotions = await fetchWeeklyPromotionsForWeekV7(selectedWeek);
        const codes = communityCodesKey ? communityCodesKey.split('|') : [];
        const unlocks = weekPromotions.length > 0
          ? await fetchWeeklyPromotionUnlocksV7(weekPromotions, codes)
          : {};
        if (cancelled) return;
        setPromotions(weekPromotions);
        setUnlocksByKey(unlocks);
      } catch (error) {
        console.error(error);
        if (cancelled) return;
        setPromotions([]);
        setUnlocksByKey({});
      }
    })();
    return () => { cancelled = true; };
  }, [communityCodesKey, reloadToken, selectedWeek]);

  const getOrderWeeklyPromotion = useCallback((order, items = [], draft = {}) => {
    if (!order || promotions.length === 0) return null;
    const communityCode = getCommunityCode(getOrderCommunityName(order));
    const promotion = findUnlockedWeeklyPromotion({
      promotions,
      weekKey: selectedWeek,
      communityCode,
      unlocksByKey,
    });
    return resolveWeeklyPromotionForOrder({
      items,
      removedLineIds: draft?.removedLineIds || {},
      promotion,
      communityCode,
    });
  }, [promotions, selectedWeek, unlocksByKey]);

  const refresh = useCallback(() => setReloadToken((value) => value + 1), []);

  return {
    autoApply,
    hasPromotions: promotions.length > 0,
    getOrderWeeklyPromotion,
    refresh,
  };
}
