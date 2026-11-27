import React from 'react';

// Home delivery is shown to customers at checkout but not charged by default
// (the owner's choice). In V7/V8 the admin can add it to one order before
// charging: a regular delayed order gets a delivery line in the settlement
// (within the card hold), a weekly-basket order asks the server to add it
// (chargeSubscriptionOrder, chargeDeliveryFee).

export const SHIPPING_PRODUCT_ID = 'Mdean61FIezxRcMUZjVn';
export const DELIVERY_CATALOG_NUMBER = process.env.REACT_APP_SHIPPING_CATALOG_NUMBER || '118';

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

/** The order's home-delivery fee, or 0 (pickup, box collection, free). */
export const getOrderDeliveryFee = (order) => {
  const details = order?.customerDetails || order?.rawData?.customerDetails || {};
  const option = details.deliveryOption || details.deliveryDetails?.type || '';
  if (option !== 'homeDelivery') return 0;
  const fee = Number(details.deliveryDetails?.deliveryFee);
  return Number.isFinite(fee) && fee > 0 ? roundMoney(fee) : 0;
};

/** The delivery line added to a regular delayed order's settlement. */
export const buildDeliveryInvoiceLine = (fee) => {
  const price = roundMoney(fee);
  return {
    lineId: 'delivery-fee',
    productId: SHIPPING_PRODUCT_ID,
    productName: 'משלוח עד הבית',
    catalogNumber: DELIVERY_CATALOG_NUMBER,
    vatType: 1,
    requestedQuantity: 1,
    actualQuantity: 1,
    pricePerUnit: price,
    linePrice: price,
    measurementType: 'package',
    weighSource: 'delivery_fee',
    isDeliveryFee: true,
  };
};

export const DELIVERY_CHARGE_TEXT = {
  he: {
    label: (fee) => `משלוח עד הבית ₪${roundMoney(fee).toFixed(2)}`,
    toggle: 'לחייב משלוח',
    hint: 'כברירת מחדל המשלוח לא מחויב.',
    confirm: (fee) => `\nכולל משלוח: ₪${roundMoney(fee).toFixed(2)}`,
  },
  th: {
    label: (fee) => `ค่าจัดส่งถึงบ้าน ₪${roundMoney(fee).toFixed(2)}`,
    toggle: 'เรียกเก็บค่าจัดส่ง',
    hint: 'ค่าเริ่มต้นคือไม่เรียกเก็บค่าจัดส่ง',
    confirm: (fee) => `\nรวมค่าจัดส่ง: ₪${roundMoney(fee).toFixed(2)}`,
  },
};

/**
 * The switch shown next to the charge button for a home-delivery order with a fee.
 * @param {Object} props {fee, checked, onChange, lang, disabled}
 */
export function DeliveryChargeToggle({ fee, checked, onChange, lang = 'he', disabled = false }) {
  if (!(fee > 0)) return null;
  const text = DELIVERY_CHARGE_TEXT[lang] || DELIVERY_CHARGE_TEXT.he;
  return (
    <label
      data-testid="delivery-charge-toggle"
      className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${
        checked ? 'border-emerald-400 bg-emerald-50 text-emerald-900' : 'border-gray-200 bg-gray-50 text-gray-700'
      }`}
    >
      <span className="min-w-0">
        <span className="block font-semibold">{text.label(fee)}</span>
        <span className="block text-xs text-gray-500">{text.hint}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2 font-semibold">
        {text.toggle}
        <input
          type="checkbox"
          className="h-5 w-5 accent-emerald-600"
          checked={Boolean(checked)}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
      </span>
    </label>
  );
}
