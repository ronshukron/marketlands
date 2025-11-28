import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import LoadingSpinner from '../LoadingSpinner';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { pickupSpots } from '../../data/pickupSpots';
import { format } from 'date-fns';

const ADMIN_UIDS = ['rfHOLhNoJOW8ByNypCtm3hlSNKs2'];

const DeliveryManagementV2 = () => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pickupSpotItems, setPickupSpotItems] = useState({});
  const [cratesByPickupSpot, setCratesByPickupSpot] = useState({});
  const [cratesContentByPickupSpot, setCratesContentByPickupSpot] = useState({});
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  
  // New state for week selection
  const [availableWeeks, setAvailableWeeks] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState('');
  
  // New state for community selection
  const [selectedCommunities, setSelectedCommunities] = useState(new Set());
  const [showCommunityDropdown, setShowCommunityDropdown] = useState(false);
  const communityDropdownRef = useRef(null);
  
  // Box/Crate eligibility threshold - customers spending MORE than this amount get a box
  const [boxThreshold, setBoxThreshold] = useState(60);

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
      setError("אין לך הרשאות לצפות בדף זה");
      setLoading(false);
      return;
    }
    fetchAvailableWeeks();
  }, [currentUser]);
  
  useEffect(() => {
    if (selectedWeek) {
      fetchDeliveryData();
    }
  }, [selectedWeek, selectedCommunities, boxThreshold]);

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
      
      // Auto-select most recent week
      if (sortedWeeks.length > 0) {
        setSelectedWeek(sortedWeeks[0]);
      }
    } catch (err) {
      console.error("Error fetching available weeks:", err);
      setError("Failed to load weeks data");
    } finally {
      setLoading(false);
    }
  };

  const fetchDeliveryData = async () => {
    setLoading(true);
    try {
      // Parse selected week to get date range (Sunday to Friday)
      const sunday = new Date(selectedWeek);
      const friday = new Date(sunday);
      friday.setDate(sunday.getDate() + 5);
      friday.setHours(23, 59, 59, 999);

      setDateRange({
        start: sunday.toLocaleDateString('he-IL'),
        end: friday.toLocaleDateString('he-IL')
      });

      const startDateISO = sunday.toISOString();
      const endDateISO = friday.toISOString();

      const ordersRef = collection(db, 'customerOrders');
      const ordersSnapshot = await getDocs(ordersRef);

      const validOrders = [];
      ordersSnapshot.forEach(docSnap => {
        const order = docSnap.data();
        if (!order || order.paymentStatus !== 'completed') return;
        
        const createdAt = order.createdAt;
        let createdDate;
        if (typeof createdAt === 'string') {
          createdDate = new Date(createdAt);
        } else if (createdAt && createdAt.toDate) {
          createdDate = createdAt.toDate();
        } else {
          return;
        }
        
        const createdDateISO = createdDate.toISOString();
        if (createdDateISO < startDateISO || createdDateISO > endDateISO) return;
        
        // Filter by selected communities
        const pickupSpot = order.customerDetails?.pickupSpot || 'לא צוין';
        if (selectedCommunities.size > 0 && !selectedCommunities.has(pickupSpot)) return;
        
        validOrders.push(order);
      });

      // Compute totals per pickup spot per customer
      const totalsBySpotCustomer = {};
      validOrders.forEach(order => {
        const pickupSpot = order.customerDetails?.pickupSpot || 'לא צוין';
        const rawCustomerName = order.customerDetails?.name || 'לקוח לא ידוע';
        const normalizedCustomerName = rawCustomerName.trim();
        if (!totalsBySpotCustomer[pickupSpot]) totalsBySpotCustomer[pickupSpot] = {};
        if (!totalsBySpotCustomer[pickupSpot][normalizedCustomerName]) {
          totalsBySpotCustomer[pickupSpot][normalizedCustomerName] = {
            displayName: rawCustomerName,
            totalQty: 0,
            totalPrice: 0
          };
        }
        if (order.orderBreakdown) {
          Object.values(order.orderBreakdown).forEach(businessOrder => {
            (businessOrder.items || []).forEach(item => {
              const qty = Number(item.quantity) || 0;
              const price = Number(item.price) || 0;
              totalsBySpotCustomer[pickupSpot][normalizedCustomerName].totalQty += qty;
              totalsBySpotCustomer[pickupSpot][normalizedCustomerName].totalPrice += price * qty;
            });
          });
        }
      });

      // Eligibility: totalPrice >= boxThreshold
      const eligibleCustomersBySpot = {};
      const cratesMap = {};
      Object.entries(totalsBySpotCustomer).forEach(([spot, byCustomer]) => {
        eligibleCustomersBySpot[spot] = new Set();
        cratesMap[spot] = [];
        Object.entries(byCustomer).forEach(([normalizedName, totals]) => {
          if (totals.totalPrice >= boxThreshold) {
            eligibleCustomersBySpot[spot].add(normalizedName);
            cratesMap[spot].push({ name: totals.displayName, totalQty: totals.totalQty, totalPrice: totals.totalPrice });
          }
        });
      });

      // Aggregate items by pickup spot
      const spotMap = {};
      const cratesContentMap = {};
      validOrders.forEach(order => {
        const pickupSpot = order.customerDetails?.pickupSpot || 'לא צוין';
        const rawCustomerName = order.customerDetails?.name || 'לקוח לא ידוע';
        const normalizedCustomerName = rawCustomerName.trim();
        if (!spotMap[pickupSpot]) spotMap[pickupSpot] = {};
        const isEligible = eligibleCustomersBySpot[pickupSpot]?.has(normalizedCustomerName);
        if (order.orderBreakdown) {
          Object.values(order.orderBreakdown).forEach(businessOrder => {
            (businessOrder.items || []).forEach(item => {
              const key = `${item.productId}_${item.selectedOption || ''}`;
              if (isEligible) {
                if (!cratesContentMap[pickupSpot]) cratesContentMap[pickupSpot] = {};
                if (!cratesContentMap[pickupSpot][normalizedCustomerName]) {
                  cratesContentMap[pickupSpot][normalizedCustomerName] = {
                    displayName: rawCustomerName,
                    itemsMap: {}
                  };
                }
                if (!cratesContentMap[pickupSpot][normalizedCustomerName].itemsMap[key]) {
                  cratesContentMap[pickupSpot][normalizedCustomerName].itemsMap[key] = {
                    productName: item.productName,
                    selectedOption: item.selectedOption,
                    quantity: 0,
                    businessName: businessOrder.businessName || 'לא צוין'
                  };
                }
                cratesContentMap[pickupSpot][normalizedCustomerName].itemsMap[key].quantity += Number(item.quantity) || 0;
                return;
              }
              // not eligible: goes to general list
              if (!spotMap[pickupSpot][key]) {
                spotMap[pickupSpot][key] = {
                  productName: item.productName,
                  selectedOption: item.selectedOption,
                  quantity: 0,
                  businessName: businessOrder.businessName || 'לא צוין'
                };
              }
              spotMap[pickupSpot][key].quantity += Number(item.quantity) || 0;
            });
          });
        }
      });

      // Convert crates content to arrays
      const cratesContentObj = {};
      Object.entries(cratesContentMap).forEach(([spot, byCustomer]) => {
        cratesContentObj[spot] = Object.values(byCustomer).map(c => ({
          name: c.displayName,
          items: Object.values(c.itemsMap)
        }));
      });

      setPickupSpotItems(spotMap);
      setCratesByPickupSpot(cratesMap);
      setCratesContentByPickupSpot(cratesContentObj);
    } catch (err) {
      setError("אירעה שגיאה בטעינת נתוני המשלוחים");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  
  const toggleCommunity = (community) => {
    setSelectedCommunities(prev => {
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
    setSelectedCommunities(new Set(pickupSpots));
  };
  
  const clearAllCommunities = () => {
    setSelectedCommunities(new Set());
  };

  const generatePickupSpotPDF = async (pickupSpot) => {
    try {
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', putOnlyUsedFonts: true });

      const crates = cratesContentByPickupSpot[pickupSpot] || [];
      const items = Object.values(pickupSpotItems[pickupSpot] || {});

      const renderToPdf = async (pageElement, addNewPage) => {
        document.body.appendChild(pageElement);
        const canvas = await html2canvas(pageElement, { scale: 1.5, useCORS: true, logging: false, windowWidth: 595 });
        if (addNewPage) pdf.addPage();
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const imgWidth = 210;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
        document.body.removeChild(pageElement);
      };

      const CRATES_PER_PAGE = 1;
      const ITEM_ROWS_PER_PAGE = 20;

      const crateChunks = [];
      for (let i = 0; i < crates.length; i += CRATES_PER_PAGE) {
        crateChunks.push(crates.slice(i, i + CRATES_PER_PAGE));
      }

      const itemChunks = [];
      for (let i = 0; i < items.length; i += ITEM_ROWS_PER_PAGE) {
        itemChunks.push(items.slice(i, i + ITEM_ROWS_PER_PAGE));
      }

      let pageIndex = 0;

      // Render crate pages
      for (let ci = 0; ci < Math.max(1, crateChunks.length); ci++) {
        const chunk = crateChunks[ci] || [];
        const el = document.createElement('div');
        el.style.width = '595px';
        el.style.fontFamily = 'Arial, sans-serif';
        el.style.direction = 'rtl';
        el.style.textAlign = 'right';
        el.style.padding = '16px 20px 24px 20px';
        el.style.boxSizing = 'border-box';
        let html = `
          <div style="text-align:center; margin-bottom:6px;">
            <h1 style="font-size:16px; color:#111827; margin:0;">נקודת איסוף: ${pickupSpot}</h1>
            <p style="font-size:11px; margin:2px 0 0 0; color:#6B7280;">ארגזים להכנה (${crates.length})</p>
          </div>
        `;
        if (chunk.length === 0) {
          html += `<div style="font-size:12px; color:#6B7280;">אין צורך בארגזים לנקודה זו.</div>`;
        } else {
          chunk.forEach((crate) => {
            html += `
              <div style="margin-top:10px;">
                <div style="font-weight:bold; font-size:14px; margin-bottom:4px;">${crate.name}</div>
                <table style="width:100%; border-collapse:collapse; border:1px solid #E5E7EB;">
                  <tbody>
            `;
            const items = crate.items || [];
            for (let i = 0; i < items.length; i += 2) {
              const item1 = items[i];
              const item2 = items[i + 1];
              const formatItem = (it) => {
                if (!it) return '';
                const option = it.selectedOption && it.selectedOption !== 'ללא' ? ` (${it.selectedOption})` : '';
                return `${it.productName}${option} - ${it.quantity}`;
              };
              html += `
                <tr style="border-bottom:1px solid #E5E7EB;">
                  <td style="padding:6px 8px; font-size:12px; width:50%; border-left:1px solid #E5E7EB;">${formatItem(item1)}</td>
                  <td style="padding:6px 8px; font-size:12px; width:50%;">${formatItem(item2)}</td>
                </tr>
              `;
            }
            html += `</tbody></table></div>`;
          });
        }
        el.innerHTML = html;
        await renderToPdf(el, pageIndex++ > 0);
      }

      // Render items pages
      for (let ii = 0; ii < Math.max(1, itemChunks.length); ii++) {
        const chunk = itemChunks[ii] || [];
        const el = document.createElement('div');
        el.style.width = '595px';
        el.style.fontFamily = 'Arial, sans-serif';
        el.style.direction = 'rtl';
        el.style.textAlign = 'right';
        el.style.padding = '16px 20px 24px 20px';
        el.style.boxSizing = 'border-box';
        let html = `
          <div style="text-align:center; margin-bottom:6px;">
            <h1 style="font-size:16px; color:#111827; margin:0;">נקודת איסוף: ${pickupSpot}</h1>
            <p style="font-size:11px; margin:2px 0 0 0; color:#6B7280;">רשימת פריטים כללית (ללא ארגזים) — ${items.length}</p>
          </div>
          <table style="width:100%; border-collapse:collapse; border:1px solid #E5E7EB;">
            <tbody>
        `;
        for (let i = 0; i < chunk.length; i += 2) {
          const item1 = chunk[i];
          const item2 = chunk[i + 1];
          const formatItem = (it) => {
            if (!it) return '';
            const option = it.selectedOption && it.selectedOption !== 'ללא' ? ` (${it.selectedOption})` : '';
            return `${it.productName}${option} - ${it.quantity}`;
          };
          html += `
            <tr style="border-bottom:1px solid #E5E7EB;">
              <td style="padding:6px 8px; font-size:12px; width:50%; border-left:1px solid #E5E7EB;">${formatItem(item1)}</td>
              <td style="padding:6px 8px; font-size:12px; width:50%;">${formatItem(item2)}</td>
            </tr>
          `;
        }
        html += `</tbody></table>`;
        el.innerHTML = html;
        await renderToPdf(el, pageIndex++ > 0);
      }

      pdf.save(`משלוחים_V2_${pickupSpot.replace(/\s+/g, '_')}.pdf`);
    } catch (e) {
      console.error('Error generating delivery PDF', e);
      alert('שגיאה ביצוא ה-PDF');
    }
  };

  if (loading) return <LoadingSpinner />;
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <p className="font-bold">שגיאה</p>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8" dir="rtl">
      <h1 className="text-3xl font-bold text-center mb-8">ניהול משלוחים (גרסה 2)</h1>
      
      {/* Week and Community Selection */}
      <div className="mb-6 bg-white p-6 rounded-lg shadow">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Week Selection */}
          <div>
            <label className="block text-gray-700 text-sm font-medium mb-2">בחר שבוע:</label>
            <select
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(e.target.value)}
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
                {selectedCommunities.size === 0 ? 'כל הקהילות' : `${selectedCommunities.size} קהילות נבחרו`}
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
                        id={`delivery-community-${spot}`}
                        checked={selectedCommunities.has(spot)}
                        onChange={() => toggleCommunity(spot)}
                        className="ml-2"
                      />
                      <label htmlFor={`delivery-community-${spot}`} className="text-sm cursor-pointer flex-1">{spot}</label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Box Threshold Selection */}
          <div>
            <label className="block text-gray-700 text-sm font-medium mb-2">סף ארגז (₪):</label>
            <input
              type="number"
              value={boxThreshold}
              onChange={(e) => setBoxThreshold(Number(e.target.value) || 60)}
              min="0"
              step="10"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="60"
            />
            <p className="text-xs text-gray-500 mt-1">לקוחות מעל סכום זה יקבלו ארגז</p>
          </div>
        </div>
        
        <p className="text-center text-gray-600 mt-4">
          מציג הזמנות מתאריך <span className="font-semibold">{dateRange.start}</span> עד <span className="font-semibold">{dateRange.end}</span>
          {selectedCommunities.size > 0 && ` עבור ${selectedCommunities.size} קהילות`}
          {` • סף ארגז: ₪${boxThreshold}`}
        </p>
      </div>
      
      {Object.keys(pickupSpotItems).length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 p-4 rounded text-center">
          לא נמצאו פריטים למשלוח עבור השבוע והקהילות שנבחרו.
        </div>
      ) : (
        Object.entries(pickupSpotItems).map(([pickupSpot, items]) => (
          <div key={pickupSpot} className="mb-10 bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-semibold text-blue-800">
                נקודת איסוף: {pickupSpot}
              </h2>
              <button
                onClick={() => generatePickupSpotPDF(pickupSpot)}
                className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm"
              >
                הורד PDF לנקודה זו
              </button>
            </div>

            {/* Crates section with contents */}
            <div className="mb-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-800">ארגזים להכנה</h3>
                <span className="text-sm text-gray-600">סה"כ: {cratesByPickupSpot[pickupSpot]?.length || 0}</span>
              </div>
              {(cratesContentByPickupSpot[pickupSpot] && cratesContentByPickupSpot[pickupSpot].length > 0) ? (
                <div className="mt-2 space-y-4">
                  {cratesContentByPickupSpot[pickupSpot].map((crate, idx) => (
                    <div key={idx} className="border border-gray-200 rounded">
                      <div className="px-3 py-2 bg-gray-50 font-semibold">{crate.name}</div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">מוצר</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">אופציה</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">כמות</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {(crate.items || []).map((it, iidx) => (
                              <tr key={iidx}>
                                <td className="px-4 py-2 text-sm text-gray-900">{it.productName}</td>
                                <td className="px-4 py-2 text-sm text-gray-500">{it.selectedOption || 'ללא'}</td>
                                <td className="px-4 py-2 text-sm font-semibold text-gray-900">{it.quantity}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-gray-500">אין צורך בארגזים לנקודה זו.</p>
              )}
            </div>

            {/* General Items */}
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">מוצר</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">אופציה</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">עסק</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">כמות</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {Object.values(items).map((item, idx) => (
                  <tr key={idx}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {item.productName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.selectedOption || 'ללא'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.businessName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.quantity}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
};

export default DeliveryManagementV2;

