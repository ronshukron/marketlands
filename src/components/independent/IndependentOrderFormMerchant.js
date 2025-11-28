import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import { useCart } from '../../contexts/CartContext';
import LoadingSpinner from '../LoadingSpinner';
import Slider from 'react-slick';
import 'slick-carousel/slick/slick.css';
import 'slick-carousel/slick/slick-theme.css';
import Swal from 'sweetalert2';

const IndependentOrderFormMerchant = () => {
  const { orderId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const orderFromNav = useMemo(() => location.state?.order || null, [location.state]);

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState(orderFromNav);
  const [businessInfo, setBusinessInfo] = useState({});
  const [products, setProducts] = useState([]);
  const [orderEnded, setOrderEnded] = useState(false);
  const { currentUser } = useAuth();
  const { addItem, itemsByOrder } = useCart();
  
  // Selected region (replaces pickup spot for merchants)
  const [selectedRegion, setSelectedRegion] = useState('');

  // Calculate current order total from cart
  const currentOrderTotal = useMemo(() => {
    if (!orderId || !itemsByOrder[orderId]) return 0;
    return itemsByOrder[orderId].total || 0;
  }, [orderId, itemsByOrder]);

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        let currentOrder = orderFromNav;
        if (!currentOrder) {
          const orderRef = doc(db, 'IndependentOrders', orderId);
          const snap = await getDoc(orderRef);
          if (!snap.exists()) {
            navigate('/error');
            return;
          }
          currentOrder = { id: orderId, ...snap.data() };
        }
        setOrder(currentOrder);

        // Check if order has ended (with 15-minute grace period)
        if (currentOrder.endingTime) {
          let endingDate;
          if (currentOrder.endingTime?.toDate && typeof currentOrder.endingTime.toDate === 'function') {
            endingDate = currentOrder.endingTime.toDate();
          } else if (currentOrder.endingTime instanceof Date) {
            endingDate = currentOrder.endingTime;
          } else if (typeof currentOrder.endingTime === 'string') {
            endingDate = new Date(currentOrder.endingTime);
          }
          
          if (endingDate && !isNaN(endingDate)) {
            const gracePeriodEnd = new Date(endingDate.getTime() + 15 * 60 * 1000); // Add 15 minutes
            if (new Date() >= gracePeriodEnd) {
              setOrderEnded(true);
            }
          }
        }
        
        // Fallback to shipping date if endingTime not available
        if (!orderEnded && currentOrder.shippingDateRange && currentOrder.shippingDateRange.end) {
          const end = new Date(currentOrder.shippingDateRange.end);
          if (new Date() >= end) setOrderEnded(true);
        }

        // fetch business info
        if (currentOrder.businessId) {
          const bizRef = doc(db, 'businesses', currentOrder.businessId);
          const bizSnap = await getDoc(bizRef);
          if (bizSnap.exists()) {
            const bizData = bizSnap.data();
            setBusinessInfo({
              name: bizData.businessName,
              communityName: bizData.communityName,
              image: bizData.logo || '',
              id: currentOrder.businessId
            });
          }
        }

        // fetch products by selectedProducts
        const selectedProductIds = currentOrder.selectedProducts || [];
        let fetchedProducts = [];
        if (selectedProductIds.length > 0) {
          const chunkSize = 10;
          for (let i = 0; i < selectedProductIds.length; i += chunkSize) {
            const chunk = selectedProductIds.slice(i, i + chunkSize);
            const productsQuery = query(
              collection(db, 'Products'),
              where('__name__', 'in', chunk)
            );
            const qs = await getDocs(productsQuery);
            const chunkProducts = qs.docs.map(d => {
              const p = d.data();
              const merchantP = p.merchantPrice != null ? Number(p.merchantPrice) : Number(p.price || 0);
              return {
                ...p,
                id: d.id,
                selectedOption: p.options && p.options.length > 0 ? p.options[0] : '',
                quantity: 0,
                uid: `${d.id}_${Math.random().toString(36).substr(2, 9)}`,
                stockAmount: p.stockAmount || 0,
                Owner_ID: p.Owner_ID,
                effectivePrice: merchantP,
                merchantPrice: merchantP
              };
            });
            fetchedProducts = [...fetchedProducts, ...chunkProducts];
          }
        }
        setProducts(fetchedProducts);
      } catch (e) {
        console.error('Error loading independent order:', e);
        navigate('/error');
      } finally {
        setLoading(false);
      }
    };
    fetchOrder();
  }, [orderFromNav, orderId, navigate, orderEnded]);

  const handleQuantityChange = (index, increment) => {
    setProducts(products.map((product, i) => {
      if (i === index) {
        return { ...product, quantity: increment ? product.quantity + 1 : Math.max(product.quantity - 1, 0) };
      }
      return product;
    }));
  };

  const handleOptionChange = (index, newOption) => {
    setProducts(products.map((product, i) => {
      if (i === index) {
        return { ...product, selectedOption: newOption };
      }
      return product;
    }));
  };

  const addToGlobalCart = (productIndex) => {
    // Require region selection for merchants
    if (!selectedRegion) {
      Swal.fire({ title: 'בחר אזור משלוח', text: 'אנא בחר אזור משלוח לפני הוספה לסל', icon: 'info', confirmButtonText: 'הבנתי' });
      return;
    }

    const product = products[productIndex];

    if (product.quantity <= 0) {
      Swal.fire({ title: 'אופס!', text: 'אנא בחר כמות גדולה מאפס', icon: 'warning', confirmButtonText: 'אישור' });
      return;
    }

    if (product.stockAmount !== undefined && product.quantity > product.stockAmount) {
      Swal.fire({ title: 'מלאי לא מספיק', text: `יש רק ${product.stockAmount} יחידות במלאי מתוך ${product.quantity} שביקשת`, icon: 'warning', confirmButtonText: 'אישור' });
      return;
    }

    // Always use merchant price for merchants
    const unitPrice = product.merchantPrice != null ? Number(product.merchantPrice) : Number(product.price);

    const item = {
      id: product.id,
      name: product.name,
      price: unitPrice,
      selectedOption: product.selectedOption,
      quantity: product.quantity,
      images: product.images || [],
      businessId: product.Owner_ID || order?.businessId,
      businessName: businessInfo.name,
      catalogNumber: product.catalogNumber,
      vatType: product.vatType ?? 3,
      stockAmount: product.stockAmount,
      uid: `${product.id}_${Math.random().toString(36).substr(2, 9)}`,
      // Add merchant-specific metadata
      isMerchantOrder: true,
      selectedRegion: selectedRegion,
      serviceRegions: order?.serviceRegions || [],
      merchantMinOrderTotal: Number(order?.merchantMinOrderTotal || 0)
    };

    // Add to global cart
    addItem(item, orderId, order?.businessId, 0); // No minimum for individual add

    const updated = [...products];
    updated[productIndex].quantity = 0;
    setProducts(updated);

    Swal.fire({ title: 'נוסף לסל!', text: `${product.name} נוסף לעגלת ההזמנה`, icon: 'success', timer: 1200, showConfirmButton: false });
  };


  const sliderSettings = {
    dots: true,
    infinite: true,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1
  };

  if (loading) return <LoadingSpinner />;

  if (orderEnded) {
    return (
      <div className="bg-gray-100 min-h-screen flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full text-center">
          <div className="text-red-500 text-5xl mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">ההזמנה הסתיימה</h2>
          <p className="text-gray-600 mb-6">דף ההזמנה הזה כבר אינו פעיל.</p>
          <button onClick={() => navigate('/')} className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md transition-colors">חזרה לדף הבית</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-md overflow-hidden mb-8">
          <div className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-xl font-bold text-gray-900">{order?.orderName || businessInfo.name}</h2>
              <span className="text-xs px-2 py-1 rounded-full bg-blue-600 text-white font-medium">הזמנת סוחר</span>
            </div>

            {order?.description && (
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <h3 className="text-md font-semibold text-gray-700 mb-2">פרטי ההזמנה:</h3>
                <p className="text-gray-600 whitespace-pre-line">{order.description}</p>
              </div>
            )}

            {/* Region selector for merchants */}
            <div className="mb-4 max-w-xs">
              <label className="block text-sm font-medium text-gray-700 mb-1">בחר אזור משלוח</label>
              <select
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
                className="block w-full p-2 pr-8 text-right text-sm bg-white border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500"
                dir="rtl"
              >
                <option value="">בחר אזור משלוח</option>
                {order?.serviceRegions?.map((region) => (
                  <option key={region} value={region}>{region}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">בחר את האזור אליו תרצה שנשלח את ההזמנה</p>
            </div>

            {/* Shipping Date and Merchant Minimum */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {order?.shippingDateRange && (
                <div className="flex items-center text-gray-700">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-2 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="font-medium">זמן אספקה:</span>&nbsp;
                  <span>
                    {new Date(order.shippingDateRange.start).toLocaleDateString('he-IL')} - {new Date(order.shippingDateRange.end).toLocaleDateString('he-IL')}
                  </span>
                </div>
              )}

              <div className="flex items-center text-gray-700">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-2 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium">
                  {Number(order?.merchantMinOrderTotal || 0) > 0
                    ? `סכום מינימום להזמנת סוחר: ₪${Number(order.merchantMinOrderTotal).toFixed(0)}`
                    : 'אין מינימום להזמנה'}
                </span>
              </div>
            </div>

            {/* Merchant Minimum Progress Bar */}
            {Number(order?.merchantMinOrderTotal || 0) > 0 && (
              <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-gray-700">התקדמות למינימום סוחר</span>
                  <span className="text-sm font-bold text-blue-600">
                    ₪{currentOrderTotal.toFixed(2)} / ₪{Number(order.merchantMinOrderTotal).toFixed(0)}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-300 ${
                      currentOrderTotal >= Number(order.merchantMinOrderTotal) 
                        ? 'bg-green-500' 
                        : 'bg-blue-500'
                    }`}
                    style={{ width: `${Math.min((currentOrderTotal / Number(order.merchantMinOrderTotal)) * 100, 100)}%` }}
                  />
                </div>
                {currentOrderTotal >= Number(order.merchantMinOrderTotal) ? (
                  <p className="text-xs text-green-700 mt-2 flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    הגעת למינימום! ניתן להמשיך לתשלום
                  </p>
                ) : (
                  <p className="text-xs text-blue-700 mt-2">
                    חסרים ₪{(Number(order.merchantMinOrderTotal) - currentOrderTotal).toFixed(2)} להשלמת המינימום
                  </p>
                )}
              </div>
            )}

            {/* Region Status Section */}
            <div className="mt-4">
              {!selectedRegion ? (
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <div className="flex items-center gap-2 text-blue-800 mb-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-semibold">בחר אזור משלוח</span>
                  </div>
                  <p className="text-blue-700 text-sm">אנא בחר את האזור אליו תרצה לקבל משלוח מהרשימה למעלה.</p>
                </div>
              ) : (
                <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                  <div className="flex items-center gap-2 text-green-800">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-semibold">משלוח לאזור {selectedRegion}</span>
                  </div>
                  <p className="text-green-700 text-sm mt-1">תוכל כעת להוסיף פריטים לסל ולהתקדם בהזמנה.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Products grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((product, index) => (
            <div key={product.id} className={`bg-white rounded-lg shadow-sm overflow-hidden ${product.stockAmount <= 0 ? 'opacity-60 grayscale' : ''}`}>
              <div className="flex border-b">
                <div className="relative h-32 w-32 flex-shrink-0 border-l">
                  {product.images && product.images.length > 0 ? (
                    product.images.length > 1 ? (
                      <div className="h-full">
                        <Slider {...sliderSettings} className="h-full">
                          {product.images.map((image, idx) => (
                            <div key={idx} className="h-32">
                              <img src={image} alt={`תמונה ${idx + 1} של ${product.name}`} className="w-full h-full object-contain" />
                            </div>
                          ))}
                        </Slider>
                      </div>
                    ) : (
                      <div className="h-full">
                        <img src={product.images[0]} alt={product.name} className="w-full h-full object-contain" />
                      </div>
                    )
                  ) : (
                    <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                      <span className="text-gray-400 text-sm">אין תמונה</span>
                    </div>
                  )}
                  {product.stockAmount <= 0 && (
                    <div className="absolute top-0 right-0 bg-red-500 text-white text-xs px-2 py-1 rounded-bl-md">אזל במלאי</div>
                  )}
                </div>

                <div className="flex-1 p-3">
                  <h3 className="text-base font-bold text-gray-900 mb-1">{product.name}</h3>
                  <p className="text-sm text-gray-500 mb-1">
                    ₪{(product.merchantPrice != null ? Number(product.merchantPrice) : Number(product.price)).toFixed(2)}
                    <span className="ml-2 text-xs text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded">מחיר סוחר</span>
                  </p>
                  <p className="text-xs text-gray-600 whitespace-pre-line">{product.description}</p>
                </div>
              </div>

              <div className="p-3 space-y-2">
                {product.options && product.options.length > 0 && (
                  <select
                    value={product.selectedOption}
                    onChange={(e) => handleOptionChange(index, e.target.value)}
                    className={`block w-full px-2 py-1.5 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500 ${product.stockAmount <= 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                    disabled={product.stockAmount <= 0}
                  >
                    <option value="" disabled>בחר אפשרות</option>
                    {product.options.map((option, idx) => (
                      <option key={idx} value={option}>{option}</option>
                    ))}
                  </select>
                )}

                <div className="flex items-center gap-2">
                  <div className={`flex items-center border border-gray-300 rounded-md overflow-hidden ${product.stockAmount <= 0 ? 'opacity-50' : ''}`}>
                    <button onClick={() => handleQuantityChange(index, false)} className="px-2 py-1 bg-gray-50 hover:bg-gray-100 text-gray-700" disabled={product.stockAmount <= 0}>-</button>
                    <span className="px-3 py-1 text-sm text-center min-w-[40px]">{product.quantity || 0}</span>
                    <button onClick={() => handleQuantityChange(index, true)} className="px-2 py-1 bg-gray-50 hover:bg-gray-100 text-gray-700" disabled={product.stockAmount <= 0 || (product.stockAmount !== undefined && product.quantity >= product.stockAmount)}>+</button>
                  </div>

                  <button 
                    onClick={() => addToGlobalCart(index)} 
                    disabled={product.stockAmount <= 0 || !selectedRegion} 
                    className={`flex-1 ${
                      product.stockAmount > 0 && selectedRegion 
                        ? 'bg-green-600 hover:bg-green-700' 
                        : 'bg-gray-400 cursor-not-allowed'
                    } text-white py-1.5 px-3 rounded-md text-sm font-medium flex items-center justify-center gap-1`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    {!selectedRegion ? 'בחר אזור' : product.stockAmount <= 0 ? 'אזל במלאי' : 'הוסף לסל'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

export default IndependentOrderFormMerchant;

