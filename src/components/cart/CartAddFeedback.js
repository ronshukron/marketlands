import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FiAlertCircle, FiCheck, FiX } from 'react-icons/fi';
import { useCart } from '../../contexts/CartContext';
import {
  bumpElement,
  flyToCart,
  shakeElement,
  subscribeCartFeedback,
} from '../../utils/cartAddFeedback';

// What the customer sees after "הוסף לסל" (instead of a popup that covered the
// screen): the product flies into the cart icon, the icon bumps, and a small
// bubble under the icon says what was added, with the cart total, "לסל" and
// "ביטול". It closes by itself, never blocks the page, and the next add simply
// updates it. Mounted once, next to the cart icon (Menu.js).

const SHOW_MS = 4000;
const BUBBLE_WIDTH = 320;

const sameOption = (a, b) => (a || 'default') === (b || 'default');
const findLine = (items, match) => (match ? (items || []).find((line) => (
  line.id === match.id
  && String(line.orderId || '') === String(match.orderId || '')
  && sameOption(line.selectedOption, match.selectedOption)
  && !line.basketInstanceId
  && !line.isBasketAdjustment
)) : null);

export default function CartAddFeedback({ cartButtonRef, onOpenCart }) {
  const { cartItems, updateQuantity, cartTotal, cartLineCount, subscriberMode } = useCart();
  const [bubble, setBubble] = useState(null);
  const [anchor, setAnchor] = useState(null);
  // Restarts the "time left" line whenever the timer restarts.
  const [cycle, setCycle] = useState(0);
  const timerRef = useRef(null);
  const pausedRef = useRef(false);
  // The cart as it was just before an add (the add itself lands on the next render).
  const itemsRef = useRef(cartItems);
  itemsRef.current = cartItems;
  const updateRef = useRef(updateQuantity);
  updateRef.current = updateQuantity;

  const close = useCallback(() => {
    clearTimeout(timerRef.current);
    setBubble(null);
  }, []);

  const startTimer = useCallback(() => {
    clearTimeout(timerRef.current);
    setCycle((value) => value + 1);
    timerRef.current = setTimeout(() => {
      if (!pausedRef.current) setBubble(null);
    }, SHOW_MS);
  }, []);

  const placeUnderCart = useCallback(() => {
    const button = cartButtonRef?.current;
    if (!button || typeof window === 'undefined') return;
    const rect = button.getBoundingClientRect();
    // Just below the whole header (on desktop it has a second row, the categories).
    const header = typeof button.closest === 'function' ? button.closest('header') : null;
    const headerBottom = header ? header.getBoundingClientRect().bottom : rect.bottom;
    const width = Math.min(BUBBLE_WIDTH, window.innerWidth - 16);
    const center = rect.left + rect.width / 2;
    const left = Math.max(8, Math.min(center - width * 0.25, window.innerWidth - width - 8));
    setAnchor({
      top: Math.max(rect.bottom, headerBottom) + 10,
      left,
      width,
      arrowLeft: Math.max(14, Math.min(center - left - 7, width - 28)),
    });
  }, [cartButtonRef]);

  useEffect(() => subscribeCartFeedback((event) => {
    const button = cartButtonRef?.current;
    placeUnderCart();
    if (event.type === 'problem') {
      shakeElement(event.sourceEl);
      setBubble({ id: Date.now(), tone: 'warning', message: event.message || '' });
      startTimer();
      return;
    }
    const before = findLine(itemsRef.current, event.match);
    setBubble({
      id: Date.now(),
      tone: 'success',
      name: event.name || '',
      quantityLabel: event.quantityLabel || '',
      undo: event.match ? { match: event.match, previousQuantity: before ? Number(before.quantity) || 0 : 0 } : null,
    });
    startTimer();
    flyToCart(event.sourceEl, button).then(() => bumpElement(button));
  }), [cartButtonRef, placeUnderCart, startTimer]);

  useEffect(() => {
    if (!bubble) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', placeUnderCart);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', placeUnderCart);
    };
  }, [bubble, close, placeUnderCart]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  if (!bubble || !anchor) return null;

  const undo = () => {
    if (!bubble.undo) return;
    const line = findLine(itemsRef.current, bubble.undo.match);
    if (line) updateRef.current(line.uid, bubble.undo.previousQuantity);
    close();
  };
  const openCart = () => {
    close();
    if (onOpenCart) onOpenCart();
  };
  const pause = () => { pausedRef.current = true; clearTimeout(timerRef.current); };
  const resume = () => { pausedRef.current = false; startTimer(); };
  const isWarning = bubble.tone === 'warning';

  return (
    <div
      key={bubble.id}
      role="status"
      aria-live="polite"
      dir="rtl"
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
      onTouchStart={pause}
      onTouchEnd={resume}
      className="cart-add-bubble fixed z-[60] rounded-2xl border bg-white p-3 text-right shadow-2xl [&_p]:mb-0"
      style={{
        top: anchor.top,
        left: anchor.left,
        width: anchor.width,
        borderColor: isWarning ? '#fcd34d' : '#bbf7d0',
      }}
    >
      <span
        aria-hidden="true"
        className="absolute -top-[7px] h-3.5 w-3.5 rotate-45 border-l border-t bg-white"
        style={{ left: anchor.arrowLeft, borderColor: isWarning ? '#fcd34d' : '#bbf7d0' }}
      />
      <div className="flex items-start gap-2.5">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isWarning ? 'bg-amber-100 text-amber-700' : 'bg-green-600 text-white'}`}>
          {isWarning ? <FiAlertCircle className="h-5 w-5" aria-hidden="true" /> : <FiCheck className="h-5 w-5" aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1">
          {isWarning ? (
            <p className="text-sm font-semibold leading-snug text-amber-900">{bubble.message}</p>
          ) : (
            <>
              <p className="text-sm font-bold text-gray-900">{subscriberMode ? 'נוסף למשלוח הקרוב' : 'נוסף לסל'}</p>
              <p className="truncate text-sm text-gray-700">
                {bubble.name}
                {bubble.quantityLabel ? <span className="text-gray-500"> · {bubble.quantityLabel}</span> : null}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                {`בסל: ${cartLineCount === 1 ? 'מוצר אחד' : `${cartLineCount} מוצרים`} · כ-₪${Number(cartTotal || 0).toFixed(2)}`}
              </p>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={close}
          className="-m-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="סגירה"
        >
          <FiX className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {!isWarning && (
        <div className="mt-2.5 flex items-center gap-2">
          <button
            type="button"
            onClick={openCart}
            className="flex h-10 flex-1 items-center justify-center rounded-xl bg-green-600 text-sm font-bold text-white hover:bg-green-700"
          >
            {subscriberMode ? 'לצפייה במשלוח' : 'לסל'} ›
          </button>
          {bubble.undo && (
            <button
              type="button"
              onClick={undo}
              className="flex h-10 items-center justify-center rounded-xl border border-gray-300 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              ביטול
            </button>
          )}
        </div>
      )}
      <span
        key={cycle}
        aria-hidden="true"
        className="cart-add-bubble-timer absolute bottom-0 right-3 left-3 h-0.5 origin-right rounded-full bg-green-500/60"
        style={{ animationDuration: `${SHOW_MS}ms` }}
      />
    </div>
  );
}
