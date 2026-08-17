const formatQuantity = (quantity) => {
  const numericQuantity = Number(quantity);
  if (!Number.isFinite(numericQuantity)) return '';
  return Number.isInteger(numericQuantity)
    ? String(numericQuantity)
    : String(Math.round(numericQuantity * 1000) / 1000);
};

export function buildGrowInvoiceItem(item = {}) {
  const numericQuantity = Number(item.quantity);
  const validQuantity = Number.isFinite(numericQuantity) && numericQuantity > 0;
  const baseDescription = item.name || item.productName || 'Unknown Item';
  const quantityLabel = formatQuantity(item.quantity);
  const isKgItem = item.measurementType === 'kg';

  return {
    quantity: validQuantity && Number.isInteger(numericQuantity) ? numericQuantity : 1,
    description: isKgItem && quantityLabel
      ? `${baseDescription} - ${quantityLabel} ק"ג`
      : baseDescription,
  };
}
