import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import CommunityWeeklyPromotionUnlockModal from '../components/category-store/CommunityWeeklyPromotionUnlockModal';
import { usePickupSpot } from './PickupSpotContext';
import {
  getActivePromotionForCommunity,
  getCommunityPromotionUnlock,
} from '../services/communityWeeklyPromotionService';
import { getCommunityCode } from '../services/pickupSpotsService';
import {
  attachCommunityWeeklyPromotionFields,
  clearCommunityWeeklyPromotionFields,
  hasCommunityWeeklyPromotionFields,
} from '../utils/pricing';

const CommunityWeeklyPromotionContext = createContext(null);

export const communityWeeklyPromotionsEnabled = (
  process.env.REACT_APP_COMMUNITY_WEEKLY_PROMOTIONS_ENABLED !== 'false'
);

const cleanId = (value) => String(value || '').trim();

export const decorateCommunityWeeklyPromotionProduct = ({
  product,
  promotion,
  communityCode,
  unlocked,
}) => {
  if (!product) return product;
  const withoutStalePromotion = () => (
    hasCommunityWeeklyPromotionFields(product)
      ? clearCommunityWeeklyPromotionFields(product)
      : product
  );
  if (!promotion?.id || !communityCode) return withoutStalePromotion();

  const productId = cleanId(product.productId || product.id);
  const orderId = cleanId(product.orderId);
  if (!productId) return withoutStalePromotion();

  const matchingSnapshots = (Array.isArray(promotion.productSnapshots)
    ? promotion.productSnapshots
    : []
  ).filter((entry) => cleanId(entry?.productId || entry?.id) === productId);
  const snapshot = (
    (orderId && matchingSnapshots.find((entry) => cleanId(entry?.orderId) === orderId))
    || matchingSnapshots.find((entry) => !cleanId(entry?.orderId))
    || matchingSnapshots[0]
  );

  const fixedPrice = Number(snapshot?.promotionPrice);
  if (!snapshot || !Number.isFinite(fixedPrice) || fixedPrice < 0) {
    return withoutStalePromotion();
  }

  return attachCommunityWeeklyPromotionFields(product, {
    id: promotion.id,
    promotionPrice: fixedPrice,
    status: 'active',
    startsAt: promotion.startsAt,
    endsAt: promotion.endsAt,
    weekKey: promotion.weekKey,
    communityCode,
    unlocked: unlocked === true,
    schemaVersion: promotion.schemaVersion,
    pricingVersion: promotion.pricingVersion,
    productId,
    orderId: cleanId(snapshot.orderId) || orderId,
  });
};

export const useCommunityWeeklyPromotion = () => {
  const value = useContext(CommunityWeeklyPromotionContext);
  if (!value) {
    throw new Error(
      'useCommunityWeeklyPromotion must be used within CommunityWeeklyPromotionProvider',
    );
  }
  return value;
};

export const CommunityWeeklyPromotionProvider = ({ children }) => {
  const { selectedPickupSpot, hasLoadedFromStorage } = usePickupSpot();
  const [promotion, setPromotion] = useState(null);
  const [unlock, setUnlock] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const requestIdRef = useRef(0);

  const communityCode = useMemo(
    () => getCommunityCode(selectedPickupSpot),
    [selectedPickupSpot],
  );

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;

    if (!communityWeeklyPromotionsEnabled || !communityCode) {
      setPromotion(null);
      setUnlock(null);
      setError(null);
      setLoading(false);
      return null;
    }

    setLoading(true);
    setError(null);
    try {
      const activePromotion = await getActivePromotionForCommunity(communityCode, {
        communityName: selectedPickupSpot,
      });
      let deterministicUnlock = null;
      if (activePromotion) {
        try {
          deterministicUnlock = await getCommunityPromotionUnlock(
            activePromotion.id,
            communityCode,
          );
        } catch (unlockError) {
          console.warn('Failed to read weekly promotion unlock', unlockError);
        }
      }

      if (requestId !== requestIdRef.current) return null;
      setPromotion(activePromotion);
      setUnlock(deterministicUnlock);
      return { promotion: activePromotion, unlock: deterministicUnlock };
    } catch (loadError) {
      if (requestId !== requestIdRef.current) return null;
      setPromotion(null);
      setUnlock(null);
      setError(loadError);
      return null;
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [communityCode, selectedPickupSpot]);

  useEffect(() => {
    if (!hasLoadedFromStorage) return undefined;
    refresh();
    return () => {
      requestIdRef.current += 1;
    };
  }, [hasLoadedFromStorage, refresh]);

  const unlocked = Boolean(
    promotion
    && unlock?.unlocked === true
    && (!unlock.promotionId || unlock.promotionId === promotion.id)
    && (!unlock.communityCode || unlock.communityCode === communityCode),
  );

  const decorateProduct = useCallback((product) => (
    decorateCommunityWeeklyPromotionProduct({
      product,
      promotion,
      communityCode,
      unlocked,
    })
  ), [communityCode, promotion, unlocked]);

  const openUnlockModal = useCallback(() => {
    if (communityWeeklyPromotionsEnabled && promotion && communityCode && !unlocked) {
      setUnlockModalOpen(true);
    }
  }, [communityCode, promotion, unlocked]);

  const closeUnlockModal = useCallback(() => setUnlockModalOpen(false), []);
  const handleUnlocked = useCallback(async () => {
    await refresh();
    setUnlockModalOpen(false);
  }, [refresh]);

  const value = useMemo(() => ({
    enabled: communityWeeklyPromotionsEnabled,
    selectedCommunityCode: communityCode,
    communityCode,
    activePromotion: promotion,
    promotion,
    unlock,
    unlocked,
    loading,
    error,
    refresh,
    decorateProduct,
    openUnlockModal,
  }), [
    communityCode,
    decorateProduct,
    error,
    loading,
    openUnlockModal,
    promotion,
    refresh,
    unlock,
    unlocked,
  ]);

  return (
    <CommunityWeeklyPromotionContext.Provider value={value}>
      {children}
      <CommunityWeeklyPromotionUnlockModal
        open={unlockModalOpen}
        promotion={promotion}
        communityCode={communityCode}
        communityName={selectedPickupSpot}
        onClose={closeUnlockModal}
        onUnlocked={handleUnlocked}
      />
    </CommunityWeeklyPromotionContext.Provider>
  );
};

export default CommunityWeeklyPromotionContext;
