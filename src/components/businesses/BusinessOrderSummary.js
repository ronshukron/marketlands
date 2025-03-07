import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import LoadingSpinner from '../LoadingSpinner';

const BusinessOrderSummary = () => {
  const { orderId } = useParams();
  const [orderData, setOrderData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrderData = async () => {
      const docRef = doc(db, 'Orders', orderId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setOrderData(docSnap.data());
      }
      setLoading(false);
    };

    fetchOrderData();
  }, [orderId]);

  const calculateMemberTotal = (memberDetails) => {
    return Object.values(memberDetails)
      .filter((item) => typeof item === 'object' && item.Quantity)
      .reduce((total, item) => total + item.Quantity * item.Price, 0);
  };

  const calculateOrderTotal = () => {
    if (!orderData) return 0;
    return Object.keys(orderData)
      .filter(key => key.startsWith('Member_'))
      .reduce((total, memberKey) => total + calculateMemberTotal(orderData[memberKey]), 0);
  };

  if (loading) return <LoadingSpinner />;
  if (!orderData) return (
    <div className="text-center py-12 text-gray-600">לא נמצאו נתונים להזמנה זו.</div>
  );

  return (
    <div dir="rtl" className="max-w-4xl mx-auto px-4 py-8">
      {/* Header Section */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">{orderData.orderName}</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">אזור:</span>
            <span className="font-medium">{orderData.areas?.join(', ') || 'ללא אזור'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">תאריך יצירה:</span>
            <span className="font-medium">
              {orderData.createdAt ? orderData.Order_Time.toDate().toLocaleString() : 'לא זמין'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">תאריך סיום:</span>
            <span className="font-medium">
              {orderData.endingTime ? orderData.endingTime.toDate().toLocaleString() : 'לא זמין'}
            </span>
          </div>
        </div>
      </div>

      {/* Total Amount Section */}
      <div className="bg-blue-50 rounded-lg p-4 mb-6 text-center">
        <span className="text-gray-700">סך כל ההזמנות:</span>
        <span className="text-xl font-bold text-blue-600 mr-2">₪{calculateOrderTotal().toFixed(2)}</span>
      </div>

      {/* Members Orders Section */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">הזמנות של לקוחות</h2>
        
        {Object.keys(orderData)
          .filter((key) => key.startsWith('Member_'))
          .map((memberKey, index) => {
            const memberDetails = orderData[memberKey];
            const memberTotal = calculateMemberTotal(memberDetails);

            return (
              <div key={index} className="bg-white rounded-lg shadow-sm p-6">
                {/* Member Header */}
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-gray-800">{memberDetails.Name}</h3>
                  <span className="text-lg font-bold text-green-600">₪{memberTotal.toFixed(2)}</span>
                </div>

                {/* Member Contact Info */}
                <div className="flex flex-wrap gap-4 text-sm mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">טלפון:</span>
                    <span className="font-medium">{memberDetails.Phone}</span>
                  </div>
                  {memberDetails.Address && (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">כתובת:</span>
                      <span className="font-medium">{memberDetails.Address}</span>
                    </div>
                  )}
                </div>

                {/* Products List */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <ul className="space-y-2">
                    {Object.entries(memberDetails)
                      .filter(([key, value]) => typeof value === 'object' && value.Quantity)
                      .map(([productKey, productDetails], idx) => (
                        <li key={idx} className="flex justify-between items-center text-sm">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{productDetails.Name}</span>
                            {productDetails.Option && (
                              <span className="text-gray-500">({productDetails.Option})</span>
                            )}
                            <span className="text-gray-600">
                              × {productDetails.Quantity}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500">₪{productDetails.Price}</span>
                            <span className="font-medium">₪{(productDetails.Quantity * productDetails.Price).toFixed(2)}</span>
                          </div>
                        </li>
                      ))}
                  </ul>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
};

export default BusinessOrderSummary;
