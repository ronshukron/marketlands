// Add-to-cart feedback without a blocking popup (components/cart/CartAddFeedback.js
// shows it): the product flies to the cart icon, the icon bumps, and a small
// bubble under it confirms, with the cart total, "לסל" and undo. Product cards
// and other "add" buttons only announce what happened; nothing here touches
// the network.

const listeners = new Set();

/**
 * Listen to add-to-cart announcements.
 * @param {Function} listener (event) => void
 * @return {Function} unsubscribe
 */
export const subscribeCartFeedback = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const emit = (event) => {
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch (error) {
      // Feedback must never break adding to the cart.
    }
  });
};

/**
 * A product was added.
 * @param {Object} detail
 * @param {string} detail.name product name
 * @param {string} [detail.quantityLabel] "1 ק"ג"
 * @param {Element} [detail.sourceEl] the button that was pressed (the flight starts there)
 * @param {Object} [detail.match] {orderId, id, selectedOption}: the cart line, for undo
 * @param {number} [detail.addedQuantity]
 */
export const announceCartAdd = (detail) => emit({ type: 'added', ...detail });

/**
 * Adding did not happen (no stock, nothing chosen): a short warning in the same
 * place, and the button shakes.
 * @param {Object} detail {message, sourceEl}
 */
export const announceCartProblem = (detail) => emit({ type: 'problem', ...detail });

/** A tiny tap on phones that support it (Android); silently nothing elsewhere. */
export const tapFeedback = () => {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(12);
  } catch (error) {
    // not supported
  }
};

const prefersReducedMotion = () => {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (error) {
    return false;
  }
};

/** A short side-to-side shake (for a refused add). */
export const shakeElement = (element) => {
  if (!element || typeof element.animate !== 'function' || prefersReducedMotion()) return;
  element.animate([
    { transform: 'translateX(0)' },
    { transform: 'translateX(-6px)' },
    { transform: 'translateX(6px)' },
    { transform: 'translateX(-4px)' },
    { transform: 'translateX(0)' },
  ], { duration: 320, easing: 'ease-out' });
};

/** The cart icon grows a little and settles. */
export const bumpElement = (element) => {
  if (!element || typeof element.animate !== 'function' || prefersReducedMotion()) return;
  element.animate([
    { transform: 'scale(1)' },
    { transform: 'scale(1.25)' },
    { transform: 'scale(0.94)' },
    { transform: 'scale(1)' },
  ], { duration: 450, easing: 'ease-out' });
};

// A product photo that is already on screen and loaded (so the flight costs no
// download), or nothing.
const loadedImageNear = (sourceEl) => {
  const card = sourceEl && typeof sourceEl.closest === 'function' ? sourceEl.closest('.product-card') : null;
  if (!card) return '';
  const image = [...card.querySelectorAll('img')].find((img) => (
    img.complete && img.naturalWidth > 0 && img.offsetParent !== null
  ));
  return image ? (image.currentSrc || image.src) : '';
};

/**
 * Fly a small copy of the product (its photo, or a green "+" dot) from the
 * pressed button to the cart icon, along an arc. Resolves when it lands
 * (right away when motion is reduced or not supported).
 * @param {Element} sourceEl
 * @param {Element} targetEl
 * @return {Promise<void>}
 */
export const flyToCart = (sourceEl, targetEl) => {
  if (!sourceEl || !targetEl || typeof document === 'undefined' || prefersReducedMotion()) return Promise.resolve();
  const from = sourceEl.getBoundingClientRect();
  const to = targetEl.getBoundingClientRect();
  if (!from.width || !to.width) return Promise.resolve();
  const size = 46;
  const flyer = document.createElement('div');
  if (typeof flyer.animate !== 'function') return Promise.resolve();
  const startX = from.left + from.width / 2 - size / 2;
  const startY = from.top + from.height / 2 - size / 2;
  const dx = to.left + to.width / 2 - size / 2 - startX;
  const dy = to.top + to.height / 2 - size / 2 - startY;
  const imageSrc = loadedImageNear(sourceEl);
  Object.assign(flyer.style, {
    position: 'fixed',
    left: `${startX}px`,
    top: `${startY}px`,
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '9999px',
    overflow: 'hidden',
    zIndex: '90',
    pointerEvents: 'none',
    background: imageSrc ? '#fff' : '#16a34a',
    border: '2px solid #fff',
    boxShadow: '0 6px 18px rgba(0,0,0,0.25)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    font: '700 22px/1 sans-serif',
  });
  if (imageSrc) {
    const img = document.createElement('img');
    img.src = imageSrc;
    img.alt = '';
    Object.assign(img.style, { width: '100%', height: '100%', objectFit: 'cover' });
    flyer.appendChild(img);
  } else {
    flyer.textContent = '+';
  }
  document.body.appendChild(flyer);
  // Rises first, then drops into the icon.
  const lift = Math.min(120, Math.abs(dy) * 0.35 + 40);
  const animation = flyer.animate([
    { transform: 'translate(0, 0) scale(1)', opacity: 1 },
    { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - lift}px) scale(0.95)`, opacity: 1, offset: 0.45 },
    { transform: `translate(${dx}px, ${dy}px) scale(0.3)`, opacity: 0.7 },
  ], { duration: 650, easing: 'cubic-bezier(0.45, 0, 0.75, 1)', fill: 'forwards' });
  return new Promise((resolve) => {
    const done = () => {
      flyer.remove();
      resolve();
    };
    animation.onfinish = done;
    animation.oncancel = done;
  });
};
