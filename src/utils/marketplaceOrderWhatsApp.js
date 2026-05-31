const formatCurrency = (value) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(Number(value || 0));

/** Israeli mobile → wa.me digits (972...) */
export const normalizePhoneForWhatsApp = (phone = '') => {
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return `972${digits.slice(1)}`;
  if (digits.length === 9) return `972${digits}`;
  return digits;
};

export const buildOrderReadyWhatsAppMessage = ({
  customerName = '',
  businessName = '',
  orderId = '',
  fulfillmentLabel = '',
  total = 0,
  myOrdersUrl = '',
}) => {
  const lines = [
    `שלום ${customerName || ''},`.trim(),
    '',
    `ההזמנה שלך מ${businessName || 'הבסטה'} בשוק הבסטות מוכנה! 🧺`,
    orderId ? `מס׳ הזמנה: ${orderId.slice(0, 8)}` : '',
    fulfillmentLabel ? `איסוף/משלוח: ${fulfillmentLabel}` : '',
    total > 0 ? `סה״כ: ${formatCurrency(total)}` : '',
    '',
    'נשמח לתאם איתך את האיסוף / המסירה.',
    'תודה שקניתם מקומי!',
    myOrdersUrl ? `\nההזמנות שלי: ${myOrdersUrl}` : '',
  ];
  return lines.filter(Boolean).join('\n');
};

export const buildOrderReadyWhatsAppUrl = ({ phone, message }) => {
  const waPhone = normalizePhoneForWhatsApp(phone);
  if (!waPhone) return '';
  const text = encodeURIComponent(message || '');
  return `https://wa.me/${waPhone}?text=${text}`;
};
