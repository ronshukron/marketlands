import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import LoadingSpinner from '../LoadingSpinner';

const ADMIN_UIDS = ['rfHOLhNoJOW8ByNypCtm3hlSNKs2']; // Replace with your actual admin UID

const DeliveryManagement = () => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pickupSpotItems, setPickupSpotItems] = useState({});
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
      startDate.setDate(startDate.getDate() - 5);
      
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

      // Aggregate items by pickup spot
      const spotMap = {};

      ordersSnapshot.forEach(docSnap => {
        const order = docSnap.data();
        if (!order || order.paymentStatus !== 'completed') return;
        
        // Check if order is within the last 7 days
        const createdAt = order.createdAt;
        let createdDate;
        
        if (typeof createdAt === 'string') {
          createdDate = new Date(createdAt);
        } else if (createdAt && createdAt.toDate) {
          createdDate = createdAt.toDate();
        } else {
          // Skip if no valid date
          return;
        }
        
        // Check if within date range
        const createdDateISO = createdDate.toISOString();
        if (createdDateISO < startDateISO || createdDateISO > endDateISO) {
          return; // Skip orders outside the date range
        }

        const pickupSpot = order.customerDetails?.pickupSpot || 'לא צוין';
        if (!spotMap[pickupSpot]) spotMap[pickupSpot] = {};

        // Aggregate items from orderBreakdown
        if (order.orderBreakdown) {
          Object.values(order.orderBreakdown).forEach(businessOrder => {
            (businessOrder.items || []).forEach(item => {
              const key = `${item.productId}_${item.selectedOption || ''}`;
              if (!spotMap[pickupSpot][key]) {
                spotMap[pickupSpot][key] = {
                  productName: item.productName,
                  selectedOption: item.selectedOption,
                  quantity: 0,
                  businessName: businessOrder.businessName || 'לא צוין'
                };
              }
              spotMap[pickupSpot][key].quantity += item.quantity;
            });
          });
        }
      });

      setPickupSpotItems(spotMap);
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