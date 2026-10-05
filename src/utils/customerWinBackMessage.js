import { buildCommunityStoreLink } from './communityBroadcastMessage';
import { buildOrderReadyWhatsAppUrl } from './marketplaceOrderWhatsApp';

export const WIN_BACK_WEEK_OPTIONS = [4, 6, 8, 12];
export const DEFAULT_WIN_BACK_WEEKS = 6;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getLastCompletedOrder(customer) {
  const orders = Array.isArray(customer?.orders) ? customer.orders : [];
  let last = null;
  orders.forEach((order) => {
    const createdAt = toDate(order?.createdAt);
    if (!createdAt) return;
    if (!last || createdAt > last.createdAt) {
      last = { ...order, createdAt };
    }
  });
  return last;
}

export function getLapsedCutoff(weeks, now = new Date()) {
  const cutoff = new Date(now);
  const weekCount = Number(weeks);
  if (!Number.isFinite(weekCount) || weekCount <= 0) return cutoff;
  cutoff.setDate(cutoff.getDate() - weekCount * 7);
  return cutoff;
}

export function isCustomerLapsed(customer, weeks, now = new Date()) {
  const weekCount = Number(weeks);
  if (!Number.isFinite(weekCount) || weekCount <= 0) return false;
  const last = getLastCompletedOrder(customer);
  if (!last) return false;
  return last.createdAt < getLapsedCutoff(weekCount, now);
}

function normalizeWinBackPhone(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('972') && digits.length >= 11) {
    digits = `0${digits.slice(3)}`;
  }
  return digits.length >= 9 ? digits : '';
}

function normalizeWinBackName(name) {
  const trimmed = String(name || '').trim().replace(/\s+/g, ' ');
  if (!trimmed || trimmed === 'ללא שם') return '';
  return trimmed.toLowerCase();
}

function isDistinctiveName(name) {
  const normalized = normalizeWinBackName(name);
  if (!normalized) return false;
  const parts = normalized.split(/[\s\-–—]+/).filter((part) => part.length >= 2);
  return parts.length >= 2;
}

function addPhone(set, phone) {
  const normalized = normalizeWinBackPhone(phone);
  if (normalized) set.add(normalized);
}

function addName(set, name) {
  if (!isDistinctiveName(name)) return;
  const normalized = normalizeWinBackName(name);
  if (normalized) set.add(normalized);
}

function forEachIdentity(customer, onPhone, onName) {
  onPhone(customer?.phone);
  onName(customer?.name);
  (customer?.orders || []).forEach((order) => {
    onPhone(order?.phone);
    onName(order?.name);
  });
}

function sharesActiveIdentity(customer, activePhones, activeNames) {
  let matched = false;
  forEachIdentity(
    customer,
    (phone) => {
      const normalized = normalizeWinBackPhone(phone);
      if (normalized && activePhones.has(normalized)) matched = true;
    },
    (name) => {
      const normalized = normalizeWinBackName(name);
      if (normalized && isDistinctiveName(name) && activeNames.has(normalized)) matched = true;
    }
  );
  return matched;
}

export function filterLapsedCustomers(customers, weeks, now = new Date()) {
  const list = customers || [];
  const cutoff = getLapsedCutoff(weeks, now);
  const activePhones = new Set();
  const activeNames = new Set();

  list.forEach((customer) => {
    if (isCustomerLapsed(customer, weeks, now)) return;
    (customer?.orders || []).forEach((order) => {
      const createdAt = toDate(order?.createdAt);
      if (!createdAt || createdAt < cutoff) return;
      if (normalizeWinBackPhone(order?.phone)) addPhone(activePhones, order.phone);
      else addPhone(activePhones, customer?.phone);
      if (normalizeWinBackName(order?.name)) addName(activeNames, order.name);
      else addName(activeNames, customer?.name);
    });
  });

  return list.filter((customer) => (
    isCustomerLapsed(customer, weeks, now)
    && !sharesActiveIdentity(customer, activePhones, activeNames)
  ));
}

export function weeksIdle(date, now = new Date()) {
  const createdAt = toDate(date);
  if (!createdAt) return null;
  const elapsed = now.getTime() - createdAt.getTime();
  if (elapsed < 0) return 0;
  return Math.floor(elapsed / WEEK_MS);
}

export function getWinBackCommunity(customer) {
  return String(getLastCompletedOrder(customer)?.pickupSpot || '').trim();
}

export function getWinBackStoreLink(customer) {
  return buildCommunityStoreLink(getWinBackCommunity(customer));
}

export function winBackGreetingName(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed || trimmed === 'ללא שם') return '';
  return trimmed;
}

export function buildWinBackGiftLine(productName) {
  const name = String(productName || '').trim();
  if (!name) return '';
  return `כמתנה להזמנה הבאה נוסיף לך ${name} בחינם ברגע שתשלחי הזמנה.`;
}

export function buildWinBackMessage({ name = '', productName = '', storeLink = '' } = {}) {
  const greetingName = winBackGreetingName(name);
  const giftLine = buildWinBackGiftLine(productName);
  const link = String(storeLink || '').trim() || buildCommunityStoreLink('');
  const lines = [
    greetingName ? `היי ${greetingName},` : 'היי,',
    'רצינו לעדכן שהשתפרנו מאוד באתר ובשירות, ונשמח שתנסי להזמין שוב.',
  ];
  if (giftLine) lines.push(giftLine);
  lines.push(`כאן אפשר להזמין: ${link}`);
  return lines.join('\n');
}

export function buildWinBackWhatsAppUrl({ phone, message }) {
  return buildOrderReadyWhatsAppUrl({ phone, message });
}
