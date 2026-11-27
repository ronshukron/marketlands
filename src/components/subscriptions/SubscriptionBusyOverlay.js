import React, { useEffect } from 'react';
import { FiCalendar, FiPause, FiPlay, FiRefreshCw, FiShoppingBag, FiSkipForward, FiXCircle } from 'react-icons/fi';

// Shown while a subscription action is saved on the server. Same look as the
// card-saving screen; only movement is animated, never opacity, so it stays
// fully visible even when the browser pauses animations.

const ACTIONS = {
  frequency: { icon: FiRefreshCw, title: 'מעדכנים את תדירות המשלוחים' },
  pause: { icon: FiPause, title: 'משהים את הסל השבועי' },
  resume: { icon: FiPlay, title: 'מחדשים את הסל השבועי', detail: 'מחפשים את תאריך המשלוח הקרוב' },
  skip: { icon: FiSkipForward, title: 'מדלגים על המשלוח' },
  unskip: { icon: FiCalendar, title: 'מחזירים את המשלוח' },
  cancel: { icon: FiXCircle, title: 'מבטלים את ההרשמה לסל השבועי' },
  recurring_basket: { icon: FiShoppingBag, title: 'שומרים את הסל הקבוע' },
  apply_to_delivery: { icon: FiShoppingBag, title: 'מעדכנים את המשלוח הקרוב', detail: 'מוצר אחרי מוצר, לפי המלאי וההזמנות מהחקלאים' },
  add_to_recurring: { icon: FiShoppingBag, title: 'מוסיפים לסל הקבוע' },
  whatsapp_opt_in: { icon: FiRefreshCw, title: 'מעדכנים את התזכורת בוואטסאפ' },
};

const ANIMATION_CSS = `
@keyframes subscriptionBusyBar { 0% { transform: translateX(100%); } 100% { transform: translateX(-250%); } }
.subscription-busy-bar { animation: subscriptionBusyBar 1.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .subscription-busy-bar { animation: none; } }
`;

/**
 * @param {Object} props
 * @param {string} props.action one of ACTIONS' keys; nothing is shown for others or when empty
 */
export default function SubscriptionBusyOverlay({ action }) {
  const config = ACTIONS[action] || null;

  useEffect(() => {
    if (!config) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [config]);

  if (!config) return null;
  const Icon = config.icon;

  return (
    <>
      <style>{ANIMATION_CSS}</style>
      <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
        <div
          className="w-full max-w-sm overflow-hidden rounded-2xl bg-white text-center shadow-2xl ring-1 ring-black/5"
          role="status"
          aria-live="polite"
          aria-busy="true"
          dir="rtl"
        >
          <div className="relative h-1 overflow-hidden bg-emerald-50" aria-hidden="true">
            <div className="subscription-busy-bar absolute inset-y-0 right-0 w-2/5 rounded-full bg-gradient-to-l from-emerald-400 to-emerald-600" />
          </div>
          <div className="px-6 py-7">
            <div className="relative mx-auto mb-4 flex h-14 w-14 items-center justify-center">
              <span className="absolute inset-0 rounded-full border-2 border-emerald-100" />
              <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-emerald-600 motion-safe:animate-spin" />
              <Icon className="h-6 w-6 text-emerald-600" aria-hidden="true" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">{config.title}</h2>
            <p className="mt-1 text-sm text-gray-500">{config.detail || 'רק רגע, שומרים את השינוי'}</p>
          </div>
        </div>
      </div>
    </>
  );
}
