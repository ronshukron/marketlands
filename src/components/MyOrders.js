import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/authContext';
import { db } from '../firebase/firebase';
import { collection, query, getDocs } from 'firebase/firestore';
import LoadingSpinner from './LoadingSpinner';

const MyOrders = () => {
  const { currentUser } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchOrders = async () => {
      if (currentUser && currentUser.email) {
        const ordersRef = collection(db, 'Orders');
        const q = query(ordersRef);
        const querySnapshot = await getDocs(q);

        const fetchedOrders = querySnapshot.docs.flatMap((doc) => {
          const orderData = doc.data();

          return Object.entries(orderData)
            .filter(
              ([key, value]) =>
                key.startsWith('Member_') &&
                value.Email === currentUser.email
            )
            .map(([memberId, memberData]) => ({
              orderId: doc.id,
              memberId,
              orderName: orderData.orderName || orderData.Order_Name || 'N/A',
              supplierName:
                orderData.businessName ||
                orderData.Producer_Name ||
                'N/A',
              orderTime: memberData.Mem_Order_Time,
              orderValue: memberData.OrderValue,
              ...memberData,
            }));
        });

        setOrders(fetchedOrders);
        setLoading(false);
      }
    };

    fetchOrders();
  }, [currentUser]);

  const handleOrderClick = (orderId, memberId) => {
    navigate(`/order-details/${orderId}/${memberId}`);
  };

  const calculateOrderValue = (memberData) => {
    return Object.entries(memberData)
      .filter(
        ([key, value]) =>
          ![
            'Name',
            'Email',
            'Phone',
            'Mem_Order_Time',
            'OrderValue',
            'completedAt',
            'createdAt',
            'orderId',
            'paymentDetails',
            'status',
          ].includes(key) &&
          typeof value === 'object' &&
          value.Quantity
      )
      .reduce(
        (total, [_, product]) =>
          total + Number(product.Price) * product.Quantity,
        0
      );
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8" dir="rtl">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-6 pb-2 border-b border-gray-200">ההזמנות שלי</h1>
        
        {loading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p className="text-xl text-gray-600 font-medium mb-2">עוד לא ביצעתם שום הזמנה</p>
            <p className="text-gray-500 max-w-md mx-auto">כאן תוכלו לראות את היסטוריית ההזמנות שלכם ברגע שתבצעו הזמנה</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      שם הזמנה
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ספק
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      תאריך הזמנה
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      סה"כ עלות
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {orders.map((order) => (
                    <tr
                      key={`${order.orderId}-${order.memberId}`}
                      onClick={() => handleOrderClick(order.orderId, order.memberId)}
                      className="hover:bg-blue-50 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {order.orderName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {order.supplierName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {order.orderTime
                          ? new Date(
                              typeof order.orderTime === 'number'
                                ? order.orderTime
                                : parseInt(order.orderTime)
                            ).toLocaleDateString('he-IL')
                          : 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">
                        ₪
                        {order.orderValue
                          ? Number(order.orderValue).toFixed(2)
                          : calculateOrderValue(order).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MyOrders;
