// src/components/admin/WeeklyOrderSummaryV2.js
import React, { useState, useEffect, useRef } from 'react';
import { collection, query, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import LoadingSpinner from '../LoadingSpinner';
import { format } from 'date-fns';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { pickupSpots } from '../../data/pickupSpots';

// Helper to identify the "basic products" vendor
const BASIC_VENDOR_NAME_SUBSTRINGS = ['basic', 'basic products', 'מוצרים בסיסיים', 'בסיס',"הבסקט של בסטה"];
const BASIC_VENDOR_IDS = [];
const BASIC_CRATE_LABEL = 'ארגז עם שמי';
const isBasicVendor = (businessOrder) => {
  const name = businessOrder?.businessName;
  const id = businessOrder?.businessId;
  if (id && BASIC_VENDOR_IDS.includes(id)) return true;
  if (!name) return false;
  const lower = String(name).toLowerCase();
  return BASIC_VENDOR_NAME_SUBSTRINGS.some(sub => lower.includes(sub.toLowerCase()));
};

const WeeklyOrderSummaryV2 = () => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [customerOrders, setCustomerOrders] = useState([]);
  const [businessSummary, setBusinessSummary] = useState({});
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [ordersByPickupSpot, setOrdersByPickupSpot] = useState({});
  
  // New state for week selection
  const [availableWeeks, setAvailableWeeks] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState('');
  
  // New state for community selection
  const [selectedCommunities, setSelectedCommunities] = useState(new Set());
  const [showCommunityDropdown, setShowCommunityDropdown] = useState(false);
  
  // Temporary filter states (before submit)
  const [tempSelectedWeek, setTempSelectedWeek] = useState('');
  const [tempSelectedCommunities, setTempSelectedCommunities] = useState(new Set());
  
  // Refs for PDF generation
  const pdfRefs = useRef({});
  const communityDropdownRef = useRef(null);
  // Message settings for per-business copy
  const [orderMessageName, setOrderMessageName] = useState('');
  const [orderMessageDate, setOrderMessageDate] = useState('');
  // Cost calculator modal state
  const [costModalOpen, setCostModalOpen] = useState(false);
  const [costModalBusinessId, setCostModalBusinessId] = useState('');
  const [costModalBusinessName, setCostModalBusinessName] = useState('');
  const [costModalItems, setCostModalItems] = useState([]); // [{key, productName, selectedOption, quantity, price}]
  
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
      // Fetch all orders and group by week
      const ordersRef = collection(db, 'Orders');
      const ordersSnapshot = await getDocs(ordersRef);
      
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
          
          // Get the Sunday of that week
          const sunday = new Date(endDate);
          sunday.setDate(endDate.getDate() - endDate.getDay());
          sunday.setHours(0, 0, 0, 0);
          
          const weekKey = sunday.toISOString().split('T')[0];
          weeksSet.add(weekKey);
        }
      });
      
      // Sort weeks (newest first)
      const sortedWeeks = Array.from(weeksSet).sort((a, b) => new Date(b) - new Date(a));
      setAvailableWeeks(sortedWeeks);
      
      // Auto-select most recent week for temp state
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
      // Parse selected week to get date range (Sunday to Friday)
      const sunday = new Date(selectedWeek);
      const friday = new Date(sunday);
      friday.setDate(sunday.getDate() + 5); // Sunday + 5 = Friday
      friday.setHours(23, 59, 59, 999);
      
      setDateRange({
        start: format(sunday, 'dd/MM/yyyy'),
        end: format(friday, 'dd/MM/yyyy')
      });
      // Default the order message date to tomorrow (input format yyyy-MM-dd)
      const t = new Date();
      t.setDate(t.getDate() + 1);
      setOrderMessageDate(t.toISOString().split('T')[0]);
      
      const startDateISO = sunday.toISOString();
      const endDateISO = friday.toISOString();
      
      // Query for completed orders from the selected week
      const ordersRef = collection(db, 'customerOrders');
      const ordersSnapshot = await getDocs(ordersRef);
      
      const filteredOrders = [];
      const businessProductMap = {};
      const pickupSpotMap = {};
      
      // Process each order
      ordersSnapshot.docs.forEach(doc => {
        const orderData = doc.data();
        
        // Check if order is completed
        if (orderData.paymentStatus !== 'completed') return;
        
        // Parse the createdAt date
        const createdAt = orderData.createdAt;
        let createdDate;
        if (typeof createdAt === 'string') {
          createdDate = new Date(createdAt);
        } else if (createdAt && createdAt.toDate) {
          createdDate = createdAt.toDate();
        } else {
          return;
        }
        
        // Check if within date range
        const createdDateISO = createdDate.toISOString();
        if (createdDateISO < startDateISO || createdDateISO > endDateISO) return;
        
        // Filter by selected communities
        const pickupSpot = orderData.customerDetails?.pickupSpot || 'לא צוין';
        if (selectedCommunities.size > 0 && !selectedCommunities.has(pickupSpot)) return;
        
        // Add to filtered orders
        const orderWithDate = {
          id: doc.id,
          ...orderData,
          createdDate
        };
        
        filteredOrders.push(orderWithDate);
        
        // Group by pickup spot
        if (!pickupSpotMap[pickupSpot]) {
          pickupSpotMap[pickupSpot] = [];
        }
        pickupSpotMap[pickupSpot].push(orderWithDate);
        
        // Process business summary
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
            
            // Process each item
            businessOrder.items.forEach(item => {
              const productId = item.productId;
              const productName = item.productName;
              const quantity = item.quantity;
              const price = item.price;
              const totalPrice = price * quantity;
              const selectedOption = item.selectedOption;
              
              const productKey = `${productId}_${selectedOption}`;
              
              if (!businessProductMap[businessId].products[productKey]) {
                businessProductMap[businessId].products[productKey] = {
                  productName,
                  selectedOption,
                  quantity: 0,
                  totalRevenue: 0
                };
              }
              
              businessProductMap[businessId].products[productKey].quantity += quantity;
              businessProductMap[businessId].products[productKey].totalRevenue += totalPrice;
              businessProductMap[businessId].totalRevenue += totalPrice;
            });
          });
        }
      });
      
      // Sort orders by date
      filteredOrders.sort((a, b) => b.createdDate - a.createdDate);
      
      Object.keys(pickupSpotMap).forEach(spot => {
        pickupSpotMap[spot].sort((a, b) => b.createdDate - a.createdDate);
      });
      
      setCustomerOrders(filteredOrders);
      setBusinessSummary(businessProductMap);
      setOrdersByPickupSpot(pickupSpotMap);
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

  const buildBusinessOrderMessage = (business) => {
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
        const optPart = opt ? ` *${opt}*` : '';
        return `* ${product.productName}${optPart} – ${product.quantity} יח'`;
      });

    return [header, '', ...items].join('\n');
  };

  const handleCopyBusinessOrder = async (business) => {
    try {
      const text = buildBusinessOrderMessage(business);
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
      alert('ההזמנה הועתקה ללוח העריכה');
    } catch (e) {
      console.error('Failed to copy order text', e);
      alert('שגיאה בהעתקת ההזמנה');
    }
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
      // Build items from current summary (keys are stable)
      const baseItems = Object.entries(business.products || {}).map(([key, p]) => ({
        key,
        productName: p.productName,
        selectedOption: normalizeOption(p.selectedOption),
        quantity: Number(p.quantity) || 0,
        price: '' // default until loaded
      }));
      // Try to load saved costs for this farmer (business). If it fails, continue with empty defaults.
      try {
        const ref = doc(db, 'farmerCosts', safeId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data() || {};
          const savedItems = data.items || {};
          // Merge prices and saved quantities if exist
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
      // Build payload for Firestore
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
      // Compare with existing to avoid unnecessary writes
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

      // Build copy text
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
  
  // PDF generation function (same as original)
  const generatePDF = async (pickupSpot, orders) => {
    try {
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
        putOnlyUsedFonts: true
      });
      
      const customerBasicTotals = {};
      orders.forEach(order => {
        const rawCustomerName = order.customerDetails?.name || 'לקוח לא ידוע';
        const normalizedCustomerName = rawCustomerName.trim();
        if (!customerBasicTotals[normalizedCustomerName]) {
          customerBasicTotals[normalizedCustomerName] = {
            displayName: rawCustomerName,
            totalPrice: 0,
            totalQty: 0
          };
        }
        if (order.orderBreakdown) {
          Object.values(order.orderBreakdown).forEach(businessOrder => {
            if (isBasicVendor(businessOrder)) {
              (businessOrder.items || []).forEach(item => {
                const qty = Number(item.quantity) || 0;
                const price = Number(item.price) || 0;
                customerBasicTotals[normalizedCustomerName].totalQty += qty;
                customerBasicTotals[normalizedCustomerName].totalPrice += price * qty;
              });
            }
          });
        }
      });
      
      const isCustomerEligibleForCrate = (normalizedName) => {
        const t = customerBasicTotals[normalizedName];
        return !!t && (t.totalPrice > 50 || t.totalQty > 7);
      };
      
      const customerItems = {};
      
      orders.forEach(order => {
        const rawCustomerName = order.customerDetails?.name || 'לקוח לא ידוע';
        const normalizedCustomerName = rawCustomerName.trim();

        if (!customerItems[normalizedCustomerName]) {
          customerItems[normalizedCustomerName] = {
            displayName: rawCustomerName,
            items: [],
            needsCrate: false
          };
        }
        
        if (order.orderBreakdown) {
          Object.values(order.orderBreakdown).forEach(businessOrder => {
            const isBasic = isBasicVendor(businessOrder);
            const eligible = isCustomerEligibleForCrate(normalizedCustomerName);
            (businessOrder.items || []).forEach(item => {
              if (isBasic && eligible) {
                customerItems[normalizedCustomerName].needsCrate = true;
              } else {
                customerItems[normalizedCustomerName].items.push({
                  productName: item.productName,
                  quantity: item.quantity,
                  option: item.selectedOption,
                  businessName: businessOrder.businessName
                });
              }
            });
          });
        }
      });
      
      Object.values(customerItems).forEach(cust => {
        if (cust.needsCrate) {
          cust.items.push({ isCrate: true, label: BASIC_CRATE_LABEL });
        }
      });
      
      const CHARS_PER_PAGE = 1300;
      let currentPage = 1;
      let currentChars = 0;
      let pagesContent = [[]];
      
      Object.entries(customerItems).forEach(([normalizedName, customerData]) => {
        const displayNameForPdf = customerData.displayName;
        const aggregatedItemsList = customerData.items;

        const itemsText = aggregatedItemsList.map(item => {
          if (item.isCrate) {
            return BASIC_CRATE_LABEL;
          }
          let text = `${item.quantity}× ${item.productName}`;
          if (item.option && item.option !== 'ללא אופציות' && item.option !== 'None') {
            text += ` (${item.option})`;
          }
          return text;
        }).join(', ');
        
        const rowChars = displayNameForPdf.length + itemsText.length;
        
        if (rowChars > CHARS_PER_PAGE) {
          if (pagesContent[currentPage - 1].length > 0) {
            currentPage++;
            currentChars = 0;
            pagesContent.push([]);
          }
        }
        else if (currentChars + rowChars > CHARS_PER_PAGE && pagesContent[currentPage - 1].length > 0) {
          currentPage++;
          currentChars = 0;
          pagesContent.push([]);
        }
        
        pagesContent[currentPage - 1].push({
          type: 'row',
          name: displayNameForPdf,
          items: itemsText,
          chars: rowChars
        });
        
        currentChars += rowChars;
      });
      
      const renderPage = (pageContent) => {
        const element = document.createElement('div');
        element.style.width = '595px';
        element.style.fontFamily = 'Arial, sans-serif';
        element.style.direction = 'rtl';
        element.style.textAlign = 'right';
        element.style.padding = '10px 20px 30px 20px';
        element.style.boxSizing = 'border-box';
        
        let htmlContent = `
          <div style="text-align: center; margin-bottom: 5px;">
            <h1 style="font-size: 14px; color: #2563EB; margin: 0;">נקודת איסוף: ${pickupSpot}</h1>
            <p style="font-size: 10px; margin: 2px 0 0 0;">עמוד ${pageContent.pageNum} מתוך ${pageContent.totalPages}</p>
          </div>
          <table style="width: 100%; border-collapse: collapse; margin-top: 5px;">
            <thead>
              <tr style="background-color: #f3f4f6; border-bottom: 1px solid #e5e7eb;">
                <th style="padding: 3px; text-align: right; font-size: 14px; font-weight: bold;">שם</th>
                <th style="padding: 3px; text-align: right; font-size: 14px; font-weight: bold;">פריטים</th>
              </tr>
            </thead>
            <tbody>
        `;
        
        pageContent.rows.forEach(row => {
          if (row.type === 'row') {
            htmlContent += `
              <tr style="border-bottom: 2px solid #666666;">
                <td style="padding: 4px 3px; font-size: 16px; font-weight: bold; vertical-align: top; width: 22%;">${row.name}</td>
                <td style="padding: 4px 3px; font-size: 14px;">${row.items}</td>
              </tr>
            `;
          }
        });
        
        htmlContent += `
            </tbody>
          </table>
        `;
        
        element.innerHTML = htmlContent;
        return element;
      };
      
      const totalPages = pagesContent.length;
      const numberedPages = pagesContent.map((content, i) => ({
        rows: content,
        pageNum: i + 1,
        totalPages
      }));
      
      for (let i = 0; i < numberedPages.length; i++) {
        const pageElement = renderPage(numberedPages[i]);
        document.body.appendChild(pageElement);
        
        const canvas = await html2canvas(pageElement, {
          scale: 1.5,
          useCORS: true,
          logging: false,
          windowWidth: 595,
        });
        
        if (i > 0) {
          pdf.addPage();
        }
        
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const imgWidth = 210;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
        
        document.body.removeChild(pageElement);
      }
      
      pdf.save(`נקודת_איסוף_${pickupSpot.replace(/\s+/g, '_')}.pdf`);
      
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('אירעה שגיאה ביצירת ה-PDF');
    }
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
  
  return (
    <div className="container mx-auto px-4 py-8" dir="rtl">
      <h1 className="text-3xl font-bold text-center mb-8">סיכום הזמנות שבועי (גרסה 2)</h1>
      
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
                        id={`community-${spot}`}
                        checked={tempSelectedCommunities.has(spot)}
                        onChange={() => toggleCommunity(spot)}
                        className="ml-2"
                      />
                      <label htmlFor={`community-${spot}`} className="text-sm cursor-pointer flex-1">{spot}</label>
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
      
      {customerOrders.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 p-4 rounded text-center">
          לא נמצאו הזמנות עבור השבוע והקהילות שנבחרו
        </div>
      ) : (
        <>
          {/* Pickup Spot Breakdown */}
          <div className="mt-10">
            <h2 className="text-xl font-semibold mb-6 text-blue-800">סיכום לפי נקודות איסוף</h2>
            
            {Object.entries(ordersByPickupSpot).map(([pickupSpot, spotOrders]) => (
              <div 
                key={pickupSpot} 
                className="mb-8 bg-white p-6 rounded-lg shadow"
                ref={el => pdfRefs.current[pickupSpot] = el}
              >
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">
                    נקודת איסוף: {pickupSpot}
                  </h3>
                  <button
                    onClick={() => generatePDF(pickupSpot, spotOrders)}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm flex items-center"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    הורד PDF
                  </button>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">לקוח</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">פריטים</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">סה"כ</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {spotOrders.map((order, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-6 py-4">
                            <div className="text-sm font-medium text-gray-900">
                              {order.customerDetails?.name || 'לא צוין'}
                            </div>
                            <div className="text-xs text-gray-500">
                              {order.customerDetails?.phone || 'אין טלפון'}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-900">
                              <ul className="list-disc list-inside">
                                {order.orderBreakdown && Object.values(order.orderBreakdown).map((businessOrder, bidx) => (
                                  <React.Fragment key={bidx}>
                                    {(businessOrder.items || []).map((item, iidx) => (
                                      <li key={`${bidx}-${iidx}`} className="mb-1">
                                        <span className="font-medium">{item.quantity} × {item.productName}</span>
                                        {item.selectedOption && item.selectedOption !== "ללא אופציות" && item.selectedOption !== "None" && (
                                          <span className="text-gray-500"> ({item.selectedOption})</span>
                                        )}
                                        <span className="text-xs text-gray-500"> - {businessOrder.businessName}</span>
                                      </li>
                                    ))}
                                  </React.Fragment>
                                ))}
                              </ul>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            ₪{order.grandTotal?.toFixed(2) || '0.00'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
          
          {/* Business Summary Table */}
          <div>
            <h2 className="text-2xl font-semibold mb-4">סיכום לפי עסקים ({Object.keys(businessSummary).length})</h2>
            {/* Message settings applied for copy buttons below */}
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
                  תבנית תיושם בעת לחיצה על "העתק הזמנה" ליד כל עסק
                </p>
              </div>
            </div>
            <div className="overflow-x-auto bg-white rounded-lg shadow">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      עסק
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      מוצרים
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      סה"כ הכנסה
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      פעולות
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {Object.entries(businessSummary)
                    .sort(([, a], [, b]) => b.totalRevenue - a.totalRevenue)
                    .map(([businessId, business]) => (
                      <tr key={businessId} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {business.businessName || 'עסק לא ידוע'}
                          </div>
                          <div className="text-sm text-gray-500">
                            {businessId}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900">
                            <ul className="list-disc list-inside">
                              {Object.values(business.products)
                                .sort((a, b) => b.totalRevenue - a.totalRevenue)
                                .map((product, idx) => (
                                  <li key={idx} className="mb-1">
                                    <span className="font-medium">{product.productName}</span>
                                    {product.selectedOption && product.selectedOption !== "ללא אופציות" && product.selectedOption !== "None" && (
                                      <span className="text-gray-500"> ({product.selectedOption})</span>
                                    )}
                                    <span> - {product.quantity} יח' - ₪{product.totalRevenue.toFixed(2)}</span>
                                  </li>
                                ))}
                            </ul>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          ₪{business.totalRevenue.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            onClick={() => handleCopyBusinessOrder(business)}
                            className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                            title="העתק הזמנה לעסק זה"
                          >
                            העתק הזמנה
                          </button>
                          <button
                            onClick={() => openCostModal(businessId, business)}
                            className="ml-2 px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
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
          
          {/* Summary Statistics */}
          <div className="mt-8 bg-blue-50 p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4 text-blue-800">סיכום כללי</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-4 rounded shadow">
                <p className="text-gray-500 text-sm">סה"כ הזמנות</p>
                <p className="text-2xl font-bold">{customerOrders.length}</p>
              </div>
              <div className="bg-white p-4 rounded shadow">
                <p className="text-gray-500 text-sm">סה"כ הכנסות</p>
                <p className="text-2xl font-bold">
                  ₪{customerOrders.reduce((sum, order) => sum + (order.grandTotal || 0), 0).toFixed(2)}
                </p>
              </div>
              <div className="bg-white p-4 rounded shadow">
                <p className="text-gray-500 text-sm">מספר עסקים</p>
                <p className="text-2xl font-bold">{Object.keys(businessSummary).length}</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default WeeklyOrderSummaryV2;


