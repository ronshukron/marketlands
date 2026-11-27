import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/firebase';
import { FUNNEL_STEPS } from '../constants/funnel';
import { getActiveCampaign, normalizeCampaignCode } from '../utils/campaignAttribution';

// "Who starts and who stops": one small document per funnel step in
// funnelEvents, written from the browser and read by the admin report
// (/admin/subscriptions, "משפכים").
//
// trackFunnelStep never throws and never waits: tracking must not slow down or
// break a signup or a checkout. Each step is written once per browser session
// (sessionStorage); the visitor id is kept in localStorage, so the report counts
// browsers, not page views.
//
// Writing is on in production builds only. Set REACT_APP_FUNNEL_TRACKING=off to
// turn it off there, or =on to write from a dev server (which uses the live
// project). In development, steps are logged to the console instead.
// firestore.rules (funnelEvents) accepts exactly the shape built below; the
// step names are in constants/funnel.js.

export { FUNNEL_STEPS };

export const FUNNEL_COLLECTION = 'funnelEvents';
const VISITOR_KEY = 'bastaFunnelVisitorId';
const SENT_KEY_PREFIX = 'bastaFunnelSent:';
const VISITOR_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_COMMUNITY_LENGTH = 100;
const MAX_BASKET_ID_LENGTH = 128;

let memoryVisitorId = '';
const memorySent = new Set();

const browserStorage = (name) => {
  try {
    if (typeof window === 'undefined' || !window[name]) return null;
    return window[name];
  } catch (error) {
    return null;
  }
};

