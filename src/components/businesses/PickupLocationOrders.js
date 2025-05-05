import React, { useState, useEffect } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import LoadingSpinner from '../LoadingSpinner';

const PickupLocationOrders = () => {
  const { location: locationParam } = useParams();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [customerOrders, setCustomerOrders] = useState({});
  const decodedLocation = decodeURIComponent(locationParam);
  
  // Get orders from navigation state
  const orders = location.state?.orders || [];

  useEffect(() => {
    try {
      setLoading(true);
      
      // Organize orders by customer
      const customerOrdersMap = {};
      orders.forEach(order => {
        const customerId = order.userId || `anonymous-${Math.random().toString(36).substr(2, 9)}`;
        const customerName = order.customerDetails?.name || 'לקוח לא ידוע';
        
        if (!customerOrdersMap[customerId]) {
          customerOrdersMap[customerId] = {
            name: customerName,
            email: order.customerDetails?.email || '',
            phone: order.customerDetails?.phone || '',
            orders: []
          };
        }
        
        customerOrdersMap[customerId].orders.push(order);
      });
      
      setCustomerOrders(customerOrdersMap);
    } catch (err) {
      console.error("Error processing orders:", err);
      setError("אירעה שגיאה בעיבוד ההזמנות.");
    } finally {
      setLoading(false);
    }
  }, [orders]);

  if (loading) return <LoadingSpinner />;
  
  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
        <div className="mt-4">
          <Link to="/business-dashboard" className="text-blue-600 hover:underline">
            &larr; חזרה ללוח הבקרה
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          הזמנות בנקודת איסוף: {decodeURIComponent(locationParam)}
        </h1>
        <Link to="/business-dashboard" className="text-blue-600 hover:underline">
          &larr; חזרה ללוח הבקרה
        </Link>
      </div>
      
      {orders.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded">
          אין הזמנות בנקודת איסוף זו.
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(customerOrders).map(([customerId, customer]) => (
            <div key={customerId} className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200">
              <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                <div className="flex flex-wrap justify-between items-center">
                  <div className="flex items-center">
                    <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold mr-3">
                      {customer.name[0]?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-gray-800">{customer.name}</h3>
                      <div className="flex space-x-4 rtl:space-x-reverse text-sm text-gray-500">
                        {customer.phone && (
                          <span className="flex items-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                            {customer.phone}
                          </span>
                        )}
                        {customer.email && (
                          <span className="flex items-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                            {customer.email}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 sm:mt-0">
                    <span className="bg-green-50 text-green-700 px-3 py-1 rounded-full text-sm font-medium">
                      {customer.orders.length} הזמנות
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="px-6 py-4">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          מוצר
                        </th>
                        <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          כמות
                        </th>
                        <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          מחיר
                        </th>
                        <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          עסק
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {customer.orders.flatMap(order => 
                        order.items.map((item, idx) => (
                          <tr key={`${order.id}-${idx}`}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {item.productName || item.name}
                              {item.selectedOption && item.selectedOption !== "ללא אופציות" && (
                                <span className="block text-xs text-gray-500">
                                  אפשרות: {item.selectedOption}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {item.quantity}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              ₪{(item.price * item.quantity).toFixed(2)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {item.businessName || order.businessName || 'לא ידוע'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PickupLocationOrders; 