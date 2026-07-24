import React, { useEffect, useMemo, useState } from 'react';
import {
  addRetentionWeeks,
  buildProductRetentionIndex,
  calculateProductRetention,
  getRetentionWeekKey,
} from '../../../services/productRetentionAnalyticsService';

const SORT_COLUMNS = {
  buyers: 'קונים',
  missedNextWeek: 'לא קנו בשבוע העוקב',
  missedRate: 'שיעור אי־חזרה',
  sixWeekLapsed: 'לא חזרו תוך 6 שבועות',
};

function getDefaultAnchorWeek() {
  return addRetentionWeeks(getRetentionWeekKey(new Date()), -7);
}

function formatWeek(weekKey) {
  if (!weekKey) return '';
  const [year, month, day] = weekKey.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('he-IL');
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
  }), [anchorWeek, community, index, minimumCohortSize]);

  const sortedMetrics = useMemo(() => [...metrics].sort((left, right) => {
    const difference = Number(left[sort.column]) - Number(right[sort.column]);
    if (difference !== 0) return sort.direction === 'asc' ? difference : -difference;
    return left.productName.localeCompare(right.productName, 'he');
  }), [metrics, sort]);

  const expandedMetric = sortedMetrics.find(
    (metric) => metric.productKey === expandedProductKey,
  ) || null;

  useEffect(() => {
    setExpandedProductKey('');
  }, [anchorWeek, community, minimumCohortSize]);

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
          קבוצת הבסיס היא הקונים בשבוע האספקה שנבחר. חזרה נספרת גם אם הלקוח עבר קהילה.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
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
          <span className="block font-medium mb-1">גודל קבוצת בסיס מינימלי</span>
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
        שבוע בסיס: {formatWeek(anchorWeek)} · חלון מעקב עד {formatWeek(addRetentionWeeks(anchorWeek, 6))}
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
              <tr key={metric.productKey} className="hover:bg-gray-50">
                <td className="p-3">
                  <div className="font-medium text-gray-900">{metric.productName}</div>
                  <div className="text-xs text-gray-500">
                    {metric.businessName}
                    {metric.selectedOption ? ` · ${metric.selectedOption}` : ''}
                  </div>
                </td>
                <td className="p-3 text-center">{metric.buyers}</td>
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

      {expandedMetric && (
        <div className="mt-5 border border-blue-100 bg-blue-50 rounded-lg p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="font-bold text-gray-800">
              לקוחות — {expandedMetric.productName}
            </h3>
            <button
              type="button"
              onClick={() => setExpandedProductKey('')}
              className="text-sm text-blue-700 underline"
            >
              סגור
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm bg-white rounded">
              <thead className="bg-blue-100">
                <tr>
                  <th className="p-2 text-right">שם</th>
                  <th className="p-2 text-right">טלפון</th>
                  <th className="p-2 text-right">אימייל</th>
                  <th className="p-2 text-center">פספס שבוע עוקב</th>
                  <th className="p-2 text-center">לא חזר תוך 6 שבועות</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {expandedMetric.customers.map((customer) => (
                  <tr key={customer.id}>
                    <td className="p-2">{customer.name || 'ללא שם'}</td>
                    <td className="p-2" dir="ltr">{customer.phone || '—'}</td>
                    <td className="p-2" dir="ltr">{customer.email || '—'}</td>
                    <td className="p-2 text-center">{customer.missedNextWeek ? 'כן' : 'לא'}</td>
                    <td className="p-2 text-center">{customer.sixWeekLapsed ? 'כן' : 'לא'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};

export default ProductRetentionCard;
