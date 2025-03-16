import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import LoadingSpinner from './LoadingSpinner';

const ExternalOrderDetail = () => {
  const { orderId } = useParams();
  const [orderData, setOrderData] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchOrderData = async () => {
      try {
        const orderDoc = await getDoc(doc(db, 'Orders', orderId));
        
        if (orderDoc.exists()) {
          const data = orderDoc.data();
          setOrderData(data);
          
          // Fetch products if there are selected products
          if (data.selectedProducts && data.selectedProducts.length > 0) {
            await fetchProducts(data.selectedProducts);
          }
        } else {
          // Order not found
          console.error('Order not found');
        }
      } catch (error) {
        console.error('Error fetching order data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchOrderData();
  }, [orderId]);

  const fetchProducts = async (productIds) => {
    try {
      const productPromises = productIds.map(id => 
        getDoc(doc(db, 'Products', id))
      );
      
      const productDocs = await Promise.all(productPromises);
      
      const productData = productDocs
        .filter(doc => doc.exists())
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
      
      setProducts(productData);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!orderData) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 text-center">
        <h2 className="text-xl font-bold text-red-600">
          ההזמנה לא נמצאה
        </h2>
        <button 
          onClick={() => navigate('/')}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          חזור לדף הבית
        </button>
      </div>
    );
  }

  return (
    <div dir="rtl" className="max-w-2xl mx-auto px-4 py-8">
      <div className="bg-yellow-50 border-r-4 border-yellow-400 p-4 mb-6">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="mr-3">
            <p className="text-sm text-yellow-800">
              דף מכירה זה הוא פרסום חיצוני שנאסף מרשתות חברתיות ומחקלאים ידנית. אנא צרו קשר ישירות עם החקלאי/ספק לביצוע הזמנה.
            </p>
          </div>
        </div>
      </div>

      {/* Order Image */}
      {/* {orderData.imageUrl && (
        <div className="mb-6 rounded-lg overflow-hidden shadow-sm">
          <img 
            src={orderData.imageUrl} 
            alt={orderData.orderName} 
            className="w-full h-auto"
          />
        </div>
      )} */}

      {/* Order Details */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          {orderData.orderName || orderData.Order_Name}
        </h1>
        
        <div className="space-y-4">
          {orderData.description && (
            <div>
              <h3 className="text-sm font-medium text-gray-500">תיאור</h3>
              <p className="text-base text-gray-900 whitespace-pre-line">{orderData.description}</p>
            </div>
          )}
          
          {/* Products Section */}
          {products.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">המוצרים</h3>
              <div className="space-y-4">
                {products.map((product) => (
                  <div key={product.id} className="bg-gray-50 rounded-lg p-4">
                    {product.images && product.images.length > 0 && (
                      <img
                        src={product.images[0]}
                        alt={product.name}
                        className="w-full h-40 object-cover rounded-lg mb-3"
                      />
                    )}
                    <h4 className="text-md font-medium">{product.name}</h4>
                    
                    {product.description && (
                      <p className="text-sm text-gray-600 mt-1">{product.description}</p>
                    )}
                    
                    <div className="mt-2 flex justify-between items-center">
                      <span className="text-sm font-medium">
                        מחיר: {product.price === 0 ? "ללא פירוט" : `₪${product.price}`}
                      </span>
                      
                      {product.options && product.options.length > 0 && (
                        <span className="text-xs text-gray-500">
                          אפשרויות: {product.options.join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {orderData.phoneNumber && (
            <div>
              <h3 className="text-sm font-medium text-gray-500">טלפון ליצירת קשר</h3>
              <p className="text-base text-gray-900">{orderData.phoneNumber}</p>
            </div>
          )}
          
          {orderData.areas && orderData.areas.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-500">אזורי חלוקה</h3>
              <p className="text-base text-gray-900">{orderData.areas.join(', ')}</p>
            </div>
          )}
          
          {orderData.endingTime && (
            <div>
              <h3 className="text-sm font-medium text-gray-500">תאריך סיום הזמנות</h3>
              <p className="text-base text-gray-900">
                {orderData.endingTime.toDate().toLocaleString('he-IL')}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Contact Instructions */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">איך להזמין?</h2>
        
        <p className="text-gray-700 mb-4">
          על מנת להזמין, אנא פנו ישירות לחקלאי/ספק בטלפון המצוין.
        </p>
        
        {orderData.phoneNumber && (
          <a 
            href={`tel:${orderData.phoneNumber}`}
            className="block w-full bg-blue-500 hover:bg-blue-600 text-white text-center font-medium py-3 px-4 rounded-lg transition-colors"
          >
            התקשר לספק
          </a>
        )}
      </div>
      
      <div className="text-center mt-6">
        <button 
          onClick={() => navigate(-1)}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
        >
          חזור להזמנות
        </button>
      </div>
    </div>
  );
};

export default ExternalOrderDetail; 