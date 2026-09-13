import React, { useEffect, useMemo, useState } from 'react';
import { getPromotionsAnalytics } from '../../../services/communityWeeklyPromotionService';
import { emptyCommunityWeeklyPromotionAnalytics } from '../../../utils/communityWeeklyPromotionAnalytics';

const number = (value) => Number(value) || 0;
const formatNumber = (value) => number(value).toLocaleString('he-IL');
const formatCurrency = (value) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(number(value));

const normalizeStats = (result) => {
  const source = result?.stats || result || {};
  return {
    views: number(source.views ?? source.viewCount ?? source.visits ?? source.visitCount),
    uniqueVisits: number(source.uniqueVisits ?? source.uniqueVisitCount),
    unlocks: number(source.unlockConfirmations ?? source.unlocks ?? source.unlockCount),
    targetCommunityCount: number(source.targetCommunityCount),
    orders: number(source.orders ?? source.orderCount ?? source.promotionalOrders),
    units: number(source.units ?? source.unitsSold ?? source.quantity),
    revenue: number(source.revenue ?? source.salesTotal ?? source.totalRevenue),
    customers: number(source.customers ?? source.customerCount ?? source.uniqueCustomers),
    products: Array.isArray(source.products)
      ? source.products
      : Array.isArray(source.productStats)
        ? source.productStats
        : [],
    communities: Array.isArray(source.communities)
      ? source.communities
      : Array.isArray(source.communityStats)
        ? source.communityStats
        : [],
  };
};

const mergeRows = (groups, rows, keyOf) => {
  rows.forEach((row) => {
    const key = keyOf(row);
    const current = groups.get(key) || {};
    groups.set(key, {
      ...current,
      ...row,
      unlocked: Boolean(current.unlocked || row.unlocked),
      unlocks: number(current.unlocks) + number(row.unlocks),
      customers: number(current.customers ?? current.customerCount) + number(row.customers ?? row.customerCount),
      units: number(current.units ?? current.quantity) + number(row.units ?? row.quantity),
      orders: number(current.orders ?? current.orderCount) + number(row.orders ?? row.orderCount),
      revenue: number(current.revenue ?? current.salesTotal) + number(row.revenue ?? row.salesTotal),
    });
  });
};

const aggregateStats = (results) => {
  const total = normalizeStats(null);
  const products = new Map();
  const communities = new Map();
  results.filter(Boolean).forEach((result) => {
    const stats = normalizeStats(result);
    total.views += stats.views;
    total.uniqueVisits += stats.uniqueVisits;
    total.unlocks += stats.unlocks;
    total.targetCommunityCount += stats.targetCommunityCount;
    total.orders += stats.orders;
    total.units += stats.units;
    total.revenue += stats.revenue;
    total.customers += stats.customers;
    mergeRows(products, stats.products, (row) => row.productId || row.id || row.name || `product-${products.size}`);
    mergeRows(
      communities,
      stats.communities,
      (row) => row.communityCode || row.code || row.communityName || row.name || `community-${communities.size}`
    );
  });
  total.products = Array.from(products.values());
  total.communities = Array.from(communities.values());
  return total;
};

