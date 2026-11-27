import { useEffect, useMemo, useState } from 'react';
import { getBusinessProductPromotions } from '../../services/productPromotionService';

// Farmers' shared promotions ("N for ₪X" across products) for the products in
// a recurring basket, so the editors price lines like the delivery will.
// Each farmer is read once; a read that fails counts as no promotions.
export default function useBusinessPromotions(lines = [], productInfo = {}) {
  const [promotionsByBusinessId, setPromotionsByBusinessId] = useState({});
  const businessIdsKey = useMemo(() => [...new Set(lines
    .map((line) => productInfo[line.productId]?.businessId || line.businessId || '')
    .filter(Boolean))]
    .sort()
    .join(','), [lines, productInfo]);

  useEffect(() => {
    if (!businessIdsKey) return undefined;
    const missing = businessIdsKey.split(',').filter((id) => !(id in promotionsByBusinessId));
    if (missing.length === 0) return undefined;
    let active = true;
    Promise.all(missing.map(async (id) => {
      try {
        return [id, await getBusinessProductPromotions(id)];
      } catch {
        return [id, []];
      }
    })).then((entries) => {
      if (active) setPromotionsByBusinessId((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    });
    return () => { active = false; };
  }, [businessIdsKey, promotionsByBusinessId]);

  return promotionsByBusinessId;
}
