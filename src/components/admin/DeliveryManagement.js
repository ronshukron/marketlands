import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import LoadingSpinner from '../LoadingSpinner';

const ADMIN_UIDS = ['rfHOLhNoJOW8ByNypCtm3hlSNKs2']; // Replace with your actual admin UID

// Basic vendor config
const BASIC_VENDOR_NAME_SUBSTRINGS = ['basic', 'basic products', 'מוצרים בסיסיים', 'בסיס',"הבסקט של בסטה"];
const BASIC_VENDOR_IDS = []; // optionally add exact IDs
const isBasicVendor = (businessOrder) => {
  const name = businessOrder?.businessName;
  const id = businessOrder?.businessId;
  if (id && BASIC_VENDOR_IDS.includes(id)) return true;
  if (!name) return false;
  const lower = String(name).toLowerCase();
  return BASIC_VENDOR_NAME_SUBSTRINGS.some(sub => lower.includes(sub.toLowerCase()));
};

const DeliveryManagement = () => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pickupSpotItems, setPickupSpotItems] = useState({});
  const [cratesByPickupSpot, setCratesByPickupSpot] = useState({});
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  useEffect(() => {
    if (!currentUser || !ADMIN_UIDS.includes(currentUser.uid)) {
      setError("אין לך הרשאות לצפות בדף זה");
      setLoading(false);
      return;
    }
    fetchDeliveryData();
    // eslint-disable-next-line
  }, [currentUser]);

  const fetchDeliveryData = async () => {
    setLoading(true);
    try {
      // Calculate date range for the past week
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 4);
      
      // Set date range for display
      setDateRange({
        start: startDate.toLocaleDateString('he-IL'),
        end: endDate.toLocaleDateString('he-IL')
      });
      
      // Convert to ISO strings for comparison
      const startDateISO = startDate.toISOString();
      const endDateISO = endDate.toISOString();
      
      const ordersRef = collection(db, 'customerOrders');
      const ordersSnapshot = await getDocs(ordersRef);

      // Collect valid orders within range and completed
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
        validOrders.push(order);
      });

      // First pass: compute basic vendor totals per pickup spot per customer
      const basicTotalsBySpotCustomer = {}; // { [spot]: { [normalizedName]: { displayName, totalQty, totalPrice } } }
      validOrders.forEach(order => {
        const pickupSpot = order.customerDetails?.pickupSpot || 'לא צוין';
        const rawCustomerName = order.customerDetails?.name || 'לקוח לא ידוע';
        const normalizedCustomerName = rawCustomerName.trim();
        if (!basicTotalsBySpotCustomer[pickupSpot]) basicTotalsBySpotCustomer[pickupSpot] = {};
        if (!basicTotalsBySpotCustomer[pickupSpot][normalizedCustomerName]) {
          basicTotalsBySpotCustomer[pickupSpot][normalizedCustomerName] = {
            displayName: rawCustomerName,
            totalQty: 0,
            totalPrice: 0
          };
        }
        if (order.orderBreakdown) {
          Object.values(order.orderBreakdown).forEach(businessOrder => {
            if (!isBasicVendor(businessOrder)) return;
            (businessOrder.items || []).forEach(item => {
              const qty = Number(item.quantity) || 0;
              const price = Number(item.price) || 0;
              basicTotalsBySpotCustomer[pickupSpot][normalizedCustomerName].totalQty += qty;
              basicTotalsBySpotCustomer[pickupSpot][normalizedCustomerName].totalPrice += price * qty;
            });
          });
        }
      });

      // Determine eligibility per customer per pickup spot
      const eligibleCustomersBySpot = {}; // { [spot]: Set(normalizedName) }
      const cratesMap = {}; // { [spot]: Array<{ name, totalQty, totalPrice }> }
      Object.entries(basicTotalsBySpotCustomer).forEach(([spot, byCustomer]) => {
        eligibleCustomersBySpot[spot] = new Set();
        cratesMap[spot] = [];
        Object.entries(byCustomer).forEach(([normalizedName, totals]) => {
          if (totals.totalPrice > 50 || totals.totalQty > 7) {
            eligibleCustomersBySpot[spot].add(normalizedName);
            cratesMap[spot].push({ name: totals.displayName, totalQty: totals.totalQty, totalPrice: totals.totalPrice });
          }
        });
      });

      // Second pass: aggregate items by pickup spot, deducting basic items for eligible customers
      const spotMap = {}; // { [spot]: { [key]: { productName, selectedOption, quantity, businessName } } }
      validOrders.forEach(order => {
        const pickupSpot = order.customerDetails?.pickupSpot || 'לא צוין';
        const rawCustomerName = order.customerDetails?.name || 'לקוח לא ידוע';
        const normalizedCustomerName = rawCustomerName.trim();
        if (!spotMap[pickupSpot]) spotMap[pickupSpot] = {};
        const isEligible = eligibleCustomersBySpot[pickupSpot]?.has(normalizedCustomerName);
        if (order.orderBreakdown) {
          Object.values(order.orderBreakdown).forEach(businessOrder => {
            const isBasic = isBasicVendor(businessOrder);
            (businessOrder.items || []).forEach(item => {
              if (isBasic && isEligible) {
                // Skip adding these items; they go into the crate
                return;
              }
              const key = `${item.productId}_${item.selectedOption || ''}`;
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

      setPickupSpotItems(spotMap);
      setCratesByPickupSpot(cratesMap);
    } catch (err) {
      setError("אירעה שגיאה בטעינת נתוני המשלוחים");
      console.error(err);
    } finally {
      setLoading(false);
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
      <h1 className="text-3xl font-bold text-center mb-8">ניהול משלוחים לפי נקודת איסוף</h1>
      
      <div className="bg-blue-50 p-4 rounded-lg mb-6 text-center">
        <p className="text-blue-800">
          מציג הזמנות מתאריך <span className="font-semibold">{dateRange.start}</span> עד <span className="font-semibold">{dateRange.end}</span>
        </p>
      </div>
      
      {Object.keys(pickupSpotItems).length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 p-4 rounded text-center">
          לא נמצאו פריטים למשלוח בשבוע האחרון.
        </div>
      ) : (
        Object.entries(pickupSpotItems).map(([pickupSpot, items]) => (
          <div key={pickupSpot} className="mb-10 bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4 text-blue-800">
              נקודת איסוף: {pickupSpot}
            </h2>

            {/* Crates section */}
            <div className="mb-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-800">ארגזים להכנה</h3>
                <span className="text-sm text-gray-600">סה"כ: {cratesByPickupSpot[pickupSpot]?.length || 0}</span>
              </div>
              {(cratesByPickupSpot[pickupSpot] && cratesByPickupSpot[pickupSpot].length > 0) ? (
                <ul className="mt-2 list-disc list-inside text-sm text-gray-800">
                  {cratesByPickupSpot[pickupSpot].map((c, idx) => (
                    <li key={idx}>
                      {c.name} — {c.totalQty} פריטים בסיסיים, ₪{c.totalPrice.toFixed(2)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-gray-500">אין צורך בארגזים לנקודה זו.</p>
              )}
            </div>

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

export default DeliveryManagement; 