export const roundTo2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

export const getAverageWeightKg = (item) => {
  if (!item || item.measurementType !== 'unit') return null;
  const avg = Number(item.averageWeightKg);
  return avg > 0 ? avg : 1;
};

export const getEstimatedChargeableQuantity = (item) => {
  if (!item) return 0;
  const qty = Number(item.quantity) || 0;
  if (item.measurementType === 'unit') {
    const avg = getAverageWeightKg(item) || 1;
    return qty * avg;
  }
  return qty;
};

export const getEstimatedLineTotal = (item) => {
  if (!item) return 0;
  const price = Number(item.price) || 0;
  const chargeQty = getEstimatedChargeableQuantity(item);
  return roundTo2(chargeQty * price);
};
