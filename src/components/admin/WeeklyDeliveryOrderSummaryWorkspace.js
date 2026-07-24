import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import usePickupSpots from '../../hooks/usePickupSpots';
import {
  generateAvailableDeliveryDates,
  getDateRangeFromWeekKey,
  getOrderCommunity,
  getOrderDeliveryDate,
  getRecentWeekKeys,
  getWeekKey,
  isOrderDeliveryDateFallback,
  normalizeDateRange,
  toLocalDateKey,
} from '../../utils/deliveryScheduleUtils';
import {
  aggregateDeliveryBusinessSummary,
  getDuplicateOrderKey,
  shouldIncludeOrderInDeliverySummary,
} from '../../utils/weeklyDeliveryOrderSummaryUtils';
import { filterCustomerActiveLines } from '../../utils/customerOrderUtils';
import { computeCustomerOrderGrandTotal } from '../../services/customerOrderService';
import { ensureLineIdsInBreakdown } from '../adminV5/deliveryWeighingV5/v7/orderDraftUtils';
import LoadingSpinner from '../LoadingSpinner';
import CustomerOrderDeliveryTransferControl from './CustomerOrderDeliveryTransferControl';
import { buildWhatsappLink } from '../../constants/marketplaceStoreContent';

const ADMIN_UIDS = ['rfHOLhNoJOW8ByNypCtm3hlSNKs2'];

