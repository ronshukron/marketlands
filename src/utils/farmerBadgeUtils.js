export const FARMER_BADGE_SETTINGS_DOC_ID = '_farmerBadges';

const APOSTROPHE_MARKS = /[\u05F3\u05F4\u2018\u2019\u201C\u201D'ʼ`׳״"]/g;

export const normalizeFarmerBadgeBusinessIds = (businessIds) => {
  if (!Array.isArray(businessIds)) return [];

  return [...new Set(
    businessIds
      .filter((businessId) => typeof businessId === 'string')
      .map((businessId) => businessId.trim())
      .filter(Boolean)
  )];
};

export const normalizeFarmerBadgeBusinessName = (name) => {
  if (typeof name !== 'string') return '';
  return name
    .normalize('NFKC')
    .replace(APOSTROPHE_MARKS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
};

export const farmerBadgeNameKeys = (name) => {
  const normalized = normalizeFarmerBadgeBusinessName(name);
  if (!normalized) return [];
  const keys = [normalized];
  const withoutMeshek = normalized.replace(/^משק\s+/, '');
  if (withoutMeshek && withoutMeshek !== normalized) keys.push(withoutMeshek);
  return keys;
};

export const normalizeFarmerBadgeBusinessNames = (businessNames) => (
  [...new Set(
    (Array.isArray(businessNames) ? businessNames : [])
      .filter((name) => typeof name === 'string')
      .map((name) => name.trim())
      .filter(Boolean)
  )]
);

export const getBusinessFarmerBadgeLabel = (business) => (
  business?.businessName || business?.name || business?.email || business?.id || ''
);

export const getFarmerBadgeGroupKey = (business) => {
  const keys = farmerBadgeNameKeys(getBusinessFarmerBadgeLabel(business));
  return keys[0] || String(business?.id || '');
};

export const groupBusinessesForFarmerBadge = (businesses) => {
  const groups = new Map();

  (Array.isArray(businesses) ? businesses : []).forEach((business) => {
    const key = getFarmerBadgeGroupKey(business);
    if (!key) return;
    const existing = groups.get(key);
    if (existing) {
      existing.ids.push(business.id);
      existing.businesses.push(business);
      if (!existing.label && getBusinessFarmerBadgeLabel(business)) {
        existing.label = getBusinessFarmerBadgeLabel(business);
      }
      return;
    }
    groups.set(key, {
      key,
      label: getBusinessFarmerBadgeLabel(business),
      ids: [business.id],
      businesses: [business],
    });
  });

  return [...groups.values()];
};

export const farmerBadgeGroupIsSelected = (group, selectedIds) => {
  const idSet = new Set(normalizeFarmerBadgeBusinessIds(selectedIds));
  return (group?.ids || []).some((id) => idSet.has(id));
};

export const toggleFarmerBadgeGroupIds = (selectedIds, group) => {
  const idSet = new Set(normalizeFarmerBadgeBusinessIds(selectedIds));
  const groupIds = normalizeFarmerBadgeBusinessIds(group?.ids);
  const isSelected = groupIds.some((id) => idSet.has(id));
  groupIds.forEach((id) => {
    if (isSelected) idSet.delete(id);
    else idSet.add(id);
  });
  return [...idSet];
};

const getProductFarmerBadgeIds = (product) => (
  [product?.businessId, product?.Owner_ID, product?.ownerId]
    .filter((businessId) => typeof businessId === 'string')
    .map((businessId) => businessId.trim())
    .filter(Boolean)
);

export const collectFarmerBadgeBusinessIds = (scheduleDocuments) => (
  normalizeFarmerBadgeBusinessIds(
    (Array.isArray(scheduleDocuments) ? scheduleDocuments : []).flatMap((schedule) => (
      Array.isArray(schedule?.farmerBadgeBusinessIds) ? schedule.farmerBadgeBusinessIds : []
    ))
  )
);

export const collectFarmerBadgeBusinessNames = (documents) => (
  normalizeFarmerBadgeBusinessNames(
    (Array.isArray(documents) ? documents : []).flatMap((document) => (
      Array.isArray(document?.farmerBadgeBusinessNames) ? document.farmerBadgeBusinessNames : []
    ))
  )
);

export const resolveFarmerBadgeSelection = ({ globalDoc, communitySchedules } = {}) => {
  if (globalDoc) {
    return {
      ids: normalizeFarmerBadgeBusinessIds(globalDoc.farmerBadgeBusinessIds),
      names: normalizeFarmerBadgeBusinessNames(globalDoc.farmerBadgeBusinessNames),
    };
  }
  return {
    ids: collectFarmerBadgeBusinessIds(communitySchedules),
    names: collectFarmerBadgeBusinessNames(communitySchedules),
  };
};

export const expandFarmerBadgeSelection = ({
  selectedIds,
  selectedNames,
  businesses,
} = {}) => {
  const ids = new Set(normalizeFarmerBadgeBusinessIds(selectedIds));
  const labelsFromSelectedDocs = (Array.isArray(businesses) ? businesses : [])
    .filter((business) => ids.has(business.id))
    .flatMap((business) => [business.businessName, business.name]);
  const seedNames = normalizeFarmerBadgeBusinessNames([
    ...(Array.isArray(selectedNames) ? selectedNames : []),
    ...labelsFromSelectedDocs,
  ]);
  const seedKeys = new Set(seedNames.flatMap(farmerBadgeNameKeys));

  (Array.isArray(businesses) ? businesses : []).forEach((business) => {
    const labelKeys = farmerBadgeNameKeys(getBusinessFarmerBadgeLabel(business));
    if (labelKeys.some((key) => seedKeys.has(key))) {
      if (business.id) ids.add(business.id);
      seedNames.push(...[business.businessName, business.name].filter((name) => (
        typeof name === 'string' && name.trim()
      )));
    }
  });

  return {
    ids: normalizeFarmerBadgeBusinessIds([...ids]),
    names: normalizeFarmerBadgeBusinessNames(seedNames),
  };
};

export const enrichProductsWithFarmerBadge = (products, businessIds, businessNames) => {
  const selectedBusinessIds = new Set(normalizeFarmerBadgeBusinessIds(businessIds));
  const selectedNameKeys = new Set(
    (Array.isArray(businessNames) ? businessNames : []).flatMap(farmerBadgeNameKeys)
  );

  return (Array.isArray(products) ? products : []).map((product) => ({
    ...product,
    hasFarmerBadge: getProductFarmerBadgeIds(product).some((businessId) => (
      selectedBusinessIds.has(businessId)
    )) || farmerBadgeNameKeys(product?.businessName).some((key) => (
      selectedNameKeys.has(key)
    )),
  }));
};
