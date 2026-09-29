import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export const DELIVERY_UI_OPTIONS = Object.freeze([
  { id: 'v7', path: '/admin/delivery-v7', label: 'V7', hint: 'לפי הזמנה', hintTh: 'ตามออเดอร์' },
  { id: 'v8', path: '/admin/delivery-v8', label: 'V8', hint: 'לפי פריט', hintTh: 'ตามสินค้า' },
]);

/**
 * Floating switch between the order-by-order UI (V7) and the item-by-item UI (V8).
 *
 * Rendered as a sibling of the page (see App.js) so it never touches V7 code.
 * Query params (e.g. ?autoload=today) are preserved so both UIs load the
 * same delivery. Both UIs share the same realtime drafts, so switching is safe
 * mid-shift.
 */
export default function DeliveryUiSwitch({ current = 'v7' }) {
  const location = useLocation();
  const navigate = useNavigate();

  const go = (option) => {
    if (option.id === current) return;
    navigate({ pathname: option.path, search: location.search });
  };

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 rounded-full bg-gray-900/90 p-1 shadow-2xl ring-1 ring-black/20 backdrop-blur"
      dir="rtl"
      role="group"
      aria-label="החלפת ממשק שקילה"
    >
      {DELIVERY_UI_OPTIONS.map((option) => {
        const active = option.id === current;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => go(option)}
            aria-pressed={active}
            title={`${option.hint} / ${option.hintTh}`}
            className={`min-h-[40px] rounded-full px-3 py-1.5 text-xs font-black leading-tight transition-colors ${
              active
                ? 'bg-white text-gray-900 shadow'
                : 'text-gray-200 hover:bg-white/10 hover:text-white'
            }`}
          >
            <span className="block text-sm">{option.label}</span>
            <span className={`block text-[10px] font-bold ${active ? 'text-gray-600' : 'text-gray-400'}`}>{option.hint}</span>
          </button>
        );
      })}
    </div>
  );
}
