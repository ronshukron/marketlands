import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import {
  FiActivity,
  FiAlertTriangle,
  FiBarChart2,
  FiRefreshCw,
  FiShoppingBag,
  FiTrendingUp,
  FiUsers,
} from 'react-icons/fi';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import LoadingSpinner from '../LoadingSpinner';
import { pickupSpots } from '../../data/pickupSpots';
import {
  isFulfilledRetentionOrder,
  loadLegacyRetentionOrders,
  normalizeCustomerIdentity,
} from '../../services/productRetentionAnalyticsService';

// Analytics Components
import RevenueChart from './analytics/RevenueChart';
import CommunityGrowthChart from './analytics/CommunityGrowthChart';
import AbandonedCartsCard from './analytics/AbandonedCartsCard';
import RefundsCard from './analytics/RefundsCard';
import CustomerJourney from './analytics/CustomerJourney';
import TopBusinesses from './analytics/TopBusinesses';
import TopProducts from './analytics/TopProducts';
import PriceElasticity from './analytics/PriceElasticity';
import ProductRetentionCard from './analytics/ProductRetentionCard';
import MissedWeekProductCorrelation from './analytics/MissedWeekProductCorrelation';

const ADMIN_UIDS = ['rfHOLhNoJOW8ByNypCtm3hlSNKs2'];

const DashboardSection = ({ id, eyebrow, title, description, children }) => (
  <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6">
    <div className="mb-4">
      <div className="text-xs font-bold uppercase tracking-wider text-blue-700">{eyebrow}</div>
      <h2 id={`${id}-title`} className="mt-1 text-2xl font-bold text-slate-950">{title}</h2>
      {description && <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>}
    </div>
    {children}
  </section>
);

