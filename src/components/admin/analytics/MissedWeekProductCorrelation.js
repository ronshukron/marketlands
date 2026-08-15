import React, { useMemo, useState } from 'react';
import { FiAlertCircle, FiCheckCircle, FiShoppingBag, FiUsers } from 'react-icons/fi';
import {
  addRetentionWeeks,
  buildProductRetentionIndex,
  calculateMissedWeekProductCorrelation,
  getRetentionWeekKey,
} from '../../../services/productRetentionAnalyticsService';

function getDefaultTargetWeek() {
  return addRetentionWeeks(getRetentionWeekKey(new Date()), -1);
}

function formatWeekRange(weekKey) {
  if (!weekKey) return '—';
  const start = new Date(`${weekKey}T00:00:00`);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${start.toLocaleDateString('he-IL')}–${end.toLocaleDateString('he-IL')}`;
}

function getCommunity(order = {}) {
  return order.customerDetails?.pickupSpot
    || order.pickupSpotName
    || order.community
    || order.fulfillment?.community
    || '';
}

const MissedWeekProductCorrelation = ({ orders = [], communities = [] }) => {
  const [targetWeek, setTargetWeek] = useState(getDefaultTargetWeek);
  const [community, setCommunity] = useState('');
  const [lookbackWeeks, setLookbackWeeks] = useState(6);

  const index = useMemo(() => buildProductRetentionIndex(orders), [orders]);
  const communityOptions = useMemo(() => Array.from(new Set([
    ...communities,
    ...orders.map(getCommunity),
  ].map((value) => String(value || '').trim()).filter(Boolean))).sort(
    (left, right) => left.localeCompare(right, 'he'),
  ), [communities, orders]);
  const result = useMemo(() => calculateMissedWeekProductCorrelation(index, {
    targetWeek,
    community,
    lookbackWeeks,
  }), [community, index, lookbackWeeks, targetWeek]);
  const missedRate = result.activeCustomers > 0
    ? result.missedCount / result.activeCustomers
    : 0;
  const leadingProducts = result.products.slice(0, 10);

  return (
    <section
      className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm"
      aria-labelledby="missed-week-title"
    >
      <div className="bg-gradient-to-l from-blue-700 via-blue-600 to-indigo-600 px-5 py-6 text-white md:px-7">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div className="max-w-3xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
              <FiShoppingBag aria-hidden="true" />
              תובנה חדשה לשימור לקוחות
            </div>
            <h2 id="missed-week-title" className="text-2xl font-bold md:text-3xl">
              מה משותף ללקוחות שלא הזמינו השבוע?
            </h2>
            <p className="mt-2 text-sm leading-6 text-blue-100 md:text-base">
              מזהה לקוחות שהזמינו בלפחות 50% מהשבועות בחלון הפעילות, אך לא הזמינו
              בשבוע שנבחר, ומציג אילו מוצרים הופיעו בסלים הקודמים שלהם.
            </p>
          </div>
          <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm">
            <span className="block text-blue-100">השבוע הנבדק</span>
            <strong className="mt-1 block text-base" dir="ltr">{formatWeekRange(targetWeek)}</strong>
          </div>
        </div>
      </div>

      <div className="p-5 md:p-7">
        <div className="grid grid-cols-1 gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4 md:grid-cols-3">
          <label className="text-sm font-medium text-gray-700">
            <span className="mb-1.5 block">שבוע ללא הזמנה</span>
            <input
              type="date"
              value={targetWeek}
              max={getDefaultTargetWeek()}
              onChange={(event) => setTargetWeek(getRetentionWeekKey(event.target.value))}
              className="min-h-[44px] w-full rounded-lg border border-gray-300 bg-white px-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </label>
          <label className="text-sm font-medium text-gray-700">
            <span className="mb-1.5 block">קהילת הפעילות הקודמת</span>
            <select
              value={community}
              onChange={(event) => setCommunity(event.target.value)}
              className="min-h-[44px] w-full rounded-lg border border-gray-300 bg-white px-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="">כל הקהילות</option>
              {communityOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">
            <span className="mb-1.5 block">חלון פעילות (שבועות)</span>
            <input
              type="number"
              min="2"
              max="26"
              value={lookbackWeeks}
              onChange={(event) => setLookbackWeeks(
                Math.max(2, Math.min(26, Number(event.target.value) || 2)),
              )}
              className="min-h-[44px] w-full rounded-lg border border-gray-300 bg-white px-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <span className="mt-1 block text-xs font-normal text-gray-500">
              פעיל = הזמין בלפחות {Math.ceil(lookbackWeeks / 2)} מתוך {lookbackWeeks} שבועות
            </span>
          </label>
        </div>

        <div className="my-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <FiUsers className="text-blue-600" aria-hidden="true" />
              לקוחות פעילים ({result.requiredActiveWeeks} מתוך {lookbackWeeks} שבועות)
            </div>
            <div className="mt-2 text-3xl font-bold text-gray-900">
              {result.activeCustomers.toLocaleString('he-IL')}
            </div>
          </div>
          <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
            <div className="flex items-center gap-2 text-sm text-orange-800">
              <FiAlertCircle aria-hidden="true" />
              לא הזמינו בשבוע
            </div>
            <div className="mt-2 text-3xl font-bold text-orange-900">
              {result.missedCount.toLocaleString('he-IL')}
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="text-sm text-gray-500">שיעור אי־הזמנה</div>
            <div className="mt-2 text-3xl font-bold text-gray-900">
              {(missedRate * 100).toFixed(1)}%
            </div>
          </div>
        </div>

        {result.missedCount === 0 ? (
          <div className="rounded-xl border border-green-200 bg-green-50 p-5 text-green-900">
            <div className="flex items-center gap-2 font-bold">
              <FiCheckCircle aria-hidden="true" />
              לא נמצאו לקוחות פעילים שפספסו את השבוע הזה
            </div>
            <p className="mt-1 text-sm text-green-800">אפשר לבחור שבוע אחר או להרחיב את חלון הפעילות.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
            <div>
              <h3 className="text-base font-bold text-gray-900">מוצרים שנמצאו אצל כולם</h3>
              <p className="mt-1 text-sm text-gray-500">הופיעו בסל קודם של 100% מהלקוחות שלא הזמינו.</p>
              <div className="mt-3 space-y-2">
                {result.commonProducts.length > 0 ? result.commonProducts.map((product) => (
                  <div key={product.productKey} className="rounded-xl border border-green-200 bg-green-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-bold text-green-950">{product.productName}</div>
                        <div className="mt-1 text-xs text-green-800">
                          {product.businessName}
                          {product.selectedOption ? ` · ${product.selectedOption}` : ''}
                        </div>
                      </div>
                      <span className="rounded-full bg-green-700 px-2.5 py-1 text-xs font-bold text-white">
                        100%
                      </span>
                    </div>
                  </div>
                )) : (
                  <div className="rounded-xl border border-dashed border-gray-300 p-5 text-sm text-gray-600">
                    אין מוצר שמופיע אצל כל הלקוחות בקבוצה. הדירוג הבא מציג את ההתאמות החזקות ביותר.
                  </div>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-base font-bold text-gray-900">דירוג מוצרים לפי חפיפה</h3>
              <p className="mt-1 text-sm text-gray-500">כל לקוח נספר פעם אחת לכל מוצר, גם אם קנה אותו מספר פעמים.</p>
              <div className="mt-3 overflow-hidden rounded-xl border border-gray-200">
                <div className="divide-y divide-gray-100">
                  {leadingProducts.map((product) => (
                    <div key={product.productKey} className="grid grid-cols-[minmax(0,1fr)_72px] items-center gap-4 p-3.5">
                      <div className="min-w-0">
                        <div className="flex items-center justify-between gap-3">
                          <div className="truncate font-medium text-gray-900">{product.productName}</div>
                          <div className="shrink-0 text-sm font-bold text-blue-700">
                            {(product.coverage * 100).toFixed(0)}%
                          </div>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
                          <div
                            className="h-full rounded-full bg-blue-600"
                            style={{ width: `${product.coverage * 100}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-center text-xs text-gray-500">
                        <strong className="block text-base text-gray-800">{product.customerCount}</strong>
                        לקוחות
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {result.missedCustomers.length > 0 && (
          <details className="mt-6 rounded-xl border border-gray-200 bg-gray-50">
            <summary className="min-h-[44px] cursor-pointer px-4 py-3 font-medium text-gray-800">
              הצגת {result.missedCustomers.length} הלקוחות שלא הזמינו
            </summary>
            <div className="grid grid-cols-1 gap-2 border-t border-gray-200 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {result.missedCustomers.map((customer) => (
                <div key={customer.id} className="rounded-lg bg-white p-3 text-sm shadow-sm">
                  <div className="font-medium text-gray-900">{customer.name || 'ללא שם'}</div>
                  <div className="mt-1 text-gray-500" dir="ltr">{customer.phone || customer.email || '—'}</div>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </section>
  );
};

export default MissedWeekProductCorrelation;
