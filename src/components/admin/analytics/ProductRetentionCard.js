import React, { Fragment, useEffect, useMemo, useState } from 'react';
import {
  addRetentionWeeks,
  buildProductRetentionIndex,
  calculateProductRetention,
  getRetentionWeekKey,
} from '../../../services/productRetentionAnalyticsService';
import { formatAnalyticsWeekLabel } from '../../../utils/analyticsWeekUtils';

const SORT_COLUMNS = {
  buyers: 'קונים פעילים',
  missedNextWeek: 'לא הזמינו בשבוע העוקב',
  missedRate: 'שיעור אי־חזרה',
  sixWeekLapsed: 'לא הזמינו תוך 6 שבועות',
};

function getDefaultAnchorWeek() {
  return addRetentionWeeks(getRetentionWeekKey(new Date()), -7);
}

function getIdentityValue(customer, prefix) {
  const identifiers = [customer?.id, ...(customer?.aliases || [])];
  const match = identifiers.find((identifier) => String(identifier || '').startsWith(prefix));
  return match ? String(match).slice(prefix.length) : '';
}

function getCommunity(order = {}) {
  return order.customerDetails?.pickupSpot
    || order.pickupSpotName
    || order.community
    || order.fulfillment?.community
    || '';
}

const ProductRetentionCard = ({ orders = [], communities = [] }) => {
  const [anchorWeek, setAnchorWeek] = useState(getDefaultAnchorWeek);
  const [community, setCommunity] = useState('');
  const [minimumCohortSize, setMinimumCohortSize] = useState(3);
  const [activityLookbackWeeks, setActivityLookbackWeeks] = useState(6);
  const [sort, setSort] = useState({ column: 'missedRate', direction: 'desc' });
  const [expandedProductKey, setExpandedProductKey] = useState('');

  const index = useMemo(() => buildProductRetentionIndex(orders), [orders]);
  const communityOptions = useMemo(() => Array.from(new Set([
    ...(communities || []).map((entry) => (
      typeof entry === 'string' ? entry : (entry?.name || entry?.id || '')
    )),
    ...orders.map(getCommunity),
  ].map((value) => String(value || '').trim()).filter(Boolean))).sort(
    (left, right) => left.localeCompare(right, 'he'),
  ), [communities, orders]);

  const metrics = useMemo(() => calculateProductRetention(index, {
    anchorWeek,
    community,
    minimumCohortSize,
    activityLookbackWeeks,
    minimumActivityRate: 0.5,
  }), [activityLookbackWeeks, anchorWeek, community, index, minimumCohortSize]);

  const sortedMetrics = useMemo(() => [...metrics].sort((left, right) => {
    const difference = Number(left[sort.column]) - Number(right[sort.column]);
    if (difference !== 0) return sort.direction === 'asc' ? difference : -difference;
    return left.productName.localeCompare(right.productName, 'he');
  }), [metrics, sort]);

  useEffect(() => {
    setExpandedProductKey('');
  }, [activityLookbackWeeks, anchorWeek, community, minimumCohortSize]);

  const changeSort = (column) => {
    setSort((current) => ({
      column,
      direction: current.column === column && current.direction === 'desc' ? 'asc' : 'desc',
    }));
  };

  const sortIndicator = (column) => {
    if (sort.column !== column) return '';
    return sort.direction === 'desc' ? ' ↓' : ' ↑';
  };

  return (
    <section className="bg-white p-4 md:p-6 rounded-lg shadow" aria-labelledby="product-retention-title">
      <div className="mb-5">
        <h2 id="product-retention-title" className="text-xl font-bold text-gray-800">
          שימור לקוחות לפי מוצר
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          לכל מוצר נבדקים רק קונים פעילים — לקוחות שהזמינו בלפחות 50% מהשבועות
          בחלון שנבחר. חזרה היא כל הזמנה בשבוע הבא, גם ממוצר אחר או בקהילה אחרת.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <label className="text-sm text-gray-700">
          <span className="block font-medium mb-1">שבוע אספקה (יום ראשון)</span>
          <input
            type="date"
            value={anchorWeek}
            max={getDefaultAnchorWeek()}
            onChange={(event) => setAnchorWeek(getRetentionWeekKey(event.target.value))}
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </label>

        <label className="text-sm text-gray-700">
          <span className="block font-medium mb-1">חלון פעילות (שבועות)</span>
          <input
            type="number"
            min="2"
            max="26"
            value={activityLookbackWeeks}
            onChange={(event) => setActivityLookbackWeeks(
              Math.max(2, Math.min(26, Number(event.target.value) || 2)),
            )}
            className="min-h-[44px] w-full border border-gray-300 rounded px-3 py-2 bg-white"
          />
          <span className="mt-1 block text-xs text-gray-500">
            פעיל = לפחות {Math.ceil(activityLookbackWeeks / 2)} מתוך {activityLookbackWeeks}
          </span>
        </label>

        <label className="text-sm text-gray-700">
          <span className="block font-medium mb-1">קהילת קבוצת הבסיס</span>
          <select
            value={community}
            onChange={(event) => setCommunity(event.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 bg-white"
          >
            <option value="">כל הקהילות</option>
            {communityOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>

        <label className="text-sm text-gray-700">
          <span className="block font-medium mb-1">מינימום קונים פעילים למוצר</span>
          <input
            type="number"
            min="1"
            max="1000"
            value={minimumCohortSize}
            onChange={(event) => setMinimumCohortSize(Math.max(1, Number(event.target.value) || 1))}
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </label>
      </div>

      <p className="text-xs text-gray-500 mb-3">
        שבוע בסיס: {formatAnalyticsWeekLabel(anchorWeek)} · פעיל = לפחות {Math.ceil(activityLookbackWeeks / 2)}
        {' '}מתוך {activityLookbackWeeks} השבועות שלפניו · מעקב עד:{' '}
        {formatAnalyticsWeekLabel(addRetentionWeeks(anchorWeek, 6))}
      </p>

      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-3 text-right">מוצר</th>
              {Object.entries(SORT_COLUMNS).map(([column, label]) => (
                <th key={column} className="p-3 text-center whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => changeSort(column)}
                    className="font-semibold text-gray-700 hover:text-gray-900"
                  >
                    {label}{sortIndicator(column)}
                  </button>
                </th>
              ))}
              <th className="p-3 text-center">לקוחות</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sortedMetrics.map((metric) => (
              <Fragment key={metric.productKey}>
              <tr className="hover:bg-gray-50">
                <td className="p-3">
                  <div className="font-medium text-gray-900">{metric.productName}</div>
                  <div className="text-xs text-gray-500">
                    {metric.businessName}
                    {metric.selectedOption ? ` · ${metric.selectedOption}` : ''}
                  </div>
                </td>
                <td className="p-3 text-center">
                  <div>{metric.buyers}</div>
                  {metric.productBuyers > metric.buyers && (
                    <div className="text-xs text-gray-400">מתוך {metric.productBuyers} קונים</div>
                  )}
                </td>
                <td className="p-3 text-center">{metric.missedNextWeek}</td>
                <td className="p-3 text-center font-medium">
                  {(metric.missedRate * 100).toFixed(1)}%
                </td>
                <td className="p-3 text-center">{metric.sixWeekLapsed}</td>
                <td className="p-3 text-center">
                  <button
                    type="button"
                    onClick={() => setExpandedProductKey(
                      expandedProductKey === metric.productKey ? '' : metric.productKey,
                    )}
                    className="text-blue-700 hover:text-blue-900 underline whitespace-nowrap"
                    aria-expanded={expandedProductKey === metric.productKey}
                  >
                    {expandedProductKey === metric.productKey ? 'הסתר פירוט' : 'הצג פירוט'}
                  </button>
                </td>
              </tr>
              {expandedProductKey === metric.productKey && (
                <tr>
                  <td colSpan="6" className="bg-blue-50 p-0">
                    <div className="border-y border-blue-100 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <h3 className="font-bold text-gray-800">
                          לקוחות פעילים — {metric.productName}
                        </h3>
                        <button
                          type="button"
                          onClick={() => setExpandedProductKey('')}
                          className="min-h-[44px] px-2 text-sm text-blue-700 underline"
                        >
                          סגור
                        </button>
                      </div>
                      <div className="overflow-x-auto rounded-lg border border-blue-100">
                        <table className="min-w-full bg-white text-sm">
                          <thead className="bg-blue-100">
                            <tr>
                              <th className="p-2 text-right">שם</th>
                              <th className="p-2 text-right">טלפון</th>
                              <th className="p-2 text-right">אימייל</th>
                              <th className="p-2 text-center">שבועות פעילים</th>
                              <th className="p-2 text-center">לא הזמין בשבוע הבא</th>
                              <th className="p-2 text-center">לא הזמין תוך 6 שבועות</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {metric.customers.map((customer) => (
                              <tr key={customer.id}>
                                <td className="p-2">
                                  {customer.name || getIdentityValue(customer, 'user:') || 'ללא שם'}
                                </td>
                                <td className="p-2" dir="ltr">
                                  {customer.phone || getIdentityValue(customer, 'phone:') || '—'}
                                </td>
                                <td className="p-2" dir="ltr">
                                  {customer.email || getIdentityValue(customer, 'email:') || '—'}
                                </td>
                                <td className="p-2 text-center">
                                  {customer.activeWeekCount}/{metric.activityLookbackWeeks}
                                </td>
                                <td className="p-2 text-center">{customer.missedNextWeek ? 'כן' : 'לא'}</td>
                                <td className="p-2 text-center">{customer.sixWeekLapsed ? 'כן' : 'לא'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
            {sortedMetrics.length === 0 && (
              <tr>
                <td colSpan="6" className="p-8 text-center text-gray-500">
                  לא נמצאו מוצרים שעומדים בגודל קבוצת הבסיס שנבחר.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </section>
  );
};

export default ProductRetentionCard;
