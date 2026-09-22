import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../../../firebase/firebase';
import { REFUND_STATUSES, getRefundStatusDetails } from '../../../../utils/refundUtils';
import { safeNumber } from './orderDraftUtils';

export const OPEN_CHARGE_REFUND_STATUSES = Object.freeze([
  REFUND_STATUSES.PENDING,
  REFUND_STATUSES.PENDING_MANUAL_REFUND,
]);

const STATUS_TH = {
  [REFUND_STATUSES.PENDING]: 'รอตรวจสอบ',
  [REFUND_STATUSES.PENDING_MANUAL_REFUND]: 'รอคืนเงินด้วยมือ',
};

export function normalizeRefundEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function normalizeRefundPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('972') && digits.length >= 11) return `0${digits.slice(3)}`;
  return digits;
}

export function getRefundDisplayAmount(refund = {}) {
  if (refund.approvedRefundAmount != null) return safeNumber(refund.approvedRefundAmount, 0);
  if (refund.requestedRefundAmount != null) return safeNumber(refund.requestedRefundAmount, 0);
  const items = Array.isArray(refund.refundItems) ? refund.refundItems : [];
  return items.reduce((sum, item) => sum + safeNumber(item.refundAmount, 0), 0);
}

export function getOrderRefundCustomer(order = {}) {
  return {
    orderId: String(order?.id || '').trim(),
    phone: order?.customerDetails?.phone || '',
    email: order?.customerDetails?.email || '',
  };
}

export function refundMatchesCustomer(refund = {}, customer = {}) {
  const refundOrderId = String(refund.orderId || '').trim();
  const customerOrderId = String(customer.orderId || '').trim();
  if (refundOrderId && customerOrderId && refundOrderId === customerOrderId) return true;

  const customerPhone = normalizeRefundPhone(customer.phone);
  const refundPhone = normalizeRefundPhone(refund.userPhone);
  if (customerPhone && refundPhone && customerPhone === refundPhone) return true;

  const customerEmail = normalizeRefundEmail(customer.email);
  const refundEmail = normalizeRefundEmail(refund.userEmail);
  return Boolean(customerEmail && refundEmail && customerEmail === refundEmail);
}

export function findOpenRefundsForCustomer(refunds, customer) {
  return (Array.isArray(refunds) ? refunds : []).filter((refund) => (
    OPEN_CHARGE_REFUND_STATUSES.includes(refund.status)
    && refundMatchesCustomer(refund, customer)
  ));
}

function formatIls(amount) {
  return `₪${safeNumber(amount, 0).toFixed(2)}`;
}

function refundLineSummary(refund, lang) {
  const statusLabel = lang === 'th'
    ? (STATUS_TH[refund.status] || refund.status)
    : (getRefundStatusDetails(refund.status).adminLabel);
  const amount = formatIls(getRefundDisplayAmount(refund));
  const reason = String(refund.reason || '').trim();
  const firstItem = Array.isArray(refund.refundItems)
    ? String(refund.refundItems[0]?.productName || '').trim()
    : '';
  const detail = reason || firstItem;
  return detail ? `${statusLabel} — ${amount} — ${detail}` : `${statusLabel} — ${amount}`;
}

export function buildChargeRefundDialogText(refunds, { currentOrderId = '', lang = 'he' } = {}) {
  const list = Array.isArray(refunds) ? refunds : [];
  if (list.length === 0) return '';

  const header = lang === 'th'
    ? 'ลูกค้ามีคำขอคืนเงินที่ยังเปิดอยู่:'
    : 'ללקוח יש בקשות זיכוי פתוחות:';
  const footer = lang === 'th'
    ? 'ตรวจสอบใน /admin/refunds ก่อนเรียกเก็บเงิน'
    : 'בדקו ב-/admin/refunds לפני החיוב';
  const thisOrder = lang === 'th' ? 'ออเดอร์นี้' : 'הזמנה זו';
  const otherOrder = lang === 'th' ? 'ออเดอร์อื่น' : 'הזמנה אחרת';

  const lines = list.map((refund) => {
    const sameOrder = String(refund.orderId || '').trim() === String(currentOrderId || '').trim();
    return `• ${sameOrder ? thisOrder : otherOrder}: ${refundLineSummary(refund, lang)}`;
  });

  return ['', `⚠ ${header}`, ...lines, footer].join('\n');
}

export async function fetchOpenRefundsForChargeV7() {
  const snapshot = await getDocs(collection(db, 'refunds'));
  return snapshot.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .filter((refund) => OPEN_CHARGE_REFUND_STATUSES.includes(refund.status));
}
