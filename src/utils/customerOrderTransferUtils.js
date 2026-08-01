import { getEstimatedLineTotal } from './pricing';
import {
  buildStableLineId,
  ensureLineIdsInBreakdown,
  roundTo,
  safeNumber,
} from '../components/adminV5/deliveryWeighingV5/v7/orderDraftUtils';

const productNameOf = (product = {}) => product.name || product.productName || '';

const TRANSFER_OMIT_LINE_FIELDS = new Set([
  'weighing',
  'actualQuantity',
  'paymentReference',
  'weights',
  'audit',
  'settled',
  'settledAt',
  'excluded',
  'excludedAt',
  'lineId',
  'lineSeed',
  'productId',
  'productName',
  'quantity',
  'price',
  'selectedOption',
  'catalogNumber',
  'vatType',
  'measurementType',
  'unitSize',
  'averageWeightKg',
  'pricePerUnit',
  'quantityDiscount',
  'estimatedLineTotal',
  'businessOrderKey',
  'businessId',
]);

/** Line-level payment/weighing state stays on the source line; new target lines start fresh. */
const stripTransferInheritedRuntimeFields = (sourceLine = {}) => Object.fromEntries(
  Object.entries(sourceLine).filter(([key]) => !TRANSFER_OMIT_LINE_FIELDS.has(key)),
);

const buildTargetLine = ({
  orderId,
  sourceLine,
  quantity,
  targetBusinessOrderKey,
  targetProduct,
  transferId,
}) => {
  const productId = targetProduct.id || targetProduct.productId || '';
  const productName = productNameOf(targetProduct);
  const selectedOption = targetProduct.selectedOption
    || targetProduct.options?.[0]
    || sourceLine.selectedOption
    || 'None';
  const lineSeed = `transfer-${transferId}`;
  const nextLine = {
    ...stripTransferInheritedRuntimeFields(sourceLine),
    productId,
    productName,
    quantity,
    price: safeNumber(targetProduct.price),
    selectedOption,
    catalogNumber: targetProduct.catalogNumber || '',
    vatType: targetProduct.vatType ?? 3,
    measurementType: targetProduct.measurementType || 'kg',
    unitSize: safeNumber(targetProduct.unitSize, 1),
    averageWeightKg: safeNumber(targetProduct.averageWeightKg, 1),
    pricePerUnit: safeNumber(targetProduct.pricePerUnit ?? targetProduct.price),
    quantityDiscount: targetProduct.quantityDiscount || null,
    businessOrderKey: targetBusinessOrderKey,
    lineSeed,
  };
  nextLine.estimatedLineTotal = getEstimatedLineTotal(nextLine);
  nextLine.lineId = buildStableLineId({
    orderId,
    businessOrderKey: targetBusinessOrderKey,
    productId,
    productName,
    selectedOption,
    lineSeed,
  });
  return nextLine;
};

const recomputeBreakdown = (breakdown = {}) => Object.fromEntries(
  Object.entries(breakdown)
    .filter(([, businessOrder]) => (businessOrder?.items || []).length > 0)
    .map(([key, businessOrder]) => {
      const items = businessOrder.items.map((item) => ({
        ...item,
        estimatedLineTotal: getEstimatedLineTotal(item),
      }));
      return [key, {
        ...businessOrder,
        items,
        subTotal: roundTo(
          items.reduce((sum, item) => sum + safeNumber(item.estimatedLineTotal), 0),
          2,
        ),
      }];
    }),
);

export function transferCustomerOrderQuantity({
  orderId,
  orderBreakdown,
  sourceLineId,
  quantity,
  targetBusinessOrderKey,
  targetBusiness,
  targetProduct,
  transferId,
  deliveryFee = 0,
}) {
  if (!orderId || !sourceLineId || !targetBusinessOrderKey || !targetBusiness?.id || !targetProduct || !transferId) {
    throw new Error('חסרים פרטים לביצוע ההעברה');
  }

  const transferQuantity = safeNumber(quantity);
  if (transferQuantity <= 0) throw new Error('כמות ההעברה חייבת להיות גדולה מאפס');

  const { breakdown: normalized } = ensureLineIdsInBreakdown(orderId, orderBreakdown || {});
  let sourceEntry = null;
  Object.entries(normalized).some(([businessOrderKey, businessOrder]) => {
    const itemIndex = (businessOrder.items || []).findIndex((item) => item.lineId === sourceLineId);
    if (itemIndex < 0) return false;
    sourceEntry = { businessOrderKey, businessOrder, itemIndex, item: businessOrder.items[itemIndex] };
    return true;
  });
  if (!sourceEntry) throw new Error('פריט המקור לא נמצא בהזמנה');
  if (sourceEntry.businessOrder.businessId === targetBusiness.id) {
    throw new Error('יש לבחור עסק יעד שונה מעסק המקור');
  }

  const sourceQuantity = safeNumber(sourceEntry.item.quantity);
  if (transferQuantity > sourceQuantity) throw new Error('כמות ההעברה גדולה מכמות המקור');

  const next = { ...normalized };
  const remainingQuantity = roundTo(sourceQuantity - transferQuantity, 3);
  const sourceItems = [...sourceEntry.businessOrder.items];
  if (remainingQuantity > 0) {
    sourceItems[sourceEntry.itemIndex] = {
      ...sourceEntry.item,
      quantity: remainingQuantity,
      estimatedLineTotal: getEstimatedLineTotal({ ...sourceEntry.item, quantity: remainingQuantity }),
    };
  } else {
    sourceItems.splice(sourceEntry.itemIndex, 1);
  }
  next[sourceEntry.businessOrderKey] = {
    ...sourceEntry.businessOrder,
    items: sourceItems,
  };

  const targetLine = buildTargetLine({
    orderId,
    sourceLine: sourceEntry.item,
    quantity: transferQuantity,
    targetBusinessOrderKey,
    targetProduct,
    transferId,
  });
  const existingTarget = next[targetBusinessOrderKey] || {};
  next[targetBusinessOrderKey] = {
    ...existingTarget,
    businessId: targetBusiness.id,
    businessName: targetBusiness.businessName || targetBusiness.name || '',
    items: [...(existingTarget.items || []), targetLine],
  };

  const breakdown = recomputeBreakdown(next);
  const itemsTotal = Object.values(breakdown).reduce(
    (sum, businessOrder) => sum + safeNumber(businessOrder.subTotal),
    0,
  );

  return {
    orderBreakdown: breakdown,
    businessIds: [...new Set(
      Object.values(breakdown).map((businessOrder) => businessOrder.businessId).filter(Boolean),
    )],
    grandTotal: roundTo(itemsTotal + safeNumber(deliveryFee), 2),
    audit: {
      transferId,
      sourceBusinessOrderKey: sourceEntry.businessOrderKey,
      sourceBusinessId: sourceEntry.businessOrder.businessId || '',
      sourceLineId,
      sourceProductId: sourceEntry.item.productId || '',
      sourceProductName: sourceEntry.item.productName || '',
      quantity: transferQuantity,
      targetBusinessOrderKey,
      targetBusinessId: targetBusiness.id,
      targetBusinessName: targetBusiness.businessName || targetBusiness.name || '',
      targetProductId: targetLine.productId,
      targetProductName: targetLine.productName,
      targetLineId: targetLine.lineId,
    },
  };
}
