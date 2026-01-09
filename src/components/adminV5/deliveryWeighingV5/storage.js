const storageKeyForWeek = (weekKey) => `deliveryWeighingV5::${weekKey || 'unknown_week'}`;

export function loadWeighingState({ weekKey }) {
  try {
    const raw = localStorage.getItem(storageKeyForWeek(weekKey));
    if (!raw) return { byOrderId: {} };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { byOrderId: {} };
    if (!parsed.byOrderId || typeof parsed.byOrderId !== 'object') return { byOrderId: {} };
    return parsed;
  } catch (e) {
    console.error('Failed to load delivery weighing state', e);
    return { byOrderId: {} };
  }
}

export function saveWeighingState({ weekKey, state }) {
  try {
    localStorage.setItem(storageKeyForWeek(weekKey), JSON.stringify(state || { byOrderId: {} }));
  } catch (e) {
    console.error('Failed to save delivery weighing state', e);
  }
}

export function upsertOrderWeighing({
  weekKey,
  orderId,
  patch,
}) {
  const current = loadWeighingState({ weekKey });
  const prev = current.byOrderId?.[orderId] || {};
  const next = {
    ...current,
    byOrderId: {
      ...(current.byOrderId || {}),
      [orderId]: {
        ...prev,
        ...(patch || {}),
        updatedAtIso: new Date().toISOString(),
      },
    },
  };
  saveWeighingState({ weekKey, state: next });
  return next;
}


