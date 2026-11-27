import { endOfWeek, startOfWeek, subWeeks } from 'date-fns';
import {
  FUNNEL_STEPS,
  LEAVE_REASONS,
  LEAVE_REASON_LABELS,
  OPTIONAL_FUNNEL_STEPS,
} from '../constants/funnel';

// Pure helpers behind the "משפכים" report (admin/FunnelReport.js): funnel
// counts from funnelEvents, and who started or left a weekly basket from
// basketSubscriptions.

export const PENDING_CARD_MIN_AGE_MS = 60 * 60 * 1000;

export const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** Sunday to Saturday around `date`, `weeksBack` weeks earlier. */
export const weekRange = (date = new Date(), weeksBack = 0) => {
  const anchor = subWeeks(date, weeksBack);
  return {
    start: startOfWeek(anchor, { weekStartsOn: 0 }),
    end: endOfWeek(anchor, { weekStartsOn: 0 }),
  };
};

const inRange = (date, start, end) => Boolean(date) && date >= start && date <= end;

/**
 * Visitors (browsers) per step of one funnel.
 * A visitor reached a required step when they have that step or a later
 * required one in the range: a cart filled last week and paid this week still
 * counts as started. An optional step (basket_edited) counts only visitors who
 * did it, and its conversion is against the step before it.
 * Weekly-basket visitors are also split by ready-made basket versus
 * build-your-own, from the first event that says which.
 * @param {Array<Object>} events funnelEvents documents
 * @param {'weekly_basket'|'cart'} funnel
 * @return {{funnel: string, visitors: number, steps: Array<Object>, split: Object|null}}
 */
export const summarizeFunnel = (events, funnel) => {
  const steps = FUNNEL_STEPS[funnel] || [];
  const required = steps.filter((step) => !OPTIONAL_FUNNEL_STEPS.includes(step));
  const visitors = new Map();
  (events || []).forEach((event) => {
    if (!event || event.funnel !== funnel || !event.sessionId || !steps.includes(event.step)) return;
    const visitor = visitors.get(event.sessionId) || { steps: new Set(), buildYourOwn: null };
    visitor.steps.add(event.step);
    if (visitor.buildYourOwn === null && typeof event.buildYourOwn === 'boolean') {
      visitor.buildYourOwn = event.buildYourOwn;
    }
    visitors.set(event.sessionId, visitor);
  });

  const rows = (group) => {
    let previousRequired = null;
    return steps.map((step) => {
      const optional = OPTIONAL_FUNNEL_STEPS.includes(step);
      const laterRequired = optional ? [] : required.slice(required.indexOf(step));
      const count = group.filter((visitor) => (
        optional ? visitor.steps.has(step) : laterRequired.some((later) => visitor.steps.has(later))
      )).length;
      const conversion = previousRequired ? count / previousRequired : null;
      if (!optional) previousRequired = count;
      return { step, optional, count, conversion };
    });
  };

  const all = [...visitors.values()];
  return {
    funnel,
    visitors: all.length,
    steps: rows(all),
    split: funnel === 'weekly_basket'
      ? {
        readyMade: rows(all.filter((visitor) => visitor.buildYourOwn === false)),
        buildYourOwn: rows(all.filter((visitor) => visitor.buildYourOwn === true)),
        unknown: all.filter((visitor) => visitor.buildYourOwn === null).length,
      }
      : null,
  };
};

const feedbackOf = (value) => {
  const feedback = value && typeof value === 'object' ? value : {};
  const reason = LEAVE_REASON_LABELS[feedback.reason] ? feedback.reason : '';
  return {
    reason,
    reasonLabel: reason ? LEAVE_REASON_LABELS[reason] : '',
    note: typeof feedback.note === 'string' ? feedback.note : '',
  };
};

const exitRow = (sub, date, extra = {}) => {
  const details = sub.customerDetails || {};
  return {
    id: sub.id,
    name: details.name || '',
    phone: details.phone || '',
    community: sub.community || '',
    basketTitle: sub.basketTitle || '',
    personalBasket: Array.isArray(sub.recurringLines) && sub.recurringLines.length > 0,
    date,
    cycleCount: Number(sub.cycleCount) || 0,
    reason: '',
    reasonLabel: '',
    note: '',
    ...extra,
  };
};

const newestFirst = (a, b) => b.date - a.date;

/**
 * Weekly baskets that started and stopped in [start, end]:
 * - pendingCard: signed up in the range, never saved a card, older than an hour
 * - paused / canceled: paused or canceled in the range, with the reason given
 * - activated: how many saved a card in the range
 * - reasons: reason counts across paused and canceled
 * @param {Array<Object>} subscriptions basketSubscriptions with id
 * @param {{start: Date, end: Date, now?: Date}} range
 * @return {Object}
 */
export const summarizeSubscriptionExits = (subscriptions, { start, end, now = new Date() }) => {
  const pendingCard = [];
  const paused = [];
  const canceled = [];
  let activated = 0;

  (subscriptions || []).forEach((sub) => {
    if (!sub) return;
    if (inRange(toDate(sub.activatedAt), start, end)) activated += 1;
    if (sub.status === 'pending_card') {
      const created = toDate(sub.createdAt);
      if (inRange(created, start, end) && now - created >= PENDING_CARD_MIN_AGE_MS) {
        pendingCard.push(exitRow(sub, created));
      }
      return;
    }
    if (sub.status === 'paused') {
      const pausedAt = toDate(sub.pausedAt);
      if (inRange(pausedAt, start, end)) {
        paused.push(exitRow(sub, pausedAt, { by: sub.pauseReason || '', ...feedbackOf(sub.pauseFeedback) }));
      }
      return;
    }
    if (sub.status === 'canceled') {
      const canceledAt = toDate(sub.canceledAt);
      if (inRange(canceledAt, start, end)) {
        canceled.push(exitRow(sub, canceledAt, { by: sub.canceledBy || '', ...feedbackOf(sub.cancelFeedback) }));
      }
    }
  });

  const reasons = [...LEAVE_REASONS, { value: '', label: 'לא צוינה סיבה' }].map(({ value, label }) => ({
    reason: value,
    label,
    paused: paused.filter((row) => row.reason === value).length,
    canceled: canceled.filter((row) => row.reason === value).length,
  })).filter((entry) => entry.paused + entry.canceled > 0);

  return {
    activated,
    pendingCard: pendingCard.sort(newestFirst),
    paused: paused.sort(newestFirst),
    canceled: canceled.sort(newestFirst),
    reasons,
  };
};

/** wa.me link for an Israeli phone number, or '' when there is none. */
export const whatsappLink = (phone, text = '') => {
  let digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) digits = `972${digits.slice(1)}`;
  else if (!digits.startsWith('972')) digits = `972${digits}`;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
};

export const formatPercent = (ratio) => (ratio === null || ratio === undefined ? '' : `${Math.round(ratio * 100)}%`);