const randomId = () => {
  try {
    if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
  } catch (error) {
    // fall through
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

export const isFunnelStep = (funnel, step) => (
  Object.prototype.hasOwnProperty.call(FUNNEL_STEPS, funnel) && FUNNEL_STEPS[funnel].includes(step)
);

/** The browser's funnel id: created once, kept in localStorage. */
export const getFunnelVisitorId = (storage = browserStorage('localStorage')) => {
  try {
    const stored = storage ? storage.getItem(VISITOR_KEY) : '';
    if (stored && VISITOR_ID_PATTERN.test(stored)) return stored;
    const created = memoryVisitorId || randomId();
    memoryVisitorId = created;
    if (storage) storage.setItem(VISITOR_KEY, created);
    return created;
  } catch (error) {
    if (!memoryVisitorId) memoryVisitorId = randomId();
    return memoryVisitorId;
  }
};

const readStoredCommunity = (storage) => {
  try {
    const value = storage ? storage.getItem('selectedPickupSpot') : '';
    return value && value !== 'הכל' ? value : '';
  } catch (error) {
    return '';
  }
};

/** The document written to funnelEvents, without createdAt (set by the server). */
export const buildFunnelEvent = ({
  funnel, step, sessionId, userId, community, basketId, buildYourOwn, campaign, path,
}) => ({
  funnel,
  step,
  sessionId,
  userId: typeof userId === 'string' && userId ? userId : null,
  community: String(community || '').slice(0, MAX_COMMUNITY_LENGTH),
  basketId: typeof basketId === 'string' && basketId ? basketId.slice(0, MAX_BASKET_ID_LENGTH) : null,
  buildYourOwn: typeof buildYourOwn === 'boolean' ? buildYourOwn : null,
  // The flyer / QR campaign this visitor came from (utils/campaignAttribution.js).
  campaign: normalizeCampaignCode(campaign) || null,
  path: typeof path === 'string' && path ? path.slice(0, 120) : null,
});

const trackingEnabled = () => {
  const setting = String(process.env.REACT_APP_FUNNEL_TRACKING || '').toLowerCase();
  if (setting === 'off') return false;
  if (setting === 'on') return true;
  return process.env.NODE_ENV === 'production';
};

const writeFunnelEvent = (event) => addDoc(collection(db, FUNNEL_COLLECTION), {
  ...event,
  createdAt: serverTimestamp(),
});

const markSent = (session, key) => {
  memorySent.add(key);
  try {
    if (session) session.setItem(key, '1');
  } catch (error) {
    // memorySent still dedupes this page
  }
};

const unmarkSent = (session, key) => {
  memorySent.delete(key);
  try {
    if (session) session.removeItem(key);
  } catch (error) {
    // nothing to undo
  }
};

const alreadySent = (session, key) => {
  if (memorySent.has(key)) return true;
  try {
    return Boolean(session && session.getItem(key));
  } catch (error) {
    return false;
  }
};

// Returns the write's promise (never rejecting), or null when nothing is written.
const queueFunnelStep = (funnel, step, extra, deps) => {
  try {
    if (!isFunnelStep(funnel, step)) return null;
    const session = 'sessionStorage' in deps ? deps.sessionStorage : browserStorage('sessionStorage');
    const local = 'localStorage' in deps ? deps.localStorage : browserStorage('localStorage');
    // A page view is once per page; a scan once per campaign.
    const key = `${SENT_KEY_PREFIX}${funnel}:${step}${extra && extra.dedupeKey ? `:${extra.dedupeKey}` : ''}`;
    if (alreadySent(session, key)) return null;

    const details = extra || {};
    const event = buildFunnelEvent({
      funnel,
      step,
      sessionId: getFunnelVisitorId(local),
      userId: 'userId' in deps ? deps.userId : (auth && auth.currentUser ? auth.currentUser.uid : null),
      community: details.community !== undefined ? details.community : readStoredCommunity(local),
      basketId: details.basketId,
      buildYourOwn: details.buildYourOwn,
      campaign: details.campaign !== undefined ? details.campaign : (getActiveCampaign({ storage: local })?.code || null),
      path: details.path,
    });

    const enabled = 'enabled' in deps ? deps.enabled : trackingEnabled();
    markSent(session, key);
    if (!enabled) {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.debug('[funnel]', funnel, step, event);
      }
      return null;
    }
    const write = deps.write || writeFunnelEvent;
    return Promise.resolve()
      .then(() => write(event))
      .then(() => undefined)
      .catch(() => {
        // Lost events are acceptable; let a later visit to this step try again.
        unmarkSent(session, key);
      });
  } catch (error) {
    return null;
  }
};

/**
 * Record that this browser reached a funnel step. Returns true when an event
 * was queued, false when it was skipped (unknown step, already sent this
 * session, tracking off). Never throws and never waits.
 * @param {'weekly_basket'|'cart'} funnel
 * @param {string} step one of FUNNEL_STEPS[funnel]
 * @param {{community?: string, basketId?: string, buildYourOwn?: boolean}} [extra]
 * @param {Object} [deps] for tests: {enabled, write, localStorage, sessionStorage, userId}
 * @return {boolean}
 */
export const trackFunnelStep = (funnel, step, extra = {}, deps = {}) => (
  queueFunnelStep(funnel, step, extra, deps) !== null
);

export const LEAVING_WAIT_MS = 800;

/**
 * The same, for a step right before the browser leaves the site (to the card
 * or payment page): resolves once the event is saved, or after `timeoutMs`,
 * so a write still in flight is not cut off by the navigation. Never rejects.
 * @param {string} funnel
 * @param {string} step
 * @param {Object} [extra]
 * @param {Object} [deps] as for trackFunnelStep, plus {timeoutMs}
 * @return {Promise<void>}
 */
export const trackFunnelStepBeforeLeaving = (funnel, step, extra = {}, deps = {}) => {
  const pending = queueFunnelStep(funnel, step, extra, deps);
  if (!pending) return Promise.resolve();
  const timeoutMs = Number.isFinite(deps.timeoutMs) ? deps.timeoutMs : LEAVING_WAIT_MS;
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    pending.then(() => {
      clearTimeout(timer);
      resolve();
    });
  });
};

/** Tests only: forget the in-memory dedupe and visitor id. */
export const resetFunnelTrackingForTests = () => {
  memorySent.clear();
  memoryVisitorId = '';
};