const parseLocalDate = (dateKey) => {
  if (!dateKey) return null;
  const [year, month, day] = String(dateKey).split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeOption = (opt) => {
  if (!opt) return '';
  const trimmed = String(opt).trim();
  if (trimmed === 'ללא אופציות' || trimmed === 'None') return '';
  return trimmed;
};

const copyText = async (text) => {
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
};

const getSafeDocId = (businessId, businessName) => {
  const sanitize = (value) => String(value || '')
    .replace(/[/\\#?[\]]+/g, '-')
    .trim()
    .slice(0, 120) || 'unknown';
  if (businessId && !/[/\\#?[\]]/.test(String(businessId))) return String(businessId);
  return sanitize(businessName);
};

const getProductUnitCount = (product) => {
  const isUnitBased = product.measurementType === 'package' || product.measurementType === 'unit';
  if (isUnitBased) return Math.round(Number(product.quantity) || 0);
  return Math.round((Number(product.quantity) || 0) / (product.unitSize || 1));
};

const buildCustomerOrderMessage = (order) => {
  const name = order.customerDetails?.name || 'לא צוין';
  const phone = order.customerDetails?.phone || '';
  const lines = [
    `הזמנה - ${name}`,
    phone ? `טלפון: ${phone}` : null,
    `תאריך משלוח: ${order.deliveryDateLabel}`,
    `קהילה: ${order.community}`,
    `מספר הזמנה: ${order.id}`,
    '',
    'פריטים:',
  ].filter(Boolean);

  if (order.orderBreakdown) {
    Object.values(order.orderBreakdown).forEach((businessOrder) => {
      filterCustomerActiveLines(order, businessOrder.items).forEach((item) => {
        const opt = normalizeOption(item.selectedOption);
        const optPart = opt ? ` (${opt})` : '';
        lines.push(`* ${item.quantity} x ${item.productName || item.name}${optPart} - ${businessOrder.businessName}`);
      });
    });
  }

  lines.push('', `סה"כ: ₪${computeCustomerOrderGrandTotal(order).toFixed(2)}`);
  return lines.join('\n');
};

const WeeklyDeliveryOrderSummaryWorkspace = () => {
  const { currentUser } = useAuth();
  const { pickupSpots } = usePickupSpots();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [availableWeeks, setAvailableWeeks] = useState([]);
  const [availableDeliveryDates, setAvailableDeliveryDates] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState('');
  const [selectedDeliveryDate, setSelectedDeliveryDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedCommunities, setSelectedCommunities] = useState(new Set());
  const [draftSelectedWeek, setDraftSelectedWeek] = useState('');
  const [draftStartDate, setDraftStartDate] = useState('');
  const [draftEndDate, setDraftEndDate] = useState('');
  const [showCommunityDropdown, setShowCommunityDropdown] = useState(false);
  const [orders, setOrders] = useState([]);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [hasLoadedOrders, setHasLoadedOrders] = useState(false);
  const [loadRequestId, setLoadRequestId] = useState(0);
  const [activeView, setActiveView] = useState('suppliers');
  const [orderMessageName, setOrderMessageName] = useState('');
  const [orderMessageDate, setOrderMessageDate] = useState('');
  const [costModalOpen, setCostModalOpen] = useState(false);
  const [costModalBusinessId, setCostModalBusinessId] = useState('');
  const [costModalBusinessName, setCostModalBusinessName] = useState('');
  const [costModalItems, setCostModalItems] = useState([]);
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [customModalBusinessName, setCustomModalBusinessName] = useState('');
  const [customModalItems, setCustomModalItems] = useState([]);
  const communityDropdownRef = useRef(null);

  useEffect(() => {
    const handler = (event) => {
      if (communityDropdownRef.current && !communityDropdownRef.current.contains(event.target)) {
        setShowCommunityDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!currentUser || !ADMIN_UIDS.includes(currentUser.uid)) {
      setError('You are not authorized to view this page');
      setLoading(false);
      return;
    }
    fetchAvailableFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  useEffect(() => {
    if (loadRequestId > 0) {
      fetchOrders();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadRequestId]);

  const fetchAvailableFilters = async () => {
    setLoading(true);
    setError('');
    try {
      const schedulesSnapshot = await getDocs(collection(db, 'deliverySchedules'));
      const deliveryDates = new Set();

      schedulesSnapshot.docs.forEach((scheduleSnap) => {
        generateAvailableDeliveryDates(scheduleSnap.data(), { includePastCutoff: true })
          .forEach((dateKey) => deliveryDates.add(dateKey));
      });

      const sortedWeeks = getRecentWeekKeys(16);
      const sortedDeliveryDates = Array.from(deliveryDates).sort();

      setAvailableWeeks(sortedWeeks);
      setAvailableDeliveryDates(sortedDeliveryDates);
      if (sortedWeeks.length > 0) {
        setDraftSelectedWeek(sortedWeeks[0]);
      }
      const todayKey = toLocalDateKey(new Date());
      setOrderMessageDate(
        sortedDeliveryDates.find((dateKey) => dateKey >= todayKey)
          || sortedDeliveryDates[sortedDeliveryDates.length - 1]
          || ''
      );
    } catch (err) {
      console.error('Error fetching delivery filters:', err);
      setError('Failed to load delivery dates');
    } finally {
      setLoading(false);
    }
  };

  const buildSelectedWindow = () => {
    return normalizeDateRange(startDate, endDate) || getDateRangeFromWeekKey(selectedWeek);
  };

  const handleApplyFilters = () => {
    setSelectedWeek(draftSelectedWeek);
    setStartDate(draftStartDate);
    setEndDate(draftEndDate);
    setSelectedDeliveryDate('');
    setLoadRequestId((current) => current + 1);
  };

  const fetchOrders = async () => {
    setLoading(true);
    setError('');
    try {
      const window = buildSelectedWindow();
      if (!window) {
        setOrders([]);
        setHasLoadedOrders(true);
        return;
      }

      setDateRange({
        start: format(window.start, 'dd/MM/yyyy'),
        end: format(window.end, 'dd/MM/yyyy'),
      });
      setOrderMessageDate(toLocalDateKey(window.end));

      const [ordersSnapshot, delayedSnapshot] = await Promise.all([
        getDocs(collection(db, 'customerOrders')),
        getDocs(collection(db, 'customerOrdersDelayed')),
      ]);

      const nextOrders = [];
      const allDocs = [
        ...ordersSnapshot.docs.map((docSnap) => ({ docSnap, source: 'customerOrders' })),
        ...delayedSnapshot.docs.map((docSnap) => ({ docSnap, source: 'customerOrdersDelayed' })),
      ];

      allDocs.forEach(({ docSnap, source }) => {
        const orderData = docSnap.data() || {};
        if (!shouldIncludeOrderInDeliverySummary(orderData, source)) return;

        const deliveryDate = getOrderDeliveryDate(orderData);
        if (!deliveryDate || deliveryDate < window.start || deliveryDate > window.end) return;

        const community = getOrderCommunity(orderData);
        const orderBreakdown = ensureLineIdsInBreakdown(
          docSnap.id,
          orderData.orderBreakdown || {},
        ).breakdown;

        const orderWithMeta = {
          id: docSnap.id,
          source,
          ...orderData,
          deliveryDate,
          deliveryDateLabel: format(deliveryDate, 'dd/MM/yyyy'),
          deliveryWeekKey: getWeekKey(deliveryDate),
          deliveryDateIsFallback: isOrderDeliveryDateFallback(orderData),
          community,
          orderBreakdown,
        };
        nextOrders.push(orderWithMeta);
      });

      nextOrders.sort((a, b) => b.deliveryDate - a.deliveryDate);
      setOrders(nextOrders);
      setHasLoadedOrders(true);
    } catch (err) {
      console.error('Error fetching delivery orders:', err);
      setError('Failed to load delivery orders');
    } finally {
      setLoading(false);
    }
  };

  const visibleOrders = useMemo(() => orders.filter((order) => {
    if (selectedDeliveryDate && toLocalDateKey(order.deliveryDate) !== selectedDeliveryDate) return false;
    return selectedCommunities.size === 0 || selectedCommunities.has(order.community);
  }), [orders, selectedDeliveryDate, selectedCommunities]);

  const businessSummary = useMemo(
    () => aggregateDeliveryBusinessSummary(visibleOrders),
    [visibleOrders]
  );

  const displayDeliveryDates = useMemo(() => {
    const window = normalizeDateRange(startDate, endDate) || getDateRangeFromWeekKey(selectedWeek);
    const dates = new Set(orders.map((order) => toLocalDateKey(order.deliveryDate)).filter(Boolean));
    if (window) {
      availableDeliveryDates.forEach((dateKey) => {
        const date = parseLocalDate(dateKey);
        if (date && date >= window.start && date <= window.end) dates.add(dateKey);
      });
    }
    return Array.from(dates).sort();
  }, [availableDeliveryDates, endDate, orders, selectedWeek, startDate]);

  const ordersByCommunity = useMemo(() => {
    return visibleOrders.reduce((acc, order) => {
      if (!acc[order.community]) acc[order.community] = [];
      acc[order.community].push(order);
      return acc;
    }, {});
  }, [visibleOrders]);

  const duplicateOrderKeys = useMemo(() => {
    const groups = visibleOrders.reduce((acc, order) => {
      const key = getDuplicateOrderKey(order);
      if (!acc[key]) acc[key] = [];
      acc[key].push(order.id);
      return acc;
    }, {});
    return new Set(
      Object.entries(groups)
        .filter(([, ids]) => ids.length > 1)
        .flatMap(([, ids]) => ids)
    );
  }, [visibleOrders]);

  const duplicateCustomerCount = useMemo(() => {
    const groups = visibleOrders.reduce((acc, order) => {
      const key = getDuplicateOrderKey(order);
      if (!acc[key]) acc[key] = 0;
      acc[key] += 1;
      return acc;
    }, {});
    return Object.values(groups).filter((count) => count > 1).length;
  }, [visibleOrders]);

  const handleCopyCustomerOrder = async (order) => {
    try {
      await copyText(buildCustomerOrderMessage(order));
      alert('ההזמנה הועתקה');
    } catch (err) {
      console.error('Failed to copy customer order:', err);
      alert('שגיאה בהעתקת ההזמנה');
    }
  };

  const handleDeliveryTransferred = () => {
    setLoadRequestId((current) => current + 1);
  };

  const toggleCommunity = (community) => {
    setSelectedCommunities((prev) => {
      const next = new Set(prev);
      if (next.has(community)) next.delete(community);
      else next.add(community);
      return next;
    });
  };

  const buildBusinessOrderMessage = (business, useKgFormat = false) => {
    const dateForHeader = orderMessageDate
      ? format(parseLocalDate(orderMessageDate), 'dd.MM.yy')
      : String(dateRange.end || '').replace(/\//g, '.').slice(0, 8);
    const greetingName = orderMessageName ? `${orderMessageName} ` : '';
    const header = `${greetingName}צהריים טובים, הזמנה ל${dateForHeader}:`;
    const items = Object.values(business.products)
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .map((product) => {
        const opt = normalizeOption(product.selectedOption);
        const isKgInKgFormat = (product.measurementType === 'kg' || !product.measurementType) && useKgFormat;
        const optPart = opt && !isKgInKgFormat ? ` *${opt}*` : '';
        const isUnitBased = product.measurementType === 'package' || product.measurementType === 'unit';
        if (isUnitBased) return `* ${product.productName}${optPart} - ${Math.round(product.quantity)} יח'`;
        if (useKgFormat) return `* ${product.productName} - ${Number(product.quantity).toFixed(1)} ק"ג`;
        return `* ${product.productName}${optPart} - ${getProductUnitCount(product)} יח'`;
      });
    return [header, '', ...items].join('\n');
  };

  const handleCopyBusinessOrder = async (business, useKgFormat = false) => {
    try {
      await copyText(buildBusinessOrderMessage(business, useKgFormat));
      alert(useKgFormat ? 'ההזמנה הועתקה בק"ג' : 'ההזמנה הועתקה ביחידות');
    } catch (err) {
      console.error('Failed to copy supplier order:', err);
      alert('שגיאה בהעתקת ההזמנה');
    }
  };

  const openCustomModal = (business) => {
    const items = Object.entries(business.products || {})
      .sort(([, a], [, b]) => b.totalRevenue - a.totalRevenue)
      .map(([key, product]) => {
        const isUnitBased = product.measurementType === 'package' || product.measurementType === 'unit';
        const unitSize = product.unitSize || 1;
        return {
          key,
          productName: product.productName,
          selectedOption: normalizeOption(product.selectedOption),
          rawQuantity: Number(product.quantity) || 0,
          unitSize,
          measurementType: product.measurementType || 'kg',
          mode: 'unit',
          isUnitBased,
          quantity: isUnitBased ? Math.round(product.quantity) : Math.round((Number(product.quantity) || 0) / unitSize),
          included: true,
        };
      });
    setCustomModalBusinessName(business.businessName || '');
    setCustomModalItems(items);
    setCustomModalOpen(true);
  };

  const closeCustomModal = () => {
    setCustomModalOpen(false);
    setCustomModalBusinessName('');
    setCustomModalItems([]);
  };

  const updateCustomItem = (index, field, value) => {
    setCustomModalItems((prev) => {
      const next = [...prev];
      const item = { ...next[index] };
      if (field === 'mode') {
        item.mode = value;
        item.quantity = value === 'kg'
          ? Number(item.rawQuantity.toFixed(1))
          : Math.round(item.rawQuantity / (item.unitSize || 1));
      } else if (field === 'quantity') {
        item.quantity = value === '' ? '' : Number(value);
      } else if (field === 'included') {
        item.included = value;
      }
      next[index] = item;
      return next;
    });
  };

  const setAllCustomMode = (mode) => {
    setCustomModalItems((prev) => prev.map((item) => {
      if (item.isUnitBased) return item;
      return {
        ...item,
        mode,
        quantity: mode === 'kg'
          ? Number(item.rawQuantity.toFixed(1))
          : Math.round(item.rawQuantity / (item.unitSize || 1)),
      };
    }));
  };

  const buildCustomOrderText = () => {
    const dateForHeader = orderMessageDate
      ? format(parseLocalDate(orderMessageDate), 'dd.MM.yy')
      : String(dateRange.end || '').replace(/\//g, '.').slice(0, 8);
    const greetingName = orderMessageName ? `${orderMessageName} ` : '';
    const parts = [`${greetingName}צהריים טובים, הזמנה ל${dateForHeader}:`, ''];
    const included = customModalItems.filter((item) => item.included && (Number(item.quantity) || 0) > 0);
    const kgItems = included.filter((item) => item.mode === 'kg' && !item.isUnitBased);
    const unitItems = included.filter((item) => item.mode !== 'kg' || item.isUnitBased);
    const formatLine = (item) => {
      const opt = normalizeOption(item.selectedOption);
      const isKgMode = item.mode === 'kg' && !item.isUnitBased;
      const optPart = opt && !isKgMode ? ` *${opt}*` : '';
      const qty = Number(item.quantity) || 0;
      return `* ${item.productName}${optPart} - ${isKgMode ? qty.toFixed(1) : Math.round(qty)} ${isKgMode ? 'ק"ג' : "יח'"}`;
    };

    if (kgItems.length > 0) {
      parts.push('הזמנה סיטונאית לא ארוז:');
      parts.push(...kgItems.map(formatLine));
    }
    if (kgItems.length > 0 && unitItems.length > 0) parts.push('');
    if (unitItems.length > 0) {
      parts.push('הזמנה ארוז:');
      parts.push(...unitItems.map(formatLine));
    }
    return parts.join('\n');
  };

  const handleCopyCustomOrder = async () => {
    try {
      await copyText(buildCustomOrderText());
      alert('ההזמנה המותאמת הועתקה');
      closeCustomModal();
    } catch (err) {
      console.error('Failed to copy custom order:', err);
      alert('שגיאה בהעתקה');
    }
  };

  const openCostModal = async (businessId, business) => {
    try {
      const safeId = getSafeDocId(businessId, business?.businessName || '');
      const baseItems = Object.entries(business.products || {}).map(([key, product]) => ({
        key,
        productName: product.productName,
        selectedOption: normalizeOption(product.selectedOption),
        quantity: Number(product.quantity) || 0,
        price: '',
      }));

      try {
        const snap = await getDoc(doc(db, 'farmerCosts', safeId));
        if (snap.exists()) {
          const savedItems = snap.data()?.items || {};
          baseItems.forEach((item) => {
            const saved = savedItems[item.key];
            if (!saved) return;
            if (saved.price !== undefined && saved.price !== null) item.price = String(saved.price);
            if (saved.quantity !== undefined && saved.quantity !== null) item.quantity = Number(saved.quantity);
          });
        }
      } catch (inner) {
        console.warn('Unable to fetch saved costs, continuing without them', inner);
      }

      setCostModalBusinessId(safeId);
      setCostModalBusinessName(business?.businessName || '');
      setCostModalItems(baseItems);
      setCostModalOpen(true);
    } catch (err) {
      console.error('Failed to open cost modal:', err);
      alert('שגיאה בטעינת נתוני העלות לעסק');
    }
  };

  const closeCostModal = () => {
    setCostModalOpen(false);
    setCostModalBusinessId('');
    setCostModalBusinessName('');
    setCostModalItems([]);
  };

  const updateCostModalItem = (index, field, value) => {
    setCostModalItems((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        [field]: field === 'price' ? value : (value === '' ? '' : Number(value)),
      };
      return next;
    });
  };

  const computeCostTotals = (items) => {
    let total = 0;
    const lines = [];
    items.forEach((item) => {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.price) || 0;
      if (qty <= 0 || price <= 0) return;
      const lineTotal = qty * price;
      total += lineTotal;
      lines.push(`${item.productName}${item.selectedOption ? ` ${item.selectedOption}` : ''} - ${qty}x${price} = ${lineTotal} ₪`);
    });
    return { total, lines };
  };

  const saveCostsAndCopy = async () => {
    try {
      const itemsPayload = {};
      costModalItems.forEach((item) => {
        itemsPayload[item.key] = {
          productName: item.productName,
          selectedOption: item.selectedOption || '',
          quantity: Number(item.quantity) || 0,
          price: Number(item.price) || 0,
          updatedAt: new Date().toISOString(),
        };
      });

      const ref = doc(db, 'farmerCosts', getSafeDocId(costModalBusinessId, costModalBusinessName));
      const existing = await getDoc(ref);
      if (!existing.exists() || JSON.stringify(existing.data()?.items || {}) !== JSON.stringify(itemsPayload)) {
        await setDoc(ref, { businessName: costModalBusinessName, items: itemsPayload }, { merge: true });
      }

      const { total, lines } = computeCostTotals(costModalItems);
      await copyText(['עלות מחושבת:', '', ...lines, '', `סה"כ לתשלום: ${total}`].join('\n'));
      alert('העלות נשמרה והועתקה ללוח העריכה');
      closeCostModal();
    } catch (err) {
      console.error('Failed to save/copy costs:', err);
      alert('שגיאה בשמירת/העתקת העלויות');
    }
  };

  const orderTotal = visibleOrders.reduce(
    (sum, order) => sum + computeCustomerOrderGrandTotal(order),
    0,
  );

  if (loading) {
    return (
      <div className="py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return <div className="max-w-4xl mx-auto p-6 text-red-600">{error}</div>;
  }

  return (
    <div className="max-w-7xl mx-auto p-6" dir="rtl">
      <h1 className="text-2xl font-bold mb-2">סיכום הזמנות לפי תאריך משלוח</h1>
      <p className="text-gray-600 mb-6">
        בחרו יום משלוח זמין, ואז עברו בין הזמנות מספקים לבין צפייה בהזמנות לקוחות.
      </p>

      <div className="bg-white rounded-lg shadow p-5 mb-6 grid grid-cols-1 md:grid-cols-5 gap-4">
        <label>
          <span className="block text-sm font-medium text-gray-700 mb-1">יום להצגה</span>
          <select
            value={selectedDeliveryDate}
            onChange={(event) => {
              setSelectedDeliveryDate(event.target.value);
              if (event.target.value) setOrderMessageDate(event.target.value);
            }}
            className="w-full border border-gray-300 rounded-md px-3 py-2"
            disabled={!hasLoadedOrders}
          >
            <option value="">כל הימים שנטענו</option>
            {displayDeliveryDates.map((dateKey) => (
              <option key={dateKey} value={dateKey}>
                {parseLocalDate(dateKey)?.toLocaleDateString('he-IL', {
                  weekday: 'long',
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                })}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="block text-sm font-medium text-gray-700 mb-1">שבוע משלוח</span>
          <select
            value={draftSelectedWeek}
            onChange={(event) => {
              setDraftSelectedWeek(event.target.value);
              setDraftStartDate('');
              setDraftEndDate('');
            }}
            className="w-full border border-gray-300 rounded-md px-3 py-2"
          >
            <option value="">בחר שבוע</option>
            {availableWeeks.map((week) => {
              const sunday = parseLocalDate(week);
              const friday = new Date(sunday);
              friday.setDate(sunday.getDate() + 5);
              return (
                <option key={week} value={week}>
                  {format(sunday, 'dd/MM/yyyy')} - {format(friday, 'dd/MM/yyyy')}
                </option>
              );
            })}
          </select>
        </label>

        <label>
          <span className="block text-sm font-medium text-gray-700 mb-1">מתאריך</span>
          <input
            type="date"
            value={draftStartDate}
            onChange={(event) => {
              setDraftStartDate(event.target.value);
              setDraftSelectedWeek('');
            }}
            className="w-full border border-gray-300 rounded-md px-3 py-2"
          />
        </label>

        <label>
          <span className="block text-sm font-medium text-gray-700 mb-1">עד תאריך</span>
          <input
            type="date"
            value={draftEndDate}
            onChange={(event) => {
              setDraftEndDate(event.target.value);
              setDraftSelectedWeek('');
            }}
            className="w-full border border-gray-300 rounded-md px-3 py-2"
          />
        </label>

        <div className="relative" ref={communityDropdownRef}>
          <span className="block text-sm font-medium text-gray-700 mb-1">קהילות</span>
          <button
            type="button"
            onClick={() => setShowCommunityDropdown((prev) => !prev)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-right"
          >
            {selectedCommunities.size === 0 ? 'כל הקהילות' : `${selectedCommunities.size} נבחרו`}
          </button>
          {showCommunityDropdown && (
            <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-80 overflow-auto p-2">
              <div className="flex gap-2 mb-2 pb-2 border-b">
                <button
                  type="button"
                  onClick={() => setSelectedCommunities(new Set(pickupSpots))}
                  className="text-xs px-2 py-1 bg-blue-600 text-white rounded"
                >
                  בחר הכל
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCommunities(new Set())}
                  className="text-xs px-2 py-1 bg-gray-200 text-gray-700 rounded"
                >
                  נקה הכל
                </button>
              </div>
              {pickupSpots.map((spot) => (
                <label key={spot} className="flex items-center gap-2 px-2 py-1 text-sm hover:bg-gray-50 rounded">
                  <input
                    type="checkbox"
                    checked={selectedCommunities.has(spot)}
                    onChange={() => toggleCommunity(spot)}
                  />
                  <span>{spot}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-gray-600">
          טווח טעון: {dateRange.start} - {dateRange.end}. סינון יום וקהילות מתעדכן מיד ללא טעינה מחדש.
        </p>
        <button
          type="button"
          onClick={handleApplyFilters}
          className="px-5 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          טען נתונים
        </button>
      </div>

      {!hasLoadedOrders ? (
        <div className="bg-blue-50 border border-blue-200 text-blue-700 p-4 rounded text-center">
          בחרו פרמטרים ולחצו על "טען נתונים" כדי להציג הזמנות.
        </div>
      ) : visibleOrders.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 p-4 rounded text-center">
          לא נמצאו הזמנות עבור התאריך והקהילות שנבחרו
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white p-4 rounded shadow">
              <p className="text-gray-500 text-sm">מספר הזמנות</p>
              <p className="text-2xl font-bold">{visibleOrders.length}</p>
            </div>
            <div className="bg-white p-4 rounded shadow">
              <p className="text-gray-500 text-sm">סה"כ הכנסות</p>
              <p className="text-2xl font-bold">₪{orderTotal.toFixed(2)}</p>
            </div>
            <div className="bg-white p-4 rounded shadow">
              <p className="text-gray-500 text-sm">עסקים</p>
              <p className="text-2xl font-bold">{Object.keys(businessSummary).length}</p>
            </div>
          </div>

          <div className="mb-6 bg-white rounded-lg shadow p-2 flex gap-2">
            <button
              type="button"
              onClick={() => setActiveView('suppliers')}
              className={`flex-1 py-3 rounded-md font-semibold ${activeView === 'suppliers' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              הזמנות מספקים
            </button>
            <button
              type="button"
              onClick={() => setActiveView('customers')}
              className={`flex-1 py-3 rounded-md font-semibold ${activeView === 'customers' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              הזמנות לקוחות
            </button>
          </div>

          {activeView === 'customers' ? (
            <section className="space-y-6">
              <h2 className="text-2xl font-semibold">הזמנות לקוחות לפי קהילה</h2>
              {duplicateCustomerCount > 0 && (
                <div className="bg-amber-50 border border-amber-300 text-amber-800 p-4 rounded-lg">
                  נמצאו {duplicateCustomerCount} לקוחות עם יותר מהזמנה אחת באותו תאריך משלוח וקהילה. שורות מסומנות בכתום.
                </div>
              )}
              {Object.entries(ordersByCommunity).map(([community, communityOrders]) => (
                <div key={community} className="bg-white p-5 rounded-lg shadow">
                  <h3 className="text-lg font-semibold mb-4">{community} ({communityOrders.length})</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">לקוח</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">תאריך משלוח</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">פריטים</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">סה"כ</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">פעולות</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {communityOrders.map((order) => {
                          const whatsappUrl = buildWhatsappLink(order.customerDetails?.phone);
                          return (
                          <tr
                            key={order.id}
                            className={`align-top ${duplicateOrderKeys.has(order.id) ? 'bg-amber-50 border-r-4 border-amber-400' : 'hover:bg-gray-50'}`}
                          >
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-900">{order.customerDetails?.name || 'לא צוין'}</div>
                              {duplicateOrderKeys.has(order.id) && (
                                <span className="inline-block mt-1 text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">הזמנה כפולה</span>
                              )}
                              <div className="text-xs text-gray-500">{order.customerDetails?.phone || 'אין טלפון'}</div>
                              <div className="text-xs text-gray-500">{order.customerDetails?.email || ''}</div>
                              <div className="text-xs text-gray-400">{order.id}</div>
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <div>{order.deliveryDateLabel}</div>
                              {order.deliveryDateIsFallback && (
                                <div className="text-xs text-yellow-700">נתוני עבר - לפי תאריך יצירה</div>
                              )}
                              <div className="text-xs text-gray-500">{order.source}</div>
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <ul className="list-disc list-inside space-y-1">
                                {order.orderBreakdown && Object.values(order.orderBreakdown).map((businessOrder, businessIndex) => (
                                  <React.Fragment key={`${order.id}-${businessIndex}`}>
                                    {(businessOrder.items || []).map((item, itemIndex) => (
                                      <li key={`${businessIndex}-${itemIndex}`}>
                                        <span className="font-medium">{item.quantity} x {item.productName || item.name}</span>
                                        {normalizeOption(item.selectedOption) && (
                                          <span className="text-gray-500"> ({normalizeOption(item.selectedOption)})</span>
                                        )}
                                        <span className="text-xs text-gray-500"> - {businessOrder.businessName}</span>
                                      </li>
                                    ))}
                                  </React.Fragment>
                                ))}
                              </ul>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap font-semibold">
                              ₪{Number(order.grandTotal || 0).toFixed(2)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="flex flex-col gap-2 items-start">
                                <button
                                  type="button"
                                  onClick={() => handleCopyCustomerOrder(order)}
                                  className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                                >
                                  העתק הזמנה
                                </button>
                                {whatsappUrl && (
                                  <a
                                    href={whatsappUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                                  >
                                    WhatsApp
                                  </a>
                                )}
                                {!order.deliveryDateIsFallback && (
                                  <CustomerOrderDeliveryTransferControl
                                    orderId={order.id}
                                    source={order.source}
                                    orderData={order}
                                    currentDeliveryDateKey={toLocalDateKey(order.deliveryDate)}
                                    deliveryDateIsFallback={order.deliveryDateIsFallback}
                                    availableDeliveryDates={availableDeliveryDates}
                                    adminUid={currentUser?.uid || null}
                                    onTransferred={handleDeliveryTransferred}
                                  />
                                )}
                              </div>
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </section>
          ) : (
            <section>
              <h2 className="text-2xl font-semibold mb-4">סיכום לפי עסקים ({Object.keys(businessSummary).length})</h2>
              <div className="mb-3 bg-white rounded-lg shadow p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <label>
                  <span className="block text-sm text-gray-600 mb-1">שם נמען (לא חובה)</span>
                  <input
                    type="text"
                    value={orderMessageName}
                    onChange={(event) => setOrderMessageName(event.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="למשל: מאיר"
                  />
                </label>
                <label>
                  <span className="block text-sm text-gray-600 mb-1">תאריך להזמנה</span>
                  <input
                    type="date"
                    value={orderMessageDate}
                    onChange={(event) => setOrderMessageDate(event.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </label>
                <p className="text-xs text-gray-500 self-end">
                  השדות האלו משמשים בכפתורי ההעתקה ליד כל ספק.
                </p>
              </div>

              <div className="overflow-x-auto bg-white rounded-lg shadow">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500">עסק</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500">מוצרים</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500">סה"כ הכנסה</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500">פעולות</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {Object.entries(businessSummary)
                      .sort(([, a], [, b]) => b.totalRevenue - a.totalRevenue)
                      .map(([businessId, business]) => (
                        <tr key={businessId} className="hover:bg-gray-50 align-top">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="font-medium text-gray-900">{business.businessName || 'עסק לא ידוע'}</div>
                            <div className="text-sm text-gray-500">{businessId}</div>
                          </td>
                          <td className="px-6 py-4">
                            <ul className="list-disc list-inside text-sm space-y-1">
                              {Object.values(business.products)
                                .sort((a, b) => b.totalRevenue - a.totalRevenue)
                                .map((product, index) => (
                                  <li key={`${product.productName}-${product.selectedOption}-${index}`}>
                                    <span className="font-medium">{product.productName}</span>
                                    {normalizeOption(product.selectedOption) && (
                                      <span className="text-gray-500"> ({normalizeOption(product.selectedOption)})</span>
                                    )}
                                    <span> - {getProductUnitCount(product)} יח' / {Number(product.quantity).toFixed(1)} ק"ג - ₪{product.totalRevenue.toFixed(2)}</span>
                                  </li>
                                ))}
                            </ul>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap font-semibold">
                            ₪{business.totalRevenue.toFixed(2)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <button onClick={() => handleCopyBusinessOrder(business, false)} className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                              העתק יח'
                            </button>
                            <button onClick={() => handleCopyBusinessOrder(business, true)} className="mr-2 px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700">
                              העתק ק"ג
                            </button>
                            <button onClick={() => openCustomModal(business)} className="mr-2 px-3 py-2 bg-orange-500 text-white rounded hover:bg-orange-600">
                              מותאם
                            </button>
                            <button onClick={() => openCostModal(businessId, business)} className="mr-2 px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700">
                              חשב עלות
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {customModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black bg-opacity-50" onClick={closeCustomModal}></div>
          <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:w-11/12 max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center px-5 py-4 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-800">הזמנה מותאמת - {customModalBusinessName}</h3>
              <button onClick={closeCustomModal} className="text-2xl text-gray-400 hover:text-gray-700 leading-none">x</button>
            </div>
            <div className="flex gap-2 px-5 py-3 bg-gray-50 border-b border-gray-100">
              <span className="text-sm text-gray-600 self-center ml-2">הכל:</span>
              <button onClick={() => setAllCustomMode('unit')} className="px-4 py-1.5 rounded-full text-sm font-medium bg-blue-100 text-blue-700 hover:bg-blue-200">
                יח'
              </button>
              <button onClick={() => setAllCustomMode('kg')} className="px-4 py-1.5 rounded-full text-sm font-medium bg-purple-100 text-purple-700 hover:bg-purple-200">
                ק"ג
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {customModalItems.map((item, index) => (
                <div key={item.key} className={`flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl border ${item.included ? 'bg-white border-gray-200 shadow-sm' : 'bg-gray-50 border-gray-100 opacity-50'}`}>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={item.included}
                      onChange={(event) => updateCustomItem(index, 'included', event.target.checked)}
                      className="w-5 h-5"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold text-gray-800 block truncate">{item.productName}</span>
                      {item.selectedOption && <span className="text-sm text-gray-500">{item.selectedOption}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pr-8 sm:pr-0">
                    {!item.isUnitBased ? (
                      <div className="inline-flex rounded-full overflow-hidden border border-gray-300">
                        <button onClick={() => updateCustomItem(index, 'mode', 'unit')} className={`px-3 py-1.5 text-sm ${item.mode === 'unit' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}>
                          יח'
                        </button>
                        <button onClick={() => updateCustomItem(index, 'mode', 'kg')} className={`px-3 py-1.5 text-sm ${item.mode === 'kg' ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}>
                          ק"ג
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 w-[88px] text-center">יח' קבוע</span>
                    )}
                    <input
                      type="number"
                      min="0"
                      step={item.mode === 'kg' && !item.isUnitBased ? '0.1' : '1'}
                      value={item.quantity}
                      onChange={(event) => updateCustomItem(index, 'quantity', event.target.value)}
                      disabled={!item.included}
                      className="w-20 px-2 py-1.5 border border-gray-300 rounded-lg text-center disabled:bg-gray-100"
                    />
                    <span className="text-sm text-gray-500 w-8">{item.mode === 'kg' && !item.isUnitBased ? 'ק"ג' : "יח'"}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-200 px-5 py-4 bg-gray-50 rounded-b-2xl flex justify-between items-center">
              <span className="text-sm text-gray-500">
                {customModalItems.filter((item) => item.included && (Number(item.quantity) || 0) > 0).length} מוצרים נבחרו
              </span>
              <button onClick={handleCopyCustomOrder} className="px-6 py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600">
                העתק הזמנה
              </button>
            </div>
          </div>
        </div>
      )}

      {costModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black bg-opacity-40" onClick={closeCostModal}></div>
          <div className="relative bg-white rounded-lg shadow-xl w-11/12 max-w-3xl p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg font-semibold">חישוב עלות - {costModalBusinessName}</h3>
              <button onClick={closeCostModal} className="text-gray-600 hover:text-gray-900">x</button>
            </div>
            <div className="max-h-[60vh] overflow-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">מוצר</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">אופציה</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">כמות</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">מחיר ליח'</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">סה"כ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {costModalItems.map((item, index) => {
                    const qty = Number(item.quantity) || 0;
                    const price = Number(item.price) || 0;
                    const lineTotal = qty > 0 && price > 0 ? qty * price : 0;
                    return (
                      <tr key={item.key} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-sm">{item.productName}</td>
                        <td className="px-3 py-2 text-sm">{item.selectedOption || '-'}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            value={item.quantity}
                            onChange={(event) => updateCostModalItem(index, 'quantity', event.target.value)}
                            className="w-24 px-2 py-1 border border-gray-300 rounded"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.price}
                            onChange={(event) => updateCostModalItem(index, 'price', event.target.value)}
                            className="w-24 px-2 py-1 border border-gray-300 rounded"
                          />
                        </td>
                        <td className="px-3 py-2 text-sm">₪{lineTotal.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={closeCostModal} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">בטל</button>
              <button onClick={saveCostsAndCopy} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">שמור והעתק</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WeeklyDeliveryOrderSummaryWorkspace;
