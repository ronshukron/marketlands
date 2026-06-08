import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../../contexts/authContext';
import { db } from '../../firebase/firebase';
import { pickupSpots } from '../../data/pickupSpots';
import { isDeliveryDriverAccount } from '../../utils/accountRoles';
import { getRecentWeekKeys, toLocalDateKey } from '../../utils/deliveryScheduleUtils';
import {
  fetchProductDetailsV7,
  subscribeDelayedOrdersForWeekV7,
} from '../adminV5/deliveryWeighingV5/apiV7';
import { subscribeDraftsV7 } from '../adminV5/deliveryWeighingV5/realtimeStateV7';
import {
  BUFFER_LINE_CATALOG_NUMBER,
  mergeProductDetailsIntoItems,
  safeNumber,
  sanitizeDraftForItems,
  weekKeyToRangeLabel,
} from '../adminV5/deliveryWeighingV5/v7/orderDraftUtils';
import {
  computeCommunityOrderNumbers,
  readShowCommunityNumbering,
  saveShowCommunityNumbering,
} from '../adminV5/deliveryWeighingV5/v7/communityOrderNumbering';
import './DeliveryDriverV7.css';

const DRIVER_SETUP_KEY = 'driverDeliveryV7::setup';

function readDriverSetup() {
  try {
    const raw = localStorage.getItem(DRIVER_SETUP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeDriverSetup(setup) {
  try {
    localStorage.setItem(DRIVER_SETUP_KEY, JSON.stringify(setup || {}));
  } catch {
    // localStorage can fail in private browsing; the screen still works without persistence.
  }
}

function parseLocalDateKey(dateKey) {
  const [year, month, day] = String(dateKey || '').split('-').map(Number);
  if (!year || !month || !day) return null;
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildDeliveryDayOptions(weekKey) {
  const weekStart = parseLocalDateKey(weekKey);
  if (!weekStart) return [];

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return {
      value: toLocalDateKey(date),
      label: date.toLocaleDateString('he-IL', {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
      }),
    };
  });
}

function formatDateKey(dateKey) {
  const date = parseLocalDateKey(dateKey);
  if (!date) return dateKey || '';
  return date.toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function getCustomerId(order) {
  return order?.customerDetails?.phone || order?.customerDetails?.email || '';
}

function getCommunity(order) {
  return order?.customerDetails?.pickupSpot || order?.pickupSpot || 'לא צוין';
}

function getCustomerDetails(order) {
  return {
    ...(order?.customerDetails || {}),
    ...(order?.rawData?.customerDetails || {}),
  };
}

function getDeliveryOption(order) {
  const customerDetails = getCustomerDetails(order);
  return customerDetails.deliveryOption || customerDetails.deliveryDetails?.type || '';
}

function isHomeDelivery(order) {
  return getDeliveryOption(order) === 'homeDelivery';
}

function getEffectiveOrderStatus(order, draft) {
  if (!order) return 'pending';
  if (order.status === 'completed') return 'completed';
  return draft?.status || order.status || 'pending';
}

function getPersistedCompletedDraft(order) {
  const raw = order?.rawData || {};
  const weighing = raw.weighing || {};
  const weightsByLineId = {
    ...(raw.weightsByLineId || {}),
    ...(weighing.weightsByLineId || {}),
  };
  const removedLineIds = {
    ...(raw.removedLineIds || {}),
    ...(weighing.removedLineIds || {}),
  };
  const finalInvoiceLines = Array.isArray(weighing.finalInvoiceLines)
    ? weighing.finalInvoiceLines
    : (Array.isArray(raw.finalInvoiceLines) ? raw.finalInvoiceLines : []);

  finalInvoiceLines.forEach((line) => {
    if (!line?.lineId || line.actualQuantity == null) return;
    weightsByLineId[line.lineId] = {
      actualQuantity: Number(line.actualQuantity),
      source: line.weighSource || line.source || 'completed',
    };
  });

  return {
    orderId: order?.id || raw.id || '',
    status: raw.delayedOrderStatus || order?.status || '',
    weightsByLineId,
    removedLineIds,
    finalInvoiceLines,
  };
}

function mergeOrderDraftWithPersistedCompletion(order, draft = {}) {
  const persisted = getPersistedCompletedDraft(order);
  return {
    ...persisted,
    ...draft,
    weightsByLineId: {
      ...(persisted.weightsByLineId || {}),
      ...(draft.weightsByLineId || {}),
    },
    removedLineIds: {
      ...(persisted.removedLineIds || {}),
      ...(draft.removedLineIds || {}),
    },
    status: draft.status || persisted.status || '',
  };
}

function normalizeSupplierOption(option) {
  if (!option) return '';
  const trimmed = String(option).trim();
  if (trimmed === 'ללא אופציות' || trimmed === 'None') return '';
  return trimmed;
}

function getMissingLineDetails(item, weights = {}, removed = {}) {
  if (!item?.lineId || item.catalogNumber === BUFFER_LINE_CATALOG_NUMBER) return null;
  const measurementType = item.measurementType || 'kg';
  const requested = safeNumber(item.requestedQuantity, 0);
  if (requested <= 0) return null;

  const avg = safeNumber(item.averageWeightKg, 1) || 1;
  const unitSize = safeNumber(item.unitSize, 1) || 1;
  const expected = measurementType === 'unit' ? requested * avg : requested;
  const actual = removed[item.lineId] ? 0 : safeNumber(weights[item.lineId]?.actualQuantity, 0);
  const missing = Math.max(0, expected - actual);
  if (missing <= 0.0005) return null;

  const fulfillmentRatio = expected > 0 ? actual / expected : 1;
  const isFullyMissing = actual <= 0.0005;
  const isPartialUnderHalf = !isFullyMissing && fulfillmentRatio < 0.5;
  if (!isFullyMissing && !isPartialUnderHalf) return null;

  const unitQty = measurementType === 'unit'
    ? missing / avg
    : measurementType === 'package'
      ? missing
      : missing / unitSize;

  return {
    measurementType,
    expected,
    actual,
    missing,
    unitQty,
    isFullyMissing,
    isPartialUnderHalf,
  };
}

function hasAnyWeighingData(draft) {
  return Object.keys(draft?.weightsByLineId || {}).length > 0
    || Object.keys(draft?.removedLineIds || {}).length > 0
    || Boolean(draft?.status);
}

function getMeasurementLabel(item, quantity) {
  const measurementType = item?.measurementType || 'kg';
  if (measurementType === 'package') return `${safeNumber(quantity, 0).toFixed(0)} יח׳`;
  if (measurementType === 'unit') return `${safeNumber(quantity, 0).toFixed(0)} יח׳`;
  return `${safeNumber(quantity, 0).toFixed(3)} ק״ג`;
}

function getStatusLabel(status) {
  const map = {
    pending: 'ממתין לשקילה',
    in_progress: 'בתהליך שקילה',
    weighed: 'נשקל',
    completed: 'הושלם',
    settled: 'הושלם',
    charged: 'הושלם',
  };
  return map[status] || status || 'ממתין';
}

function getStatusClass(status) {
  if (status === 'completed' || status === 'settled' || status === 'charged') {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (status === 'in_progress' || status === 'weighed') {
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }
  return 'bg-gray-50 text-gray-600 border-gray-200';
}

function CollapsibleSection({
  title,
  subtitle = '',
  badge = '',
  isOpen,
  onToggle,
  children,
  className = '',
}) {
  return (
    <section className={`driver-collapsible rounded-2xl shadow-sm overflow-hidden ${className}`}>
      <button
        type="button"
        onClick={onToggle}
        className="driver-collapsible__toggle w-full flex items-center justify-between gap-4 p-5 text-right transition-colors"
      >
        <div>
          <h2 className="driver-collapsible__title text-lg font-black">{title}</h2>
          {subtitle && <div className="driver-collapsible__subtitle text-sm mt-1">{subtitle}</div>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {badge && (
            <span className="driver-collapsible__badge text-xs rounded-full px-3 py-1">
              {badge}
            </span>
          )}
          <span className="driver-collapsible__icon w-8 h-8 rounded-full flex items-center justify-center font-black">
            {isOpen ? '−' : '+'}
          </span>
        </div>
      </button>
      {isOpen && <div className="border-t border-gray-100 p-5 bg-white text-gray-900">{children}</div>}
    </section>
  );
}

async function fetchCustomerNumbersReadOnly(orders = []) {
  const customerIds = [];
  const seen = new Set();
  orders.forEach((order) => {
    const id = getCustomerId(order);
    if (id && !seen.has(id)) {
      seen.add(id);
      customerIds.push(id);
    }
  });

  const mapping = {};
  const batchSize = 8;
  for (let index = 0; index < customerIds.length; index += batchSize) {
    const batch = customerIds.slice(index, index + batchSize);
    await Promise.all(batch.map(async (id) => {
      try {
        const snap = await getDoc(doc(db, 'customerNumbers', id));
        if (snap.exists() && snap.data()?.number != null) {
          mapping[id] = snap.data().number;
        }
      } catch {
        // Keep loading the manifest even if one customer number cannot be read.
      }
    }));
  }
  return mapping;
}

function buildOrderView(order, productDetails, draftsByOrder, customerNumbersMap) {
  const mergedItems = mergeProductDetailsIntoItems(order.items || [], productDetails);
  const mergedDraft = mergeOrderDraftWithPersistedCompletion(order, draftsByOrder[order.id] || {});
  const draft = sanitizeDraftForItems(mergedDraft, mergedItems);
  const status = getEffectiveOrderStatus(order, draft);
  const shouldCalculateMissing = hasAnyWeighingData(draft) || status === 'completed';
  const weights = draft.weightsByLineId || {};
  const removed = draft.removedLineIds || {};
  const missingLines = shouldCalculateMissing
    ? mergedItems
      .map((item) => {
        const details = getMissingLineDetails(item, weights, removed);
        if (!details) return null;
        return {
          key: item.lineId,
          productName: item.productName || item.name || 'Item',
          businessName: item.businessName || '',
          selectedOption: normalizeSupplierOption(item.selectedOption),
          measurementType: details.measurementType,
          missingQuantity: Math.round(details.missing * 1000) / 1000,
          unitQuantity: Math.round(details.unitQty * 1000) / 1000,
          expectedQuantity: Math.round(details.expected * 1000) / 1000,
          actualQuantity: Math.round(details.actual * 1000) / 1000,
          isFullyMissing: details.isFullyMissing,
          isPartialUnderHalf: details.isPartialUnderHalf,
        };
      })
      .filter(Boolean)
    : [];
  const customerId = getCustomerId(order);

  return {
    order,
    customerId,
    customerNumber: customerNumbersMap[customerId] || '',
    customerDetails: getCustomerDetails(order),
    community: getCommunity(order),
    isHomeDelivery: isHomeDelivery(order),
    items: mergedItems,
    missingLines,
    status,
  };
}

export default function DeliveryDriverV7() {
  const { currentUser, userRole } = useAuth();
  const initialSetup = useMemo(() => readDriverSetup(), []);
  const [authState, setAuthState] = useState({ checking: true, authorized: false, message: '' });
  const [availableWeeks, setAvailableWeeks] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState(initialSetup.weekKey || '');
  const [selectedDay, setSelectedDay] = useState(initialSetup.dayKey || '');
  const [selectedCommunities, setSelectedCommunities] = useState(
    () => new Set(Array.isArray(initialSetup.communities) ? initialSetup.communities : []),
  );
  const [loadedFilters, setLoadedFilters] = useState(null);
  const [expandedSections, setExpandedSections] = useState({});
  const [communityFilter, setCommunityFilter] = useState('__all__');
  const [orders, setOrders] = useState([]);
  const [productDetails, setProductDetails] = useState({});
  const [customerNumbersMap, setCustomerNumbersMap] = useState({});
  const [draftsByOrder, setDraftsByOrder] = useState({});
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [loadingWeeks, setLoadingWeeks] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [error, setError] = useState('');
  const [showCommunityNumbering, setShowCommunityNumbering] = useState(() => readShowCommunityNumbering());

  const selectedCommunityList = useMemo(
    () => Array.from(selectedCommunities).filter(Boolean),
    [selectedCommunities],
  );
  const activeWeek = loadedFilters?.weekKey || '';
  const activeDay = loadedFilters?.dayKey || '';
  const activeCommunityList = useMemo(() => loadedFilters?.communities || [], [loadedFilters]);

  const deliveryDayOptions = useMemo(() => buildDeliveryDayOptions(selectedWeek), [selectedWeek]);

  useEffect(() => {
    let active = true;

    async function checkDriverAccess() {
      if (!currentUser?.uid) {
        setAuthState({ checking: false, authorized: false, message: 'יש להתחבר כדי לצפות במסך הנהג.' });
        return;
      }

      try {
        const snap = await getDoc(doc(db, 'businesses', currentUser.uid));
        const isDriver = snap.exists() && isDeliveryDriverAccount(snap.data());
        if (!active) return;
        setAuthState({
          checking: false,
          authorized: userRole === 'driver' && isDriver,
          message: userRole === 'driver' && isDriver ? '' : 'אין לך הרשאה לצפות במסך הנהג.',
        });
      } catch {
        if (!active) return;
        setAuthState({ checking: false, authorized: false, message: 'לא ניתן לבדוק הרשאות נהג כרגע.' });
      }
    }

    setAuthState((prev) => ({ ...prev, checking: true }));
    checkDriverAccess();
    return () => {
      active = false;
    };
  }, [currentUser?.uid, userRole]);

  useEffect(() => {
    if (!authState.authorized) return;
    const weeks = getRecentWeekKeys(24);
    setAvailableWeeks(weeks);
    setSelectedWeek((current) => (current && weeks.includes(current) ? current : (weeks[0] || '')));
    setLoadingWeeks(false);
  }, [authState.authorized]);

  useEffect(() => {
    if (!selectedDay) return;
    const allowedDays = new Set(deliveryDayOptions.map((option) => option.value));
    if (allowedDays.size > 0 && !allowedDays.has(selectedDay)) {
      setSelectedDay('');
    }
  }, [deliveryDayOptions, selectedDay]);

  useEffect(() => {
    if (!authState.authorized || !activeWeek) {
      setOrders([]);
      setCustomerNumbersMap({});
      return () => {};
    }

    let active = true;
    setLoadingOrders(true);
    setError('');

    const unsubscribe = subscribeDelayedOrdersForWeekV7({
      weekKey: activeWeek,
      communities: activeCommunityList,
      startDate: activeDay,
      endDate: activeDay,
      onOrders: async ({ allOrders }) => {
        try {
          const productIds = new Set();
          allOrders.forEach((order) => {
            (order.items || []).forEach((item) => {
              if (item?.productId) productIds.add(item.productId);
            });
          });

          const [nextProductDetails, nextCustomerNumbers] = await Promise.all([
            productIds.size > 0 ? fetchProductDetailsV7(Array.from(productIds)) : {},
            fetchCustomerNumbersReadOnly(allOrders),
          ]);

          if (!active) return;
          setProductDetails((prev) => ({ ...prev, ...nextProductDetails }));
          setCustomerNumbersMap(nextCustomerNumbers);
          setOrders(allOrders);
          setSelectedOrderId((previous) => {
            if (previous && allOrders.some((order) => order.id === previous)) return previous;
            return null;
          });
          setError('');
        } catch (ordersError) {
          console.error(ordersError);
          if (active) setError('לא ניתן לטעון את רשימת המשלוחים.');
        } finally {
          if (active) setLoadingOrders(false);
        }
      },
      onError: (ordersError) => {
        console.error(ordersError);
        if (active) {
          setError('לא ניתן לטעון את רשימת המשלוחים.');
          setLoadingOrders(false);
        }
      },
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [authState.authorized, activeWeek, activeDay, activeCommunityList]);

  useEffect(() => {
    if (!authState.authorized || !activeWeek) {
      setDraftsByOrder({});
      return () => {};
    }

    return subscribeDraftsV7({
      weekKey: activeWeek,
      onData: setDraftsByOrder,
      onError: (draftsError) => {
        console.error(draftsError);
      },
    });
  }, [authState.authorized, activeWeek]);

  useEffect(() => {
    setExpandedSections((prev) => ({
      ...prev,
      selectedHomeDelivery: false,
      selectedMissing: false,
      selectedItems: false,
    }));
  }, [selectedOrderId]);

  const toggleCommunity = useCallback((community) => {
    setSelectedCommunities((prev) => {
      const next = new Set(prev);
      if (next.has(community)) next.delete(community);
      else next.add(community);
      return next;
    });
  }, []);

  const toggleSection = useCallback((sectionId) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  }, []);

  const handleLoadDeliveries = useCallback(() => {
    if (!selectedWeek) {
      setError('בחר שבוע משלוח לפני טעינה.');
      return;
    }

    const nextFilters = {
      weekKey: selectedWeek,
      dayKey: selectedDay,
      communities: selectedCommunityList,
    };

    setLoadedFilters(nextFilters);
    setCommunityFilter('__all__');
    setSelectedOrderId(null);
    setOrders([]);
    setProductDetails({});
    setCustomerNumbersMap({});
    setDraftsByOrder({});
    setError('');
    writeDriverSetup(nextFilters);
  }, [selectedCommunityList, selectedDay, selectedWeek]);

  const orderViews = useMemo(() => (
    orders.map((order) => buildOrderView(order, productDetails, draftsByOrder, customerNumbersMap))
  ), [orders, productDetails, draftsByOrder, customerNumbersMap]);

  const communityOrderMap = useMemo(() => (
    pickupSpots.reduce((acc, community, index) => {
      acc[community] = index;
      return acc;
    }, {})
  ), []);

  const communities = useMemo(() => {
    const unique = Array.from(new Set(orderViews.map((view) => view.community)));
    unique.sort((a, b) => {
      const rankA = communityOrderMap[a] ?? 9999;
      const rankB = communityOrderMap[b] ?? 9999;
      if (rankA !== rankB) return rankA - rankB;
      return a.localeCompare(b);
    });
    return unique;
  }, [communityOrderMap, orderViews]);

  const computedCommunityOrderNumbers = useMemo(() => (
    computeCommunityOrderNumbers({
      orders: orderViews.map((view) => ({
        id: view.order.id,
        customerDetails: view.customerDetails,
        pickupSpot: view.community,
      })),
      communities,
      customerNumbersMap,
    })
  ), [orderViews, communities, customerNumbersMap]);

  const toggleCommunityNumbering = useCallback(() => {
    setShowCommunityNumbering((prev) => {
      const next = !prev;
      saveShowCommunityNumbering(next);
      return next;
    });
  }, []);

  const visibleOrderViews = useMemo(() => {
    const list = communityFilter === '__all__'
      ? [...orderViews]
      : orderViews.filter((view) => view.community === communityFilter);

    list.sort((a, b) => {
      const communityRankA = communityOrderMap[a.community] ?? 9999;
      const communityRankB = communityOrderMap[b.community] ?? 9999;
      if (communityRankA !== communityRankB) return communityRankA - communityRankB;

      const aNumber = Number(a.customerNumber);
      const bNumber = Number(b.customerNumber);
      const aHasNumber = Number.isFinite(aNumber) && aNumber > 0;
      const bHasNumber = Number.isFinite(bNumber) && bNumber > 0;
      if (aHasNumber && bHasNumber && aNumber !== bNumber) return aNumber - bNumber;
      if (aHasNumber !== bHasNumber) return aHasNumber ? -1 : 1;

      return (a.customerDetails?.name || '').localeCompare(b.customerDetails?.name || '');
    });

    return list;
  }, [communityFilter, communityOrderMap, orderViews]);

  const selectedOrderView = useMemo(() => (
    visibleOrderViews.find((view) => view.order.id === selectedOrderId) || null
  ), [selectedOrderId, visibleOrderViews]);

  const homeDeliveryViews = useMemo(() => (
    orderViews
      .filter((view) => view.isHomeDelivery)
      .sort((a, b) => {
        const communityCompare = a.community.localeCompare(b.community);
        if (communityCompare !== 0) return communityCompare;
        const aNumber = Number(a.customerNumber);
        const bNumber = Number(b.customerNumber);
        if (Number.isFinite(aNumber) && Number.isFinite(bNumber) && aNumber !== bNumber) return aNumber - bNumber;
        return (a.customerDetails?.name || '').localeCompare(b.customerDetails?.name || '');
      })
  ), [orderViews]);

  const totals = useMemo(() => {
    const homeDeliveryCount = orderViews.filter((view) => view.isHomeDelivery).length;
    const missingCount = orderViews.filter((view) => view.missingLines.length > 0).length;
    return {
      orders: orderViews.length,
      communities: communities.length,
      homeDelivery: homeDeliveryCount,
      missing: missingCount,
    };
  }, [communities.length, orderViews]);

  const activeRangeLabel = activeDay
    ? formatDateKey(activeDay)
    : (activeWeek ? weekKeyToRangeLabel(activeWeek) : 'טרם נטען');
  const stagedRangeLabel = selectedDay
    ? formatDateKey(selectedDay)
    : (selectedWeek ? weekKeyToRangeLabel(selectedWeek) : 'לא נבחר');

  if (authState.checking) {
    return (
      <div className="notranslate min-h-screen bg-gray-50 pt-24 px-4" dir="rtl" translate="no">
        <div className="max-w-5xl mx-auto bg-white rounded-2xl shadow p-8 text-center text-gray-600">
          בודק הרשאות נהג...
        </div>
      </div>
    );
  }

  if (!authState.authorized) {
    return (
      <div className="notranslate min-h-screen bg-gray-50 pt-24 px-4" dir="rtl" translate="no">
        <div className="max-w-5xl mx-auto bg-white rounded-2xl shadow p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">מסך נהג</h1>
          <p className="text-red-600">{authState.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="driver-delivery-page notranslate min-h-screen bg-gray-50 pt-24 pb-10 px-4" dir="rtl" translate="no">
      <div className="max-w-7xl mx-auto space-y-4">
        <header className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black text-gray-900">מסך נהג משלוחים</h1>
              <p className="text-sm text-gray-500 mt-1">
                רשימת מספרים, שמות, קהילות, חוסרים ומשלוחים עד הבית לפי יום וקהילות.
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
              <div className="driver-stat-card rounded-xl px-4 py-3">
                <div className="text-2xl font-black">{totals.orders}</div>
                <div className="text-xs">הזמנות</div>
              </div>
              <div className="driver-stat-card rounded-xl px-4 py-3">
                <div className="text-2xl font-black">{totals.communities}</div>
                <div className="text-xs">קהילות</div>
              </div>
              <div className="driver-stat-card rounded-xl px-4 py-3">
                <div className="text-2xl font-black">{totals.homeDelivery}</div>
                <div className="text-xs">עד הבית</div>
              </div>
              <div className="driver-stat-card rounded-xl px-4 py-3">
                <div className="text-2xl font-black">{totals.missing}</div>
                <div className="text-xs">עם חוסרים</div>
              </div>
            </div>
          </div>
        </header>

        <CollapsibleSection
          title="בחירת יום וקהילות"
          subtitle={`הטווח שייטען: ${stagedRangeLabel}. הטווח הפעיל: ${activeRangeLabel}`}
          badge={loadedFilters ? 'נטען' : 'טרם נטען'}
          isOpen={Boolean(expandedSections.setup)}
          onToggle={() => toggleSection('setup')}
        >
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <label className="block">
              <span className="text-sm font-bold text-gray-700">שבוע משלוח</span>
              <select
                value={selectedWeek}
                onChange={(event) => setSelectedWeek(event.target.value)}
                className="mt-1 w-full border border-gray-300 rounded-xl px-3 py-2 bg-white"
                disabled={loadingWeeks}
              >
                {!selectedWeek && <option value="">בחר שבוע</option>}
                {availableWeeks.map((weekKey) => (
                  <option key={weekKey} value={weekKey}>
                    {weekKeyToRangeLabel(weekKey)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-bold text-gray-700">יום משלוח</span>
              <select
                value={selectedDay}
                onChange={(event) => setSelectedDay(event.target.value)}
                className="mt-1 w-full border border-gray-300 rounded-xl px-3 py-2 bg-white"
                disabled={!selectedWeek}
              >
                <option value="">כל השבוע</option>
                {deliveryDayOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
              <div className="text-sm font-bold text-gray-700">טווח פעיל</div>
              <div className="text-gray-800 mt-1">{activeRangeLabel}</div>
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={handleLoadDeliveries}
                disabled={!selectedWeek || loadingOrders}
                className={`driver-load-btn w-full rounded-xl px-4 py-2 font-bold transition-colors ${
                  !selectedWeek || loadingOrders ? 'bg-gray-300 cursor-not-allowed text-gray-600' : ''
                }`}
              >
                {loadingOrders ? 'טוען...' : 'טען משלוחים'}
              </button>
            </div>
          </div>

          <div className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-sm font-bold text-gray-700">קהילות</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedCommunities(new Set(pickupSpots))}
                  className="driver-mini-btn text-xs px-3 py-1 rounded-full"
                >
                  בחר הכל
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCommunities(new Set())}
                  className="text-xs bg-gray-100 text-gray-700 px-3 py-1 rounded-full"
                >
                  נקה בחירה
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {pickupSpots.map((community) => {
                const checked = selectedCommunities.has(community);
                return (
                  <label
                    key={community}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm cursor-pointer ${
                      checked ? 'driver-community-check is-checked' : 'bg-white border-gray-200 text-gray-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCommunity(community)}
                    />
                    <span>{community}</span>
                  </label>
                );
              })}
            </div>
            {selectedCommunities.size === 0 && (
              <div className="text-xs text-gray-500 mt-2">אין בחירה ספציפית, יוצגו כל הקהילות.</div>
            )}
          </div>
        </CollapsibleSection>

        {error && (
          <div className="bg-red-50 text-red-700 border border-red-200 rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        <CollapsibleSection
          title="משלוחים עד הבית"
          subtitle="פתח כדי לראות כתובות, הנחיות וטלפונים ללקוחות עם משלוח עד הבית."
          badge={`${homeDeliveryViews.length} משלוחים`}
          isOpen={Boolean(expandedSections.homeDelivery)}
          onToggle={() => toggleSection('homeDelivery')}
        >
          {homeDeliveryViews.length === 0 ? (
            <div className="text-gray-500 text-center py-6">אין משלוחים עד הבית בטווח שנטען.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {homeDeliveryViews.map((view) => {
                const communityNum = showCommunityNumbering
                  ? computedCommunityOrderNumbers[view.community]?.[view.order.id]
                  : null;
                return (
                <button
                  type="button"
                  key={view.order.id}
                  onClick={() => setSelectedOrderId(view.order.id)}
                  className="driver-home-card text-right rounded-2xl p-4 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="relative shrink-0">
                      <div className="w-11 h-11 rounded-full bg-yellow-500 text-white font-black flex items-center justify-center">
                        {view.customerNumber || '-'}
                      </div>
                      {communityNum && (
                        <span className="absolute -bottom-1 -left-1 min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-600 text-white text-[9px] font-black flex items-center justify-center leading-none">
                          #{communityNum}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-black text-gray-900">{view.customerDetails.name || 'לקוח ללא שם'}</div>
                      <div className="text-sm text-gray-700">{view.community}</div>
                      {view.customerDetails.phone && (
                        <div className="text-sm text-gray-900">{view.customerDetails.phone}</div>
                      )}
                      <div className="text-sm text-gray-800 mt-2">
                        <span className="font-bold">כתובת: </span>
                        {view.customerDetails.address || 'לא צוינה כתובת'}
                      </div>
                      {view.customerDetails.directions && (
                        <div className="text-sm text-gray-600 mt-1">
                          <span className="font-bold">הנחיות: </span>
                          {view.customerDetails.directions}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
              })}
            </div>
          )}
        </CollapsibleSection>

        <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-4">
          <CollapsibleSection
            title="רשימת משלוחים"
            subtitle="פתח כדי לראות מספרים, שמות וקהילות."
            badge={`${visibleOrderViews.length} מוצגים`}
            isOpen={Boolean(expandedSections.manifest)}
            onToggle={() => toggleSection('manifest')}
            className="self-start"
          >
            <div className="p-4 border-b border-gray-100 space-y-3">
              <button
                type="button"
                onClick={toggleCommunityNumbering}
                className={`px-3 py-1 rounded-full text-xs font-bold border ${
                  showCommunityNumbering
                    ? 'bg-indigo-600 text-white border-indigo-700'
                    : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                מספר לפי קהילה {showCommunityNumbering ? 'פעיל' : 'כבוי'}
              </button>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setCommunityFilter('__all__')}
                  className={`driver-chip driver-chip-all px-3 py-1 rounded-full text-sm border ${
                    communityFilter === '__all__' ? 'is-active' : ''
                  }`}
                >
                  הכל ({orderViews.length})
                </button>
                {communities.map((community) => {
                  const count = orderViews.filter((view) => view.community === community).length;
                  return (
                    <button
                      type="button"
                      key={community}
                      onClick={() => setCommunityFilter(community)}
                      className={`driver-chip px-3 py-1 rounded-full text-sm border ${
                        communityFilter === community ? 'is-active' : ''
                      }`}
                    >
                      {community} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="max-h-[70vh] overflow-y-auto divide-y divide-gray-100 -mx-5 -mb-5">
              {loadingOrders && (
                <div className="p-6 text-center text-gray-500">טוען משלוחים...</div>
              )}
              {!loadingOrders && visibleOrderViews.length === 0 && (
                <div className="p-6 text-center text-gray-500">לא נמצאו הזמנות לטווח שנבחר.</div>
              )}
              {!loadingOrders && visibleOrderViews.map((view) => {
                const active = selectedOrderView?.order.id === view.order.id;
                const communityNum = showCommunityNumbering
                  ? computedCommunityOrderNumbers[view.community]?.[view.order.id]
                  : null;
                return (
                  <button
                    type="button"
                    key={view.order.id}
                    onClick={() => setSelectedOrderId(view.order.id)}
                    className={`driver-order-row w-full text-right p-4 transition-colors ${
                      active ? 'is-active' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="relative shrink-0">
                        <div className="w-12 h-12 rounded-full bg-yellow-500 text-white font-black flex items-center justify-center text-lg">
                          {view.customerNumber || '-'}
                        </div>
                        {communityNum && (
                          <span className="absolute -bottom-1 -left-1 min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-600 text-white text-[9px] font-black flex items-center justify-center leading-none">
                            #{communityNum}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="driver-order-name font-black truncate">{view.customerDetails.name || 'לקוח ללא שם'}</div>
                          {view.isHomeDelivery && (
                            <span className="driver-badge-home text-xs rounded-full px-2 py-0.5">
                              עד הבית
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-600">{view.community}</div>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <span className={`text-xs border rounded-full px-2 py-0.5 ${getStatusClass(view.status)}`}>
                            {getStatusLabel(view.status)}
                          </span>
                          {view.missingLines.length > 0 && (
                            <span className="text-xs border border-red-200 bg-red-50 text-red-700 rounded-full px-2 py-0.5">
                              {view.missingLines.length} חוסרים
                            </span>
                          )}
                          <span className="text-xs border border-gray-200 bg-gray-50 text-gray-600 rounded-full px-2 py-0.5">
                            {view.items.length} פריטים
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="פרטי הזמנה"
            subtitle="פתח אחרי בחירת לקוח כדי לראות פרטים נוספים."
            badge={selectedOrderView?.customerDetails?.name || 'לא נבחר'}
            isOpen={Boolean(expandedSections.orderDetails)}
            onToggle={() => toggleSection('orderDetails')}
            className="min-h-[120px]"
          >
            {!selectedOrderView ? (
              <div className="h-full flex items-center justify-center text-gray-500">
                בחר הזמנה כדי לראות פרטים.
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="relative">
                      <div className="w-16 h-16 rounded-full bg-yellow-500 text-white font-black flex items-center justify-center text-2xl">
                        {selectedOrderView.customerNumber || '-'}
                      </div>
                      {showCommunityNumbering && computedCommunityOrderNumbers[selectedOrderView.community]?.[selectedOrderView.order.id] && (
                        <span className="absolute -bottom-1 -left-1 min-w-[22px] h-[22px] px-1 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center leading-none">
                          #{computedCommunityOrderNumbers[selectedOrderView.community][selectedOrderView.order.id]}
                        </span>
                      )}
                    </div>
                    <div>
                      <h2 className="text-2xl font-black text-gray-900">
                        {selectedOrderView.customerDetails.name || 'לקוח ללא שם'}
                      </h2>
                      <div className="text-gray-600">{selectedOrderView.community}</div>
                      {selectedOrderView.customerDetails.phone && (
                        <a className="text-gray-900 hover:underline" href={`tel:${selectedOrderView.customerDetails.phone}`}>
                          {selectedOrderView.customerDetails.phone}
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`text-sm border rounded-full px-3 py-1 ${getStatusClass(selectedOrderView.status)}`}>
                      {getStatusLabel(selectedOrderView.status)}
                    </span>
                    {selectedOrderView.isHomeDelivery && (
                      <span className="driver-badge-home text-sm rounded-full px-3 py-1">
                        משלוח עד הבית
                      </span>
                    )}
                  </div>
                </div>

                {selectedOrderView.isHomeDelivery && (
                  <CollapsibleSection
                    title="פרטי משלוח עד הבית"
                    subtitle="פתח כדי לראות כתובת, הנחיות ודמי משלוח."
                    badge="עד הבית"
                    isOpen={Boolean(expandedSections.selectedHomeDelivery)}
                    onToggle={() => toggleSection('selectedHomeDelivery')}
                  >
                    <div className="driver-home-detail-box rounded-2xl p-4 space-y-1">
                      <div>
                        <span className="font-bold">כתובת: </span>
                        {selectedOrderView.customerDetails.address || 'לא צוינה כתובת'}
                      </div>
                      {selectedOrderView.customerDetails.directions && (
                        <div>
                          <span className="font-bold">הנחיות: </span>
                          {selectedOrderView.customerDetails.directions}
                        </div>
                      )}
                      {selectedOrderView.customerDetails.deliveryDetails?.deliveryFee != null && (
                        <div>
                          <span className="font-bold">דמי משלוח: </span>
                          ₪{safeNumber(selectedOrderView.customerDetails.deliveryDetails.deliveryFee, 0).toFixed(2)}
                        </div>
                      )}
                    </div>
                  </CollapsibleSection>
                )}

                <CollapsibleSection
                  title="חוסרים לבדיקה"
                  subtitle="פתח כדי לראות חוסרים מלאים או חוסרים מתחת לחצי."
                  badge={`${selectedOrderView.missingLines.length} חוסרים`}
                  isOpen={Boolean(expandedSections.selectedMissing)}
                  onToggle={() => toggleSection('selectedMissing')}
                >
                  {selectedOrderView.missingLines.length === 0 ? (
                    <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-gray-600">
                      אין חוסרים מסומנים להזמנה הזו, או שההזמנה עדיין לא נשקלה.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedOrderView.missingLines.map((line) => (
                        <div key={line.key} className="border border-red-100 bg-red-50 rounded-xl p-3">
                          <div className="font-bold text-red-900">{line.productName}</div>
                          <div className="text-sm text-red-800">
                            {line.businessName && <span>{line.businessName}</span>}
                            {line.selectedOption && <span> · {line.selectedOption}</span>}
                          </div>
                          <div className="text-sm text-red-700 mt-1">
                            חסר: {getMeasurementLabel({ measurementType: line.measurementType }, line.unitQuantity)}
                            {' '}({line.isFullyMissing ? 'חוסר מלא' : 'פחות מחצי'})
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CollapsibleSection>

                <CollapsibleSection
                  title="פריטי הזמנה"
                  subtitle="פתח כדי לראות את רשימת הפריטים של הלקוח."
                  badge={`${selectedOrderView.items.length} פריטים`}
                  isOpen={Boolean(expandedSections.selectedItems)}
                  onToggle={() => toggleSection('selectedItems')}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {selectedOrderView.items.map((item) => (
                      <div key={item.lineId || `${item.productId}-${item.productName}`} className="border border-gray-100 rounded-xl p-3 bg-gray-50">
                        <div className="font-bold text-gray-900">{item.productName || item.name}</div>
                        <div className="text-sm text-gray-600">
                          {item.businessName}
                          {normalizeSupplierOption(item.selectedOption) && ` · ${normalizeSupplierOption(item.selectedOption)}`}
                        </div>
                        <div className="text-sm text-gray-800 mt-1">
                          הוזמן: {getMeasurementLabel(item, item.requestedQuantity)}
                        </div>
                      </div>
                    ))}
                  </div>
                </CollapsibleSection>
              </div>
            )}
          </CollapsibleSection>
        </div>
      </div>
    </div>
  );
}
