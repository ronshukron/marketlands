// src/components/admin/WeeklyOrderFromSuppliersV1.js
import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import LoadingSpinner from '../LoadingSpinner';
import { format } from 'date-fns';
import { pickupSpots } from '../../data/pickupSpots';
import { getEstimatedLineTotal } from '../../utils/pricing';
import { getOrderCommunity, getOrderDeliveryDate, getWeekKey } from '../../utils/deliveryScheduleUtils';

const WeeklyOrderFromSuppliersV1 = () => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [businessSummary, setBusinessSummary] = useState({});
  const [orderCount, setOrderCount] = useState(0);
  const [totalIncome, setTotalIncome] = useState(0);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  
  // Week selection
  const [availableWeeks, setAvailableWeeks] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState('');
  
  // Community selection
  const [selectedCommunities, setSelectedCommunities] = useState(new Set());
  const [showCommunityDropdown, setShowCommunityDropdown] = useState(false);
  
  // Temporary filter states (before submit)
  const [tempSelectedWeek, setTempSelectedWeek] = useState('');
  const [tempSelectedCommunities, setTempSelectedCommunities] = useState(new Set());
  
  const communityDropdownRef = useRef(null);

  // Message settings for per-business copy
  const [orderMessageName, setOrderMessageName] = useState('');
  const [orderMessageDate, setOrderMessageDate] = useState('');

  // Cost calculator modal state
  const [costModalOpen, setCostModalOpen] = useState(false);
  const [costModalBusinessId, setCostModalBusinessId] = useState('');
  const [costModalBusinessName, setCostModalBusinessName] = useState('');
  const [costModalItems, setCostModalItems] = useState([]);
  
  // Custom order copy modal state
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [customModalBusinessName, setCustomModalBusinessName] = useState('');
  const [customModalItems, setCustomModalItems] = useState([]);
  
  // Admin UIDs
  const ADMIN_UIDS = ['rfHOLhNoJOW8ByNypCtm3hlSNKs2'];
  
  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (communityDropdownRef.current && !communityDropdownRef.current.contains(e.target)) {
        setShowCommunityDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  
  useEffect(() => {
    if (!currentUser || !ADMIN_UIDS.includes(currentUser.uid)) {
      setError("You are not authorized to view this page");
      setLoading(false);
      return;
    }
    fetchAvailableWeeks();
  }, [currentUser]);
  
  // Default the message date to tomorrow on first load
  useEffect(() => {
    if (!orderMessageDate) {
      const t = new Date();
      t.setDate(t.getDate() + 1);
      setOrderMessageDate(t.toISOString().split('T')[0]);
    }
  }, [orderMessageDate]);
  
  useEffect(() => {
    if (selectedWeek) {
      fetchWeeklyOrders();
    }
  }, [selectedWeek, selectedCommunities]);
  
  const fetchAvailableWeeks = async () => {
    setLoading(true);
    try {
      const ordersRef = collection(db, 'Orders');
      const delayedOrdersRef = collection(db, 'customerOrdersDelayed');
      const [ordersSnapshot, delayedSnapshot] = await Promise.all([
        getDocs(ordersRef),
        getDocs(delayedOrdersRef)
      ]);
      
      const weeksSet = new Set();
      
      ordersSnapshot.docs.forEach(doc => {
        const orderData = doc.data();
        const endingTime = orderData.Ending_Time || orderData.endingTime;
        if (endingTime) {
          let endDate;
          if (endingTime.toDate) {
            endDate = endingTime.toDate();
          } else {
            endDate = new Date(endingTime);
          }
          const sunday = new Date(endDate);
          sunday.setDate(endDate.getDate() - endDate.getDay());
          sunday.setHours(0, 0, 0, 0);
          weeksSet.add(sunday.toISOString().split('T')[0]);
        }
      });
      
      delayedSnapshot.docs.forEach(doc => {
        const orderData = doc.data();
        const weekKey = getWeekKey(getOrderDeliveryDate(orderData));
        if (weekKey) weeksSet.add(weekKey);
      });
      
      const sortedWeeks = Array.from(weeksSet).sort((a, b) => new Date(b) - new Date(a));
      setAvailableWeeks(sortedWeeks);
      
      if (sortedWeeks.length > 0) {
        setTempSelectedWeek(sortedWeeks[0]);
      }
    } catch (err) {
      console.error("Error fetching available weeks:", err);
      setError("Failed to load weeks data");
    } finally {
      setLoading(false);
    }
  };
  
  const fetchWeeklyOrders = async () => {
    setLoading(true);
    try {
      const sunday = new Date(selectedWeek);
      const friday = new Date(sunday);
      friday.setDate(sunday.getDate() + 5);
      friday.setHours(23, 59, 59, 999);
      
      setDateRange({
        start: format(sunday, 'dd/MM/yyyy'),
        end: format(friday, 'dd/MM/yyyy')
      });

      const t = new Date();
      t.setDate(t.getDate() + 1);
      setOrderMessageDate(t.toISOString().split('T')[0]);
      
      const ordersRef = collection(db, 'customerOrders');
      const delayedOrdersRef = collection(db, 'customerOrdersDelayed');
      const [ordersSnapshot, delayedSnapshot] = await Promise.all([
        getDocs(ordersRef),
        getDocs(delayedOrdersRef)
      ]);
      
      const businessProductMap = {};
      let matchedOrderCount = 0;
      let matchedTotalIncome = 0;
      
      const allDocs = [
        ...ordersSnapshot.docs.map(doc => ({ doc, source: 'customerOrders' })),
        ...delayedSnapshot.docs.map(doc => ({ doc, source: 'customerOrdersDelayed' }))
      ];
      
      allDocs.forEach(({ doc, source }) => {
        const orderData = doc.data();
        const isDelayed = source === 'customerOrdersDelayed';
        
        if (!isDelayed && orderData.paymentStatus !== 'completed') return;
        if (isDelayed) {
          // Exclude abandoned and already-completed delayed orders
          const dStatus = orderData.delayedOrderStatus || '';
          const pStatus = orderData.paymentStatus || '';
          if (dStatus === 'abandoned') return;
          const isCompleted = dStatus === 'settled' || dStatus === 'completed' || dStatus === 'charged'
            || pStatus === 'charged' || pStatus === 'completed' || pStatus === 'settled';
          if (isCompleted) return;
        }
        
        const deliveryDate = getOrderDeliveryDate(orderData);
        if (!deliveryDate) return;
        if (deliveryDate < sunday || deliveryDate > friday) return;
        
        const pickupSpot = getOrderCommunity(orderData);
        if (selectedCommunities.size > 0 && !selectedCommunities.has(pickupSpot)) return;
        
        matchedOrderCount++;
        matchedTotalIncome += orderData.grandTotal || 0;
        
        // Build business / product summary only
        if (orderData.orderBreakdown) {
          Object.values(orderData.orderBreakdown).forEach(businessOrder => {
            const businessId = businessOrder.businessId;
            const businessName = businessOrder.businessName;
            
            if (!businessProductMap[businessId]) {
              businessProductMap[businessId] = {
                businessName,
                products: {},
                totalRevenue: 0
              };
            }
            
            businessOrder.items.forEach(item => {
              if (item.isShipping === true || item.isBasketAdjustment === true) return;
              const productId = item.productId;
              const productName = item.productName;
              const quantity = item.quantity;
              const price = item.price;
              const totalPrice = item.estimatedLineTotal != null
                ? Number(item.estimatedLineTotal)
                : getEstimatedLineTotal(item);
              const selectedOption = item.selectedOption;
              const unitSize = item.unitSize || 1;
              const measurementType = item.measurementType || 'kg';
              
              const productKey = `${productId}_${selectedOption}`;
              
              if (!businessProductMap[businessId].products[productKey]) {
                businessProductMap[businessId].products[productKey] = {
                  productName,
                  selectedOption,
                  quantity: 0,
                  totalRevenue: 0,
                  unitSize,
                  measurementType
                };
              }
              
              businessProductMap[businessId].products[productKey].quantity += quantity;
              businessProductMap[businessId].products[productKey].totalRevenue += totalPrice;
              businessProductMap[businessId].totalRevenue += totalPrice;
            });
          });
        }
      });
      
      setBusinessSummary(businessProductMap);
      setOrderCount(matchedOrderCount);
      setTotalIncome(matchedTotalIncome);
    } catch (err) {
      console.error("Error fetching weekly orders:", err);
      setError("Failed to load order data");
    } finally {
      setLoading(false);
    }
  };
  
  const normalizeOption = (opt) => {
    if (!opt) return '';
    const trimmed = String(opt).trim();
    if (trimmed === 'ללא אופציות' || trimmed === 'None') return '';
    return trimmed;
  };

  const buildBusinessOrderMessage = (business, useKgFormat = false) => {
    if (!business) return '';
    const dateForHeader = orderMessageDate
      ? format(new Date(orderMessageDate), 'dd.MM.yy')
      : (dateRange?.end ? String(dateRange.end).replace(/\//g, '.').slice(0, 8) : '');
    const greetingName = orderMessageName ? `${orderMessageName} ` : '';
    const header = `${greetingName}צהריים טובים, הזמנה ל${dateForHeader}:`;

    const items = Object.values(business.products)
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .map((product) => {
        const opt = normalizeOption(product.selectedOption);
        const isKgInKgFormat = (product.measurementType === 'kg' || !product.measurementType) && useKgFormat;
        const optPart = (opt && !isKgInKgFormat) ? ` *${opt}*` : '';
        const isUnitBased = product.measurementType === 'package' || product.measurementType === 'unit';
        
        if (isUnitBased) {
          return `* ${product.productName}${optPart} – ${Math.round(product.quantity)} יח'`;
        } else if (useKgFormat) {
          return `* ${product.productName} – ${Number(product.quantity).toFixed(1)} ק"ג`;
        } else {
          const unitSize = product.unitSize || 1;
          const unitCount = Math.round(product.quantity / unitSize);
          return `* ${product.productName}${optPart} – ${unitCount} יח'`;
        }
      });

    return [header, '', ...items].join('\n');
  };

  const handleCopyBusinessOrder = async (business, useKgFormat = false) => {
    try {
      const text = buildBusinessOrderMessage(business, useKgFormat);
      if (!text) return;
      if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      alert(useKgFormat ? 'ההזמנה הועתקה (בק"ג)' : 'ההזמנה הועתקה (ביחידות)');
    } catch (e) {
      console.error('Failed to copy order text', e);
      alert('שגיאה בהעתקת ההזמנה');
    }
  };

  // --- Custom order copy modal ---
  const openCustomModal = (business) => {
    if (!business) return;
    setCustomModalBusinessName(business.businessName || '');
    const items = Object.entries(business.products || {})
      .sort(([, a], [, b]) => b.totalRevenue - a.totalRevenue)
      .map(([key, p]) => {
        const isUnitBased = p.measurementType === 'package' || p.measurementType === 'unit';
        const unitSize = p.unitSize || 1;
        const defaultQty = isUnitBased
          ? Math.round(p.quantity)
          : Math.round(p.quantity / unitSize);
        return {
          key,
          productName: p.productName,
          selectedOption: normalizeOption(p.selectedOption),
          rawQuantity: p.quantity,
          unitSize,
          measurementType: p.measurementType || 'kg',
          mode: 'unit',
          isUnitBased,
          quantity: defaultQty,
          included: true,
        };
      });
    setCustomModalItems(items);
    setCustomModalOpen(true);
  };

  const closeCustomModal = () => {
    setCustomModalOpen(false);
    setCustomModalBusinessName('');
    setCustomModalItems([]);
  };

  const updateCustomItem = (idx, field, value) => {
    setCustomModalItems(prev => {
      const next = [...prev];
      const item = { ...next[idx] };
      if (field === 'mode') {
        item.mode = value;
        if (value === 'kg') {
          item.quantity = Number(item.rawQuantity.toFixed(1));
        } else {
          const unitSize = item.unitSize || 1;
          item.quantity = Math.round(item.rawQuantity / unitSize);
        }
      } else if (field === 'quantity') {
        item.quantity = value === '' ? '' : Number(value);
      } else if (field === 'included') {
        item.included = value;
      }
      next[idx] = item;
      return next;
    });
  };

  const buildCustomOrderText = () => {
    const dateForHeader = orderMessageDate
      ? format(new Date(orderMessageDate), 'dd.MM.yy')
      : (dateRange?.end ? String(dateRange.end).replace(/\//g, '.').slice(0, 8) : '');
    const greetingName = orderMessageName ? `${orderMessageName} ` : '';
    const header = `${greetingName}צהריים טובים, הזמנה ל${dateForHeader}:`;

    const included = customModalItems.filter(it => it.included && (Number(it.quantity) || 0) > 0);

    const formatLine = (it) => {
      const opt = normalizeOption(it.selectedOption);
      const isKgMode = it.mode === 'kg' && !it.isUnitBased;
      const showOpt = isKgMode ? false : !!opt;
      const optPart = showOpt ? ` *${opt}*` : '';
      const qty = Number(it.quantity) || 0;
      const suffix = isKgMode ? 'ק"ג' : "יח'";
      const qtyDisplay = isKgMode ? qty.toFixed(1) : String(Math.round(qty));
      return `* ${it.productName}${optPart} – ${qtyDisplay} ${suffix}`;
    };

    const kgItems = included.filter(it => it.mode === 'kg' && !it.isUnitBased);
    const unitItems = included.filter(it => it.mode !== 'kg' || it.isUnitBased);

    const parts = [header, ''];

    if (kgItems.length > 0) {
      parts.push('הזמנה סיטונאית לא ארוז:');
      parts.push(...kgItems.map(formatLine));
    }
    if (kgItems.length > 0 && unitItems.length > 0) {
      parts.push('');
    }
    if (unitItems.length > 0) {
      parts.push('הזמנה ארוז:');
      parts.push(...unitItems.map(formatLine));
    }

    return parts.join('\n');
  };

  const handleCopyCustomOrder = async () => {
    try {
      const text = buildCustomOrderText();
      if (!text) return;
      if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      alert('ההזמנה המותאמת הועתקה!');
      closeCustomModal();
    } catch (e) {
      console.error('Failed to copy custom order text', e);
      alert('שגיאה בהעתקה');
    }
  };

  const setAllCustomMode = (mode) => {
    setCustomModalItems(prev => prev.map(item => {
      if (item.isUnitBased) return item;
      const updated = { ...item, mode };
      if (mode === 'kg') {
        updated.quantity = Number(item.rawQuantity.toFixed(1));
      } else {
        const unitSize = item.unitSize || 1;
        updated.quantity = Math.round(item.rawQuantity / unitSize);
      }
      return updated;
    }));
  };

  // Cost calculator logic
  const getSafeDocId = (businessId, businessName) => {
    const sanitize = (s) => String(s || '')
      .replace(/[\/\\#?[\]]+/g, '-')
      .trim()
      .slice(0, 120) || 'unknown';
    if (businessId && !/[\/\\#?[\]]/.test(String(businessId))) return String(businessId);
    return sanitize(businessName);
  };

  const openCostModal = async (businessId, business) => {
    try {
      const safeId = getSafeDocId(businessId, business?.businessName || '');
      setCostModalBusinessId(safeId);
      setCostModalBusinessName(business?.businessName || '');
      const baseItems = Object.entries(business.products || {}).map(([key, p]) => ({
        key,
        productName: p.productName,
        selectedOption: normalizeOption(p.selectedOption),
        quantity: Number(p.quantity) || 0,
        price: ''
      }));
      try {
        const ref = doc(db, 'farmerCosts', safeId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data() || {};
          const savedItems = data.items || {};
          baseItems.forEach(it => {
            const saved = savedItems[it.key];
            if (saved) {
              if (saved.price !== undefined && saved.price !== null) it.price = String(saved.price);
              if (saved.quantity !== undefined && saved.quantity !== null) it.quantity = Number(saved.quantity);
            }
          });
        }
      } catch (inner) {
        console.warn('Unable to fetch saved costs, continuing without them', inner);
      }
      setCostModalItems(baseItems);
      setCostModalOpen(true);
    } catch (e) {
      console.error('Failed to open cost modal', e);
      alert('שגיאה בטעינת נתוני העלות לעסק');
    }
  };

  const closeCostModal = () => {
    setCostModalOpen(false);
    setCostModalBusinessId('');
    setCostModalBusinessName('');
    setCostModalItems([]);
  };

  const updateCostModalItem = (idx, field, value) => {
    setCostModalItems(prev => {
      const next = [...prev];
      const item = { ...next[idx] };
      if (field === 'price') {
        item.price = value;
      } else if (field === 'quantity') {
        item.quantity = value === '' ? '' : Number(value);
      }
      next[idx] = item;
      return next;
    });
  };

  const computeCostTotals = (items) => {
    let total = 0;
    const lines = [];
    items.forEach(it => {
      const qty = Number(it.quantity) || 0;
      const price = Number(it.price) || 0;
      if (qty > 0 && price > 0) {
        const lineTotal = qty * price;
        total += lineTotal;
        lines.push(`${it.productName}${it.selectedOption ? ` ${it.selectedOption}` : ''} – ${qty}×${price} = ${lineTotal} ₪`);
      }
    });
    return { total, lines };
  };

  const saveCostsAndCopy = async () => {
    try {
      const itemsPayload = {};
      costModalItems.forEach(it => {
        itemsPayload[it.key] = {
          productName: it.productName,
          selectedOption: it.selectedOption || '',
          quantity: Number(it.quantity) || 0,
          price: Number(it.price) || 0,
          updatedAt: new Date().toISOString()
        };
      });

      const safeId = getSafeDocId(costModalBusinessId, costModalBusinessName);
      const ref = doc(db, 'farmerCosts', safeId);
      let shouldWrite = true;
      const existing = await getDoc(ref);
      if (existing.exists()) {
        const prev = existing.data() || {};
        const prevItems = prev.items || {};
        if (JSON.stringify(prevItems) === JSON.stringify(itemsPayload)) {
          shouldWrite = false;
        }
      }
      if (shouldWrite) {
        await setDoc(ref, { businessName: costModalBusinessName, items: itemsPayload }, { merge: true });
      }

      const { total, lines } = computeCostTotals(costModalItems);
      const header = 'עלות מחושבת:';
      const footer = `סה״כ לתשלום: ${total}`;
      const copyText = [header, '', ...lines, '', footer].join('\n');

      if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(copyText);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = copyText;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      alert('העלות נשמרה והועתקה ללוח העריכה');
      closeCostModal();
    } catch (e) {
      console.error('Failed to save/copy costs', e);
      alert('שגיאה בשמירת/העתקת העלויות');
    }
  };

  const toggleCommunity = (community) => {
    setTempSelectedCommunities(prev => {
      const newSet = new Set(prev);
      if (newSet.has(community)) {
        newSet.delete(community);
      } else {
        newSet.add(community);
      }
      return newSet;
    });
  };
  
  const selectAllCommunities = () => {
    setTempSelectedCommunities(new Set(pickupSpots));
  };
  
  const clearAllCommunities = () => {
    setTempSelectedCommunities(new Set());
  };
  
  const handleSubmitFilters = () => {
    setSelectedWeek(tempSelectedWeek);
    setSelectedCommunities(tempSelectedCommunities);
  };
  
  if (loading) {
    return <LoadingSpinner />;
  }
  
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <p className="font-bold">Error</p>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  const hasData = Object.keys(businessSummary).length > 0;
  
  return (
    <div className="container mx-auto px-4 py-8" dir="rtl">
      <h1 className="text-3xl font-bold text-center mb-8">הזמנות מספקים</h1>
      
      {/* Week and Community Selection */}
      <div className="mb-6 bg-white p-6 rounded-lg shadow">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Week Selection */}
          <div>
            <label className="block text-gray-700 text-sm font-medium mb-2">בחר שבוע:</label>
            <select
              value={tempSelectedWeek}
              onChange={(e) => setTempSelectedWeek(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {availableWeeks.map(week => {
                const sunday = new Date(week);
                const friday = new Date(sunday);
                friday.setDate(sunday.getDate() + 5);
                return (
                  <option key={week} value={week}>
                    {format(sunday, 'dd/MM/yyyy')} - {format(friday, 'dd/MM/yyyy')}
                  </option>
                );
              })}
            </select>
          </div>
          
          {/* Community Selection */}
          <div ref={communityDropdownRef}>
            <label className="block text-gray-700 text-sm font-medium mb-2">בחר קהילות:</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowCommunityDropdown(o => !o)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-right focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {tempSelectedCommunities.size === 0 ? 'כל הקהילות' : `${tempSelectedCommunities.size} קהילות נבחרו`}
              </button>
              {showCommunityDropdown && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg p-2 max-h-80 overflow-auto">
                  <div className="flex gap-2 mb-2 pb-2 border-b">
                    <button onClick={selectAllCommunities} className="text-xs px-2 py-1 bg-blue-500 text-white rounded">בחר הכל</button>
                    <button onClick={clearAllCommunities} className="text-xs px-2 py-1 bg-gray-300 text-gray-700 rounded">נקה הכל</button>
                  </div>
                  {pickupSpots.map(spot => (
                    <div key={spot} className="flex items-center px-2 py-1 hover:bg-gray-50 rounded">
                      <input
                        type="checkbox"
                        id={`supplier-community-${spot}`}
                        checked={tempSelectedCommunities.has(spot)}
                        onChange={() => toggleCommunity(spot)}
                        className="ml-2"
                      />
                      <label htmlFor={`supplier-community-${spot}`} className="text-sm cursor-pointer flex-1">{spot}</label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Submit Button */}
        <div className="mt-6 text-center">
          <button
            onClick={handleSubmitFilters}
            className="px-8 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold rounded-lg transition-all transform hover:scale-105 shadow-lg"
          >
            טען נתונים
          </button>
        </div>
        
        {selectedWeek && (
          <p className="text-center text-gray-600 mt-4">
            מציג הזמנות מ-{dateRange.start} עד {dateRange.end}
            {selectedCommunities.size > 0 && ` עבור ${selectedCommunities.size} קהילות`}
          </p>
        )}
      </div>
      
      {!hasData ? (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 p-4 rounded text-center">
          לא נמצאו הזמנות עבור השבוע והקהילות שנבחרו
        </div>
      ) : (
        <div>
          {/* Summary Statistics */}
          <div className="mb-8 bg-blue-50 p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4 text-blue-800">סיכום כללי</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-4 rounded shadow">
                <p className="text-gray-500 text-sm">סה"כ הזמנות</p>
                <p className="text-2xl font-bold">{orderCount}</p>
              </div>
              <div className="bg-white p-4 rounded shadow">
                <p className="text-gray-500 text-sm">סה"כ הכנסות</p>
                <p className="text-2xl font-bold">₪{totalIncome.toFixed(2)}</p>
              </div>
              <div className="bg-white p-4 rounded shadow">
                <p className="text-gray-500 text-sm">מספר ספקים</p>
                <p className="text-2xl font-bold">{Object.keys(businessSummary).length}</p>
              </div>
            </div>
          </div>

          <h2 className="text-2xl font-semibold mb-4">סיכום לפי ספקים ({Object.keys(businessSummary).length})</h2>
          {/* Message settings */}
          <div className="mb-3 bg-white rounded-lg shadow p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">שם נמען (לא חובה)</label>
              <input
                type="text"
                value={orderMessageName}
                onChange={(e) => setOrderMessageName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="למשל: מאיר"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">תאריך להזמנה</label>
              <input
                type="date"
                value={orderMessageDate}
                onChange={(e) => setOrderMessageDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-end">
              <p className="text-xs text-gray-500">
                תבנית תיושם בעת לחיצה על "העתק הזמנה" ליד כל ספק
              </p>
            </div>
          </div>

          {/* Supplier summary table */}
          <div className="overflow-x-auto bg-white rounded-lg shadow">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">ספק</th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">מוצרים</th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">סה"כ הכנסה</th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">פעולות</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {Object.entries(businessSummary)
                  .sort(([, a], [, b]) => b.totalRevenue - a.totalRevenue)
                  .map(([businessId, business]) => (
                    <tr key={businessId} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {business.businessName || 'ספק לא ידוע'}
                        </div>
                        <div className="text-sm text-gray-500">{businessId}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">
                          <ul className="list-disc list-inside">
                            {Object.values(business.products)
                              .sort((a, b) => b.totalRevenue - a.totalRevenue)
                              .map((product, idx) => {
                                const isUnitBased = product.measurementType === 'package' || product.measurementType === 'unit';
                                const unitSize = product.unitSize || 1;
                                const unitCount = isUnitBased
                                  ? Math.round(product.quantity)
                                  : Math.round(product.quantity / unitSize);
                                return (
                                  <li key={idx} className="mb-1">
                                    <span className="font-medium">{product.productName}</span>
                                    {product.selectedOption && product.selectedOption !== "ללא אופציות" && product.selectedOption !== "None" && (
                                      <span className="text-gray-500"> ({product.selectedOption})</span>
                                    )}
                                    <span> - {unitCount} יח' - ₪{product.totalRevenue.toFixed(2)}</span>
                                  </li>
                                );
                              })}
                          </ul>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        ₪{business.totalRevenue.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={() => handleCopyBusinessOrder(business, false)}
                          className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                          title="העתק הזמנה (ביחידות)"
                        >
                          העתק יח'
                        </button>
                        <button
                          onClick={() => handleCopyBusinessOrder(business, true)}
                          className="mr-2 px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
                          title="העתק הזמנה (בק״ג)"
                        >
                          העתק ק"ג
                        </button>
                        <button
                          onClick={() => openCustomModal(business)}
                          className="mr-2 px-3 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 transition-colors"
                          title="בחר פורמט לכל מוצר"
                        >
                          מותאם
                        </button>
                        <button
                          onClick={() => openCostModal(businessId, business)}
                          className="mr-2 px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                          title="חשב עלות ושמור מחירים"
                        >
                          חשב עלות
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          
          {/* Custom Order Copy Modal */}
          {customModalOpen && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
              <div className="absolute inset-0 bg-black bg-opacity-50" onClick={closeCustomModal}></div>
              <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:w-11/12 max-w-2xl max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center px-5 py-4 border-b border-gray-200">
                  <h3 className="text-xl font-bold text-gray-800">הזמנה מותאמת – {customModalBusinessName}</h3>
                  <button onClick={closeCustomModal} className="text-2xl text-gray-400 hover:text-gray-700 leading-none">✕</button>
                </div>

                <div className="flex gap-2 px-5 py-3 bg-gray-50 border-b border-gray-100">
                  <span className="text-sm text-gray-600 self-center ml-2">הכל:</span>
                  <button
                    onClick={() => setAllCustomMode('unit')}
                    className="px-4 py-1.5 rounded-full text-sm font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                  >
                    יח'
                  </button>
                  <button
                    onClick={() => setAllCustomMode('kg')}
                    className="px-4 py-1.5 rounded-full text-sm font-medium bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors"
                  >
                    ק"ג
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                  {customModalItems.map((it, idx) => (
                    <div
                      key={it.key}
                      className={`flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl border transition-all ${
                        it.included 
                          ? 'bg-white border-gray-200 shadow-sm' 
                          : 'bg-gray-50 border-gray-100 opacity-50'
                      }`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={it.included}
                          onChange={(e) => updateCustomItem(idx, 'included', e.target.checked)}
                          className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <span className="font-semibold text-gray-800 text-base block truncate">{it.productName}</span>
                          {it.selectedOption && (
                            <span className="text-sm text-gray-500">{it.selectedOption}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pr-8 sm:pr-0">
                        {!it.isUnitBased ? (
                          <div className="inline-flex rounded-full overflow-hidden border border-gray-300">
                            <button
                              onClick={() => updateCustomItem(idx, 'mode', 'unit')}
                              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                                it.mode === 'unit' 
                                  ? 'bg-blue-600 text-white' 
                                  : 'bg-white text-gray-600 hover:bg-gray-100'
                              }`}
                            >
                              יח'
                            </button>
                            <button
                              onClick={() => updateCustomItem(idx, 'mode', 'kg')}
                              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                                it.mode === 'kg' 
                                  ? 'bg-purple-600 text-white' 
                                  : 'bg-white text-gray-600 hover:bg-gray-100'
                              }`}
                            >
                              ק"ג
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 w-[88px] text-center">יח' (קבוע)</span>
                        )}

                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            step={it.mode === 'kg' && !it.isUnitBased ? '0.1' : '1'}
                            value={it.quantity}
                            onChange={(e) => updateCustomItem(idx, 'quantity', e.target.value)}
                            disabled={!it.included}
                            className="w-20 px-2 py-1.5 border border-gray-300 rounded-lg text-center text-base font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                          />
                          <span className="text-sm text-gray-500 w-8">
                            {it.mode === 'kg' && !it.isUnitBased ? 'ק"ג' : "יח'"}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-gray-200 px-5 py-4 bg-gray-50 rounded-b-2xl">
                  <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                    <span className="text-sm text-gray-500">
                      {customModalItems.filter(it => it.included && (Number(it.quantity) || 0) > 0).length} מוצרים נבחרו
                    </span>
                    <button
                      onClick={handleCopyCustomOrder}
                      className="w-full sm:w-auto px-6 py-3 bg-orange-500 text-white font-bold rounded-xl text-lg hover:bg-orange-600 active:bg-orange-700 transition-colors shadow-md"
                    >
                      העתק הזמנה
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Cost Calculator Modal */}
          {costModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black bg-opacity-40" onClick={closeCostModal}></div>
              <div className="relative bg-white rounded-lg shadow-xl w-11/12 max-w-3xl p-4">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-lg font-semibold">חישוב עלות – {costModalBusinessName}</h3>
                  <button onClick={closeCostModal} className="text-gray-600 hover:text-gray-900">✕</button>
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
                      {costModalItems.map((it, idx) => {
                        const qty = Number(it.quantity) || 0;
                        const price = Number(it.price) || 0;
                        const lineTotal = qty > 0 && price > 0 ? qty * price : 0;
                        return (
                          <tr key={it.key} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-sm">{it.productName}</td>
                            <td className="px-3 py-2 text-sm">{it.selectedOption || '-'}</td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min="0"
                                value={it.quantity}
                                onChange={(e) => updateCostModalItem(idx, 'quantity', e.target.value)}
                                className="w-24 px-2 py-1 border border-gray-300 rounded"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={it.price}
                                onChange={(e) => updateCostModalItem(idx, 'price', e.target.value)}
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
      )}
    </div>
  );
};

export default WeeklyOrderFromSuppliersV1;