const AnalyticsDashboard = () => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchAllData = useCallback(async (force = false) => {
    setLoading(true);
    setError('');
    try {
      const refundsRef = collection(db, 'refunds');

      const [allOrders, refundSnap] = await Promise.all([
        loadLegacyRetentionOrders({ force }),
        getDocs(refundsRef)
      ]);

      setOrders(allOrders);

      const fetchedRefunds = refundSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRefunds(fetchedRefunds);
      setLastUpdated(new Date());

    } catch (err) {
      console.error("Error fetching analytics data:", err);
      setError('לא הצלחנו לטעון את נתוני האנליטיקה. אפשר לנסות לרענן שוב.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentUser && ADMIN_UIDS.includes(currentUser.uid)) {
      fetchAllData();
    }
  }, [currentUser, fetchAllData]);

  const summary = useMemo(() => {
    const fulfilledOrders = orders.filter((order) => isFulfilledRetentionOrder(order));
    const revenue = fulfilledOrders.reduce(
      (total, order) => total + (Number(order.grandTotal) || 0),
      0,
    );
    const customerIds = new Set(fulfilledOrders.map((order) => (
      normalizeCustomerIdentity(order).id
    )).filter(Boolean));

    return {
      revenue,
      orderCount: fulfilledOrders.length,
      customerCount: customerIds.size,
      averageOrder: fulfilledOrders.length > 0 ? revenue / fulfilledOrders.length : 0,
    };
  }, [orders]);

  if (!currentUser || !ADMIN_UIDS.includes(currentUser.uid)) {
    return (
      <main className="min-h-[60vh] bg-slate-50 px-4 py-16 text-center" dir="rtl">
        <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <FiAlertTriangle className="mx-auto text-3xl text-amber-500" aria-hidden="true" />
          <h1 className="mt-4 text-xl font-bold text-slate-900">הגישה לדשבורד מוגבלת</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            עמוד האנליטיקה זמין למנהלי המערכת בלבד.
          </p>
        </div>
      </main>
    );
  }

  if (loading) return <LoadingSpinner />;

  if (error) {
    return (
      <main className="min-h-[60vh] bg-slate-50 px-4 py-16 text-center" dir="rtl">
        <div className="mx-auto max-w-md rounded-2xl border border-red-200 bg-white p-8 shadow-sm">
          <FiAlertTriangle className="mx-auto text-3xl text-red-500" aria-hidden="true" />
          <h1 className="mt-4 text-xl font-bold text-slate-900">שגיאה בטעינת הנתונים</h1>
          <p className="mt-2 text-sm text-slate-600">{error}</p>
          <button
            type="button"
            onClick={() => fetchAllData(true)}
            className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            <FiRefreshCw aria-hidden="true" />
            ניסיון נוסף
          </button>
        </div>
      </main>
    );
  }

  const summaryCards = [
    {
      label: 'סה״כ הכנסות',
      value: summary.revenue.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }),
      icon: FiTrendingUp,
      color: 'text-emerald-700 bg-emerald-50',
    },
    {
      label: 'הזמנות שהושלמו',
      value: summary.orderCount.toLocaleString('he-IL'),
      icon: FiShoppingBag,
      color: 'text-blue-700 bg-blue-50',
    },
    {
      label: 'לקוחות ייחודיים',
      value: summary.customerCount.toLocaleString('he-IL'),
      icon: FiUsers,
      color: 'text-violet-700 bg-violet-50',
    },
    {
      label: 'ממוצע להזמנה',
      value: summary.averageOrder.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }),
      icon: FiActivity,
      color: 'text-orange-700 bg-orange-50',
    },
  ];

  return (
    <main className="min-h-screen bg-slate-50 pb-16 font-hebrew" dir="rtl">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-[1440px] px-4 py-7 md:px-8 md:py-9">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-bold text-blue-700">
                <FiBarChart2 aria-hidden="true" />
                מרכז הבקרה
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">
                אנליטיקה ותובנות עסקיות
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
                תמונת מצב מרוכזת של מכירות, לקוחות, קהילות ומוצרים — עם דגש על פעולות שאפשר לבצע.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {lastUpdated && (
                <span className="text-xs text-slate-500">
                  עודכן לאחרונה: {lastUpdated.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              <button
                type="button"
                onClick={() => fetchAllData(true)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                <FiRefreshCw aria-hidden="true" />
                רענון נתונים
              </button>
            </div>
          </div>

          <nav className="mt-7 flex gap-2 overflow-x-auto pb-1" aria-label="ניווט בין אזורי הדשבורד">
            {[
              ['#retention-insights', 'שימור לקוחות'],
              ['#sales-performance', 'ביצועים'],
              ['#customer-health', 'לקוחות וקהילות'],
              ['#product-intelligence', 'מוצרים'],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="min-h-[40px] shrink-0 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-800"
              >
                {label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] space-y-12 px-4 py-7 md:px-8 md:py-10">
        <section aria-label="מדדי מפתח" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm text-slate-500">{label}</div>
                  <div className="mt-2 text-2xl font-bold text-slate-950">{value}</div>
                </div>
                <div className={`rounded-xl p-3 text-xl ${color}`}>
                  <Icon aria-hidden="true" />
                </div>
              </div>
            </div>
          ))}
        </section>

        <DashboardSection
          id="retention-insights"
          eyebrow="פעולה מומלצת"
          title="זיהוי סיכון ושימור לקוחות"
          description="התחילו מהלקוחות שלא הזמינו ומהמוצרים שמאפיינים אותם, ואז העמיקו לפי מוצר."
        >
          <div className="space-y-6">
            <MissedWeekProductCorrelation orders={orders} communities={pickupSpots} />
            <ProductRetentionCard orders={orders} communities={pickupSpots} />
          </div>
        </DashboardSection>

        <DashboardSection
          id="sales-performance"
          eyebrow="מכירות"
          title="ביצועים לאורך זמן"
          description="סינון הכנסות והזמנות לפי תקופה, קהילה ורמת פירוט. כל שבוע בדשבורד מוגדר מיום ראשון עד שבת."
        >
          <RevenueChart orders={orders} communities={pickupSpots} />
        </DashboardSection>

        <DashboardSection
          id="customer-health"
          eyebrow="קהילות ומשפך"
          title="בריאות הקהל וחוויית הלקוח"
          description="צמיחה, נטישת עגלות, החזרים ודפוסי חזרה לאורך מסע הלקוח."
        >
          <div className="space-y-6">
            <CommunityGrowthChart orders={orders} communities={pickupSpots} />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <AbandonedCartsCard orders={orders} communities={pickupSpots} />
              <RefundsCard refunds={refunds} />
              <CustomerJourney orders={orders} />
            </div>
          </div>
        </DashboardSection>

        <DashboardSection
          id="product-intelligence"
          eyebrow="קטלוג"
          title="מוצרים ועסקים מובילים"
          description="השוואת ביצועי ספקים, מוצרים והשפעת המחיר על הביקוש."
        >
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <TopBusinesses orders={orders} />
              <TopProducts orders={orders} />
            </div>
            <PriceElasticity orders={orders} />
          </div>
        </DashboardSection>
      </div>
    </main>
  );
};

export default AnalyticsDashboard;