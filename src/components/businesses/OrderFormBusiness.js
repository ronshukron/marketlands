import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, getDocs, collection, query, where } from "firebase/firestore"; 
import { db } from '../../firebase/firebase'; 
import '../OrderForm.css';
import LoadingSpinner from '../LoadingSpinner';
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import Swal from 'sweetalert2';

const OrderFormBusiness = () => {
  const { orderId } = useParams();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [businessInfo, setBusinessInfo] = useState({});
  const [userName, setUserName] = useState('');
  const [nameValid, setNameValid] = useState(true);
  const [cartProducts, setCartProducts] = useState([]);
  const navigate = useNavigate();
  const isCartEmpty = cartProducts.length === 0;
  const [orderDetails, setOrderDetails] = useState({});
  const [orderEnded, setOrderEnded] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [minimumOrderAmount, setMinimumOrderAmount] = useState(0);


  useEffect(() => {
    const fetchOrderDetails = async () => {
      const orderDoc = doc(db, "Orders", orderId);
      const docSnap = await getDoc(orderDoc);

      if (docSnap.exists()) {
        const orderData = docSnap.data();
        setOrderDetails(orderData);
        setSelectedProductIds(orderData.selectedProducts || []);
        setMinimumOrderAmount(orderData.minimumOrderAmount || 0);

        if (orderData.endingTime) {
          const endingTime = orderData.endingTime.toDate();
          const currentTime = new Date();
          if (currentTime >= endingTime) {
            setOrderEnded(true);
          }
        }

        await fetchBusinessDetails(orderData.businessId, orderData.selectedProducts || []);
      } else {
        console.log("No such document!");
        navigate('/error');
      }
      setLoading(false);
    };

    fetchOrderDetails();
  }, [orderId, navigate]);

  const fetchBusinessDetails = async (businessId, selectedProductIds) => {
    const businessDoc = doc(db, "businesses", businessId);
    const businessSnap = await getDoc(businessDoc);
  
    if (businessSnap.exists()) {
      const businessData = businessSnap.data();
      setBusinessInfo({
        name: businessData.businessName,
        communityName : businessData.communityName,
        image: businessData.logo || '',
      });
  
      // Fetch only the selected products
      let fetchedProducts = [];
      if (selectedProductIds.length > 0) {
        const chunkSize = 10;
        const productChunks = [];
        for (let i = 0; i < selectedProductIds.length; i += chunkSize) {
          productChunks.push(selectedProductIds.slice(i, i + chunkSize));
        }

        for (const chunk of productChunks) {
          const productsQuery = query(
            collection(db, 'Products'),
            where('Owner_ID', '==', businessId),
            where('__name__', 'in', chunk)
          );

          const querySnapshot = await getDocs(productsQuery);

          const productsInChunk = querySnapshot.docs.map(doc => {
            const productData = doc.data();
            return {
              ...productData,
              selectedOption: productData.options && productData.options.length > 0 ? productData.options[0] : "",
              quantity: 0,
              uid: `${doc.id}_${Math.random().toString(36).substr(2, 9)}` // Use doc.id for uniqueness
            };
          });

          fetchedProducts = [...fetchedProducts, ...productsInChunk];
        }
      }

      setProducts(fetchedProducts);
  
    } else {
      console.log("Business document not found!");
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

  const removeFromCart = (uid) => {
    setCartProducts(cartProducts.filter(product => product.uid !== uid));
  };

  const addToCart = (productIndex) => {
    const productToAdd = products[productIndex];
    if (productToAdd.selectedOption === "") {
      Swal.fire({
        icon: 'error',
        title: 'בחר אפשרות למוצר',
        text: 'אנא בחר אפשרות לפני הוספה לסל הקניות',
        showConfirmButton: true,
        confirmButtonText: 'אישור',
        timer: 3000
      });
      return;
    }
    const newCartProduct = { ...productToAdd, uid: `${productToAdd.name}_${Math.random().toString(36).substr(2, 9)}` };
    if (productToAdd.quantity <= 0) {
      Swal.fire({
        icon: 'error',
        title: 'הוסיפו כמות גדולה מ-0',
        showConfirmButton: true,
        confirmButtonText: 'אישור',
        timer: 3000
      });
    } else {
      setCartProducts([...cartProducts, newCartProduct]);
      setProducts(products.map((product, i) => {
        if (i === productIndex) {
          return { ...product, quantity: 0 };
        }
        return product;
      }));
      Swal.fire({
        icon: 'success',
        title: 'המוצר נוסף בהצלחה לסל הקניות',
        showConfirmButton: true,
        confirmButtonText: 'אישור',
        timer: 3000
      });
    }
  };

  const checkIfOrderEnded = async () => {
    try {
      const orderDoc = doc(db, "Orders", orderId);
      const docSnap = await getDoc(orderDoc);

      if (docSnap.exists()) {
        const orderData = docSnap.data();
        if (orderData.Ending_Time) {
          const endingTime = orderData.Ending_Time.toDate();
          const currentTime = new Date();
          if (currentTime >= endingTime) {
            setOrderEnded(true);
            setCartProducts([]); // Clear the cart if necessary
            return true; // Order has ended
          }
        }
      } else {
        console.log("Order does not exist!");
        navigate('/error');
      }
    } catch (error) {
      console.error("Error checking if order has ended:", error);
    }
    return false; // Order has not ended
  };

  const handleSubmitOrder = async () => {
    const total = cartProducts.reduce((sum, item) => sum + item.price * item.quantity, 0);
    
    if (minimumOrderAmount > 0 && total < minimumOrderAmount) {
        Swal.fire({
            icon: 'error',
            title: 'סכום מינימום להזמנה',
            text: `סכום ההזמנה המינימלי הוא ${minimumOrderAmount}₪. סכום ההזמנה הנוכחי הוא ${total}₪`,
            confirmButtonText: 'הבנתי'
        });
        return;
    }

    const orderHasEnded = await checkIfOrderEnded();
    if (orderHasEnded) {
      Swal.fire({
        icon: 'error',
        title: 'ההזמנה הסתיימה',
        text: 'צר לנו, אבל זמן ההזמנה הזו כבר הסתיימה.',
        showConfirmButton: true,
        confirmButtonText: 'אישור',
        timer: 3000
      });
      return;
    }

    if (cartProducts.length === 0) {
      Swal.fire({
        icon: 'error',
        title: 'הסל שלך ריק',
        text: 'אנא הוסף מוצרים לסל הקניות לפני המעבר לדף הסיכום',
        showConfirmButton: true,
        confirmButtonText: 'אישור',
        timer: 3000
      });
      return;
    }

        // Fetch the order details to get the payment method
        const orderDoc = doc(db, "Orders", orderId);
        const docSnap = await getDoc(orderDoc);
        if (docSnap.exists()) {
          const orderData = docSnap.data();
          if (orderData.paymentMethod === 'free') {
            // Navigate to the new confirmation page for free payment method
            navigate('/order-confirmation-free', { state: { cartProducts, orderId } });
          } else {
            // Navigate to the regular confirmation page
            navigate('/order-confirmation', { state: { cartProducts, orderId } });
          }
        } else {
          console.log("Order does not exist!");
          navigate('/error');
        }

  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (orderEnded) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-10 text-center">
        <div className="bg-red-50 border border-red-200 rounded-lg p-8">
          <h1 className="text-2xl font-bold text-red-700 mb-4">ההזמנה הסתיימה</h1>
          <p className="text-gray-700">צר לנו, אבל זמן ההזמנה הזו כבר הסתיימה.</p>
        </div>
      </div>
    );
  }

  const settings = {
    dots: true,
    infinite: true,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1
  };

  return (
    <div dir="rtl" className="max-w-6xl mx-auto px-4 py-6 bg-gray-50">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-md overflow-hidden mb-8">
        <div className="md:flex">
          {businessInfo.image && (
            <div className="md:flex-shrink-0">
              <img 
                className="h-48 w-full object-cover md:w-48" 
                src={businessInfo.image} 
                alt={`Logo of ${businessInfo.name}`} 
              />
            </div>
          )}
          <div className="p-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              טופס הזמנה עבור {businessInfo.name}
            </h1>
            <div className="text-gray-600">
              <p><span className="font-medium">מיקום:</span> {businessInfo.communityName}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 border-r-4 border-blue-400 p-4 rounded-lg mb-8">
        <h4 className="font-bold text-blue-800 mb-2">הסבר שימוש</h4>
        <ul className="text-blue-700 text-sm space-y-1">
          <li>• בחר מוצר, אופציה וכמות</li>
          <li>• לחץ על הוסף לסל</li>
          <li>• לחץ עבור לסיכום הזמנה</li>
        </ul>
      </div>

      {/* Products */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {products.map((product, index) => (
          <div key={index} className="bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-shadow">
            <h3 className="text-lg font-bold text-gray-900 p-4 border-b">
              {product.name} - ₪{product.price}
            </h3>
            
            {product.images.length > 0 && (
              <div className="relative">
                <Slider {...settings}>
                  {product.images.map((image, idx) => (
                    <div key={idx}>
                      <div className="aspect-w-16 aspect-h-12">
                        <img 
                          src={image} 
                          alt={`Image ${idx + 1} for ${product.name}`} 
                          className="w-full h-48 object-cover"
                        />
                      </div>
                    </div>
                  ))}
                </Slider>
              </div>
            )}
            
            <div className="p-4">
              <p className="text-gray-600 text-sm mb-4">{product.description}</p>
              
              {product.options.length > 0 && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">בחר אפשרות:</label>
                  <select
                    value={product.selectedOption}
                    onChange={(e) => handleOptionChange(index, e.target.value)}
                    className="block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="" disabled>בחר אפשרות</option>
                    {product.options.map((option, idx) => (
                      <option key={idx} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
              )}
              
              <div className="flex items-center justify-between mb-4">
                <label className="block text-sm font-medium text-gray-700">כמות:</label>
                <div className="flex items-center border border-gray-300 rounded-md overflow-hidden">
                  <button 
                    onClick={() => handleQuantityChange(index, false)}
                    className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium text-lg"
                  >
                    -
                  </button>
                  <span className="px-4 py-1 text-center min-w-[40px]">
                    {product.quantity || 0}
                  </span>
                  <button 
                    onClick={() => handleQuantityChange(index, true)}
                    className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium text-lg"
                  >
                    +
                  </button>
                </div>
              </div>
              
              <button 
                onClick={() => addToCart(index)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md transition-colors duration-200 flex items-center justify-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M3 1a1 1 0 000 2h1.22l.305 1.222a.997.997 0 00.01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 000-2H6.414l1-1H14a1 1 0 00.894-.553l3-6A1 1 0 0017 3H6.28l-.31-1.243A1 1 0 005 1H3zM16 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM6.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
                </svg>
                הוסף לסל
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Submit Button */}
      {/* <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-20">
        <div className="max-w-6xl mx-auto">
          <button 
            onClick={handleSubmitOrder} 
            className="w-full bg-green-600 hover:bg-green-700 text-white py-3 px-6 rounded-lg shadow-md transition-colors duration-200 flex items-center justify-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            עבור לסיכום הזמנה וצפייה בסל הקניות שלך
          </button>
        </div>
      </div> */}

      {/* Floating Cart - Updated */}
      <div className={`fixed bottom-0 left-0 right-0 md:left-auto md:right-4 md:bottom-4 md:w-72 bg-white rounded-t-lg md:rounded-lg shadow-xl z-10 transition-all duration-300 transform ${isCartEmpty ? 'translate-y-[calc(100%-42px)]' : ''}`}>
        <div className="p-2 bg-gray-100 rounded-t-lg border-b border-gray-200 flex justify-between items-center cursor-pointer"
            onClick={() => setCartProducts(isCartEmpty ? [] : cartProducts)}>
          <h2 className="font-bold text-gray-800 flex items-center text-sm">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4zm-6 3a1 1 0 112 0 1 1 0 01-2 0zm7-1a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
            </svg>
            הסל שלי {!isCartEmpty && `(${cartProducts.length})`}
          </h2>
          <span className="text-gray-500 transform transition-transform duration-200">
            {isCartEmpty ? '▲' : '▼'}
          </span>
        </div>
        <div className="max-h-56 overflow-y-auto py-1 px-2">
          {cartProducts.length > 0 ? (
            <div className="space-y-1">
              {cartProducts.map((product) => (
                <div key={product.uid} className="flex justify-between items-center bg-gray-50 py-1 px-2 rounded text-sm">
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <span className="bg-blue-100 text-blue-800 rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">
                      {product.quantity}
                    </span>
                    <div className="truncate">
                      <span className="font-medium">{product.name}</span>
                      {product.selectedOption && <span className="text-xs text-gray-500"> ({product.selectedOption})</span>}
                    </div>
                  </div>
                  <div className="flex items-center ml-1">
                    <span className="text-xs text-gray-700 ml-1">
                      ₪{product.price * product.quantity}
                    </span>
                    <button 
                      className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded-full hover:bg-gray-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromCart(product.uid);
                      }}
                      title="הסר מוצר"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-3 text-gray-500">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mx-auto mb-1 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <p className="text-xs">הסל ריק</p>
            </div>
          )}
        </div>
        {!isCartEmpty && (
          <div className="p-2 border-t border-gray-200">
            <div className="flex justify-between text-sm font-medium mb-1 px-1">
              <span>סה״כ:</span>
              <span>₪{cartProducts.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2)}</span>
            </div>
            {minimumOrderAmount > 0 && (
                <div className="text-sm text-center mb-2">
                    <span className={cartProducts.reduce((sum, item) => sum + item.price * item.quantity, 0) < minimumOrderAmount ? 'text-red-600' : 'text-green-600'}>
                        {cartProducts.reduce((sum, item) => sum + item.price * item.quantity, 0) < minimumOrderAmount 
                            ? `סכום מינימום להזמנה: ${minimumOrderAmount}₪ (חסרים ${(minimumOrderAmount - cartProducts.reduce((sum, item) => sum + item.price * item.quantity, 0)).toFixed(2)}₪)`
                            : `✓ עברת את סכום המינימום להזמנה (${minimumOrderAmount}₪)`
                        }
                    </span>
                </div>
            )}
            <button 
              className="w-full bg-green-600 hover:bg-green-700 text-white py-1.5 px-4 rounded transition-colors duration-200 text-sm font-medium"
              onClick={handleSubmitOrder}
            >
              לסיכום הזמנה
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderFormBusiness;