const Metric = ({ label, value, hint }) => (
  <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
    <p className="text-sm font-medium text-gray-500">{label}</p>
    <p className="mt-2 text-2xl font-bold text-gray-900" dir="ltr">{value}</p>
    {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
  </div>
);

const CommunityWeeklyPromotionAnalytics = ({ promotion = null, promotions = [], onBack }) => {
  const [stats, setStats] = useState(() => emptyCommunityWeeklyPromotionAnalytics());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const promotionsToLoad = useMemo(
    () => (
      promotion?.id
        ? [promotion]
        : promotions.filter((item) => item?.id)
    ),
    [promotion, promotions]
  );

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        if (promotionsToLoad.length === 0) {
          if (active) setStats(emptyCommunityWeeklyPromotionAnalytics());
          return;
        }
        const results = await getPromotionsAnalytics(promotionsToLoad);
        if (active) {
          setStats(promotion?.id ? normalizeStats(results[0]) : aggregateStats(results));
        }
      } catch (loadError) {
        console.error('Failed to load community weekly promotion analytics', loadError);
        if (active) setError('לא ניתן לטעון כרגע את נתוני המבצעים.');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [promotion?.id, promotionsToLoad]);

  const conversionBase = stats.unlocks;
  const conversion = conversionBase > 0 ? (stats.orders / conversionBase) * 100 : 0;
  const unlockHint = stats.targetCommunityCount > 0
    ? `${formatNumber(stats.unlocks)} מתוך ${formatNumber(stats.targetCommunityCount)} קהילות יעד`
    : '';

  return (
    <div dir="rtl" className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            {promotion ? `ניתוח: ${promotion.title || 'מבצע שבועי'}` : 'ניתוח מבצעים שבועיים'}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            פתיחות קהילה מהשיתוף, והזמנות שבהן הופעל המחיר השבועי.
          </p>
        </div>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="min-h-11 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300"
          >
            חזרה לרשימה
          </button>
        )}
      </div>

      {loading && (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500" role="status">
          טוען נתוני ביצועים...
        </div>
      )}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700" role="alert">{error}</div>}

      {!loading && !error && promotionsToLoad.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
          <h3 className="font-bold text-gray-800">אין מבצעים לניתוח</h3>
          <p className="mt-1 text-sm text-gray-500">בחרו מבצע מהרשימה או שנו את הסינון.</p>
        </div>
      )}

      {!loading && !error && promotionsToLoad.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="פתיחות קהילה" value={formatNumber(stats.unlocks)} hint={unlockHint} />
            <Metric label="הזמנות" value={formatNumber(stats.orders)} hint="הזמנות עם מוצר במחיר השבועי" />
            <Metric label="הכנסות" value={formatCurrency(stats.revenue)} hint="סכום הערכת ההזמנה לפני שקילה" />
            <Metric label="לקוחות" value={formatNumber(stats.customers)} />
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm font-medium text-blue-800">יחס המרה מפתיחת קהילה להזמנה</p>
            <p className="mt-1 text-2xl font-bold text-blue-950" dir="ltr">{conversion.toFixed(1)}%</p>
          </div>

          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-4 py-3">
              <h3 className="font-bold text-gray-900">ביצועים לפי מוצר</h3>
            </div>
            {stats.products.length === 0 ? (
              <p className="p-6 text-center text-sm text-gray-500">עדיין אין הזמנות עם מחיר שבועי להצגה.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-4 py-3 text-right font-semibold">מוצר</th>
                      <th className="px-4 py-3 text-right font-semibold">עסק</th>
                      <th className="px-4 py-3 text-right font-semibold">יחידות</th>
                      <th className="px-4 py-3 text-right font-semibold">הזמנות</th>
                      <th className="px-4 py-3 text-right font-semibold">הכנסות</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {stats.products.map((product, index) => (
                      <tr key={product.productId || product.id || index}>
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">
                          {product.productName || product.name || 'מוצר'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                          {product.businessName || product.supplierName || '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-700" dir="ltr">{formatNumber(product.units ?? product.quantity)}</td>
                        <td className="px-4 py-3 text-gray-700" dir="ltr">{formatNumber(product.orders ?? product.orderCount)}</td>
                        <td className="px-4 py-3 text-gray-700" dir="ltr">{formatCurrency(product.revenue ?? product.salesTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-4 py-3">
              <h3 className="font-bold text-gray-900">ביצועים לפי קהילה</h3>
            </div>
            {stats.communities.length === 0 ? (
              <p className="p-6 text-center text-sm text-gray-500">עדיין אין קהילות יעד להצגה.</p>
            ) : (
              <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {stats.communities.map((community, index) => (
                  <div
                    key={community.communityCode || community.code || community.communityName || index}
                    className="rounded-lg border border-gray-200 p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-gray-900">
                        {community.communityName || community.name || community.community || 'קהילה'}
                      </p>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                        community.unlocked
                          ? 'bg-emerald-50 text-emerald-800'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {community.unlocked ? 'נפתח' : 'לא נפתח'}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <span className="text-gray-500">הזמנות</span>
                      <span className="text-left font-medium" dir="ltr">{formatNumber(community.orders ?? community.orderCount)}</span>
                      <span className="text-gray-500">הכנסות</span>
                      <span className="text-left font-medium" dir="ltr">{formatCurrency(community.revenue ?? community.salesTotal)}</span>
                      <span className="text-gray-500">לקוחות</span>
                      <span className="text-left font-medium" dir="ltr">{formatNumber(community.customers ?? community.customerCount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default CommunityWeeklyPromotionAnalytics;
