import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import ThresholdProgressBar from './components/ThresholdProgressBar';
import FloatingCart from './components/FloatingCart';
import LoadingSpinner from '../LoadingSpinner';
import Slider from 'react-slick';
import 'slick-carousel/slick/slick.css';
import 'slick-carousel/slick/slick-theme.css';
import Swal from 'sweetalert2';

const IndependentOrderForm = () => {
  const { orderId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const orderFromNav = useMemo(() => location.state?.order || null, [location.state]);

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState(orderFromNav);
  const [businessInfo, setBusinessInfo] = useState({});
  const [products, setProducts] = useState([]);
  const [orderEnded, setOrderEnded] = useState(false);
  const [hasVolunteer, setHasVolunteer] = useState(false);
  const [checkingVolunteer, setCheckingVolunteer] = useState(true);

  // Local, ephemeral cart
  const [cartItems, setCartItems] = useState([]);

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

        if (currentOrder.shippingDateRange && currentOrder.shippingDateRange.end) {
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
              return {
                ...p,
                id: d.id,
                selectedOption: p.options && p.options.length > 0 ? p.options[0] : '',
                quantity: 0,
                uid: `${d.id}_${Math.random().toString(36).substr(2, 9)}`,
                stockAmount: p.stockAmount || 0,
                Owner_ID: p.Owner_ID
              };
            });
            fetchedProducts = [...fetchedProducts, ...chunkProducts];
          }
        }
        setProducts(fetchedProducts);

        // Check for volunteers
        await checkVolunteers(orderId);
      } catch (e) {
        console.error('Error loading independent order:', e);
        navigate('/error');
      } finally {
        setLoading(false);
      }
    };
    fetchOrder();
  }, [orderFromNav, orderId, navigate]);

  const checkVolunteers = async (orderId) => {
    try {
      setCheckingVolunteer(true);
      // Check volunteers collection for this orderId
      const volunteersQuery = query(
        collection(db, 'volunteers'),
        where('orderId', '==', orderId)
      );
      const volunteersSnap = await getDocs(volunteersQuery);
      setHasVolunteer(!volunteersSnap.empty);
    } catch (error) {
      console.error('Error checking volunteers:', error);
      setHasVolunteer(false);
    } finally {
      setCheckingVolunteer(false);
    }
  };

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

  const addToLocalCart = (productIndex) => {
    // Check if volunteer exists before allowing cart actions
    if (!hasVolunteer) {
      Swal.fire({ 
        title: 'אין מתנדב זמין', 
        text: 'נדרש מתנדב לנקודת איסוף לפני שניתן להוסיף פריטים לסל', 
        icon: 'warning', 
        confirmButtonText: 'הבנתי' 
      });
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

    const item = {
      id: product.id,
      name: product.name,
      price: product.price,
      selectedOption: product.selectedOption,
      quantity: product.quantity,
      images: product.images || [],
      businessId: product.Owner_ID || order?.businessId,
      businessName: businessInfo.name,
      catalogNumber: product.catalogNumber,
      vatType: product.vatType ?? 3
    };

    setCartItems((prev) => {
      const existingIdx = prev.findIndex((x) => x.id === item.id && x.selectedOption === item.selectedOption);
      if (existingIdx >= 0) {
        const next = [...prev];
        next[existingIdx] = { ...next[existingIdx], quantity: next[existingIdx].quantity + item.quantity };
        return next;
      }
      return [...prev, item];
    });

    const updated = [...products];
    updated[productIndex].quantity = 0;
    setProducts(updated);

    Swal.fire({ title: 'נוסף לסל!', text: `${product.name} נוסף לעגלת ההזמנה`, icon: 'success', timer: 1200, showConfirmButton: false });
  };

  const updateCartItemQuantity = (item, newQuantity) => {
    if (newQuantity <= 0) {
      removeCartItem(item);
      return;
    }
    
    setCartItems((prev) => prev.map((cartItem) => 
      cartItem.id === item.id && cartItem.selectedOption === item.selectedOption
        ? { ...cartItem, quantity: newQuantity }
        : cartItem
    ));
  };

  const removeCartItem = (item) => {
    setCartItems((prev) => prev.filter((cartItem) => 
      !(cartItem.id === item.id && cartItem.selectedOption === item.selectedOption)
    ));
  };

  const cartTotal = useMemo(() => cartItems.reduce((sum, i) => sum + i.price * i.quantity, 0), [cartItems]);

  const goToPayment = () => {
    if (cartItems.length === 0) {
      Swal.fire({ icon: 'warning', title: 'העגלה ריקה', text: 'בחר פריטים לפני המעבר לתשלום' });
      return;
    }
    navigate('/order-confirmation-independent', {
      state: {
        orderId,
        orderName: order?.orderName,
        items: cartItems,
        total: cartTotal
      }
    });
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

  const minCommunityTotal = Number(order?.minCommunityTotal || 0);
  const thresholdDeadline = order?.thresholdDeadline;
  const currentTotal = 0; // TODO: aggregate per community

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-md overflow-hidden mb-8">
          <div className="p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">{order?.orderName || businessInfo.name}</h2>

            {order?.description && (
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <h3 className="text-md font-semibold text-gray-700 mb-2">פרטי ההזמנה:</h3>
                <p className="text-gray-600 whitespace-pre-line">{order.description}</p>
              </div>
            )}

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

              <div>
                <ThresholdProgressBar
                  minCommunityTotal={minCommunityTotal}
                  currentTotal={currentTotal}
                  thresholdDeadline={thresholdDeadline}
                />
              </div>
            </div>

            {/* Volunteer Status Section */}
            <div className="mt-4">
              {checkingVolunteer ? (
                <div className="flex items-center gap-2 text-gray-600">
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  בודק זמינות מתנדבים...
                </div>
              ) : hasVolunteer ? (
                <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                  <div className="flex items-center gap-2 text-green-800">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-semibold">יש מתנדב לנקודת איסוף!</span>
                  </div>
                  <p className="text-green-700 text-sm mt-1">תוכל כעת להוסיף פריטים לסל ולהתקדם בהזמנה.</p>
                </div>
              ) : (
                <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                  <div className="flex items-center gap-2 text-orange-800 mb-3">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <span className="font-semibold">ממתין למתנדב לנקודת איסוף</span>
                  </div>
                  <p className="text-orange-700 text-sm mb-3">
                    כדי שניתן יהיה להזמין, נדרש מתנדב מהקהילה שלך שיארח נקודת איסוף. לא ניתן להוסיף פריטים לסל עד שיימצא מתנדב.
                  </p>
                  <Link 
                    to={`/independent/volunteer/${orderId}`} 
                    className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md text-sm font-medium transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                    </svg>
                    התנדב לארח נקודת איסוף
                  </Link>
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
                  <p className="text-sm text-gray-500 mb-1">₪{product.price}</p>
                  <p className="text-xs text-gray-600 line-clamp-2">{product.description}</p>
                </div>
              </div>

              <div className="p-3 space-y-2">
                {product.options && product.options.length > 0 && (
                  <select
                    value={product.selectedOption}
                    onChange={(e) => handleOptionChange(index, e.target.value)}
                    className={`block w-full px-2 py-1.5 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 ${product.stockAmount <= 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                    onClick={() => addToLocalCart(index)} 
                    disabled={product.stockAmount <= 0 || !hasVolunteer} 
                    className={`flex-1 ${
                      product.stockAmount > 0 && hasVolunteer 
                        ? 'bg-blue-500 hover:bg-blue-600' 
                        : 'bg-gray-400 cursor-not-allowed'
                    } text-white py-1.5 px-3 rounded-md text-sm font-medium flex items-center justify-center gap-1`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    {!hasVolunteer ? 'ממתין למתנדב' : product.stockAmount <= 0 ? 'אזל במלאי' : 'הוסף לסל'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Floating cart */}
      <FloatingCart 
        items={cartItems}
        onUpdateQuantity={updateCartItemQuantity}
        onRemoveItem={removeCartItem}
        onGoToPayment={goToPayment}
      />
    </div>
  );
};

export default IndependentOrderForm; 