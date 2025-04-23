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
import { useCart } from '../../contexts/CartContext'; // Import useCart

const OrderFormBusiness = () => {
  const { orderId } = useParams();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [businessInfo, setBusinessInfo] = useState({});
  const [orderDetails, setOrderDetails] = useState({});
  const [orderEnded, setOrderEnded] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [minimumOrderAmount, setMinimumOrderAmount] = useState(0);
  const navigate = useNavigate();

  // Get cart functions from context
  const { addItem, cartItems, cartTotal } = useCart(); 

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
        id: businessId
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
              id: doc.id,
              selectedOption: productData.options && productData.options.length > 0 ? productData.options[0] : "",
              quantity: 0,
              uid: `${doc.id}_${Math.random().toString(36).substr(2, 9)}`, // Use doc.id for uniqueness
              stockAmount: productData.stockAmount || 0 // Get the stock amount or default to 0
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

  const addToCart = (productIndex) => {
    const product = products[productIndex];
    
    if (product.quantity <= 0) {
      Swal.fire({
        title: 'אופס!',
        text: 'אנא בחר כמות גדולה מאפס',
        icon: 'warning',
        confirmButtonText: 'אישור'
      });
      return;
    }

    // Check if requested quantity exceeds available stock
    if (product.stockAmount !== undefined && product.quantity > product.stockAmount) {
      Swal.fire({
        title: 'מלאי לא מספיק',
        text: `יש רק ${product.stockAmount} יחידות במלאי מתוך ${product.quantity} שביקשת`,
        icon: 'warning',
        confirmButtonText: 'אישור'
      });
      return;
    }
    
    console.log('product', product);
    // Create a copy of the product to avoid reference issues
    const productToAdd = {
      id: product.id,
      name: product.name,
      price: product.price,
      selectedOption: product.selectedOption,
      quantity: product.quantity,
      images: product.images || [],
      businessId: product.Owner_ID,
      businessName: businessInfo.name,
      stockAmount: product.stockAmount // Include the stock amount in the cart item
    };
    console.log('productToAdd', productToAdd);
    // Add to global cart only
    addItem(
      productToAdd,
      orderId,
      businessInfo.id,
      minimumOrderAmount
    );

    // Reset product quantity to 0
    const updatedProducts = [...products];
    updatedProducts[productIndex].quantity = 0;
    setProducts(updatedProducts);

    // Show success message
    Swal.fire({
      title: 'נוסף לסל!',
      text: `${product.name} נוסף לסל הקניות שלך`,
      icon: 'success',
      timer: 1500,
      showConfirmButton: false
    });
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

  if (loading) {
    return <LoadingSpinner />;
  }

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
          <p className="text-gray-600 mb-6">
            דף ההזמנה הזה כבר אינו פעיל.
          </p>
          <button 
            onClick={() => navigate('/')}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md transition-colors"
          >
            חזרה לדף הבית
          </button>
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
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {loading ? (
        <LoadingSpinner />
      ) : (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Order header section */}
          <div className="bg-white rounded-xl shadow-md overflow-hidden mb-8">
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                {businessInfo.name}
              </h2>
              
              {/* Description if available */}
              {orderDetails.description && (
                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <h3 className="text-md font-semibold text-gray-700 mb-2">פרטי ההזמנה:</h3>
                  <p className="text-gray-600 whitespace-pre-line">{orderDetails.description}</p>
                </div>
              )}
              
              {/* Order details in a grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Shipping Date Range */}
                {orderDetails.shippingDateRange && (
                  <div className="flex items-center text-gray-700">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-2 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="font-medium">זמן אספקה:</span>&nbsp;
                    <span>
                      {new Date(orderDetails.shippingDateRange.start).toLocaleDateString('he-IL')} - {new Date(orderDetails.shippingDateRange.end).toLocaleDateString('he-IL')}
                    </span>
                  </div>
                )}
                
                {/* Minimum Order Amount if set */}
                {minimumOrderAmount > 0 && (
                  <div className="flex items-center text-gray-700">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-2 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-medium">סכום מינימום להזמנה:</span>&nbsp;
                    <span>{minimumOrderAmount}₪</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Products Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((product, index) => (
              <div key={product.id} className={`bg-white rounded-lg shadow-sm overflow-hidden ${product.stockAmount <= 0 ? 'opacity-60 grayscale' : ''}`}>
                <div className="flex border-b">
                  {/* Product Image Section - Smaller Fixed Height */}
                  <div className="relative h-32 w-32 flex-shrink-0 border-l">
                    {product.images && product.images.length > 0 ? (
                      product.images.length > 1 ? (
                        <div className="h-full">
                          <Slider {...settings} className="h-full">
                            {product.images.map((image, index) => (
                              <div key={index} className="h-32">
                                <img
                                  src={image}
                                  alt={`תמונה ${index + 1} של ${product.name}`}
                                  className="w-full h-full object-contain"
                                />
                              </div>
                            ))}
                          </Slider>
                        </div>
                      ) : (
                        <div className="h-full">
                          <img 
                            src={product.images[0]} 
                            alt={product.name}
                            className="w-full h-full object-contain" 
                          />
                        </div>
                      )
                    ) : (
                      <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                        <span className="text-gray-400 text-sm">אין תמונה</span>
                      </div>
                    )}
                    
                    {/* Add stock badge */}
                    {product.stockAmount <= 0 && (
                      <div className="absolute top-0 right-0 bg-red-500 text-white text-xs px-2 py-1 rounded-bl-md">
                        אזל במלאי
                      </div>
                    )}
                  </div>

                  {/* Product Info */}
                  <div className="flex-1 p-3">
                    <h3 className="text-base font-bold text-gray-900 mb-1">
                      {product.name}
                    </h3>
                    <p className="text-sm text-gray-500 mb-1">₪{product.price}</p>
                    <p className="text-xs text-gray-600 line-clamp-2">{product.description}</p>
                    
                    {/* Display stock amount */}
                    {/* <p className={`text-xs mt-1 ${product.stockAmount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {product.stockAmount > 0 ? `במלאי: ${product.stockAmount}` : 'אזל המלאי'}
                    </p> */}
                  </div>
                </div>
                
                {/* Disable inputs if out of stock */}
                <div className="p-3 space-y-2">
                  {/* Options Select */}
                  {product.options.length > 0 && (
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
                  
                  {/* Quantity and Add to Cart */}
                  <div className="flex items-center gap-2">
                    <div className={`flex items-center border border-gray-300 rounded-md overflow-hidden ${product.stockAmount <= 0 ? 'opacity-50' : ''}`}>
                      <button 
                        onClick={() => handleQuantityChange(index, false)}
                        className="px-2 py-1 bg-gray-50 hover:bg-gray-100 text-gray-700"
                        disabled={product.stockAmount <= 0}
                      >
                        -
                      </button>
                      <span className="px-3 py-1 text-sm text-center min-w-[40px]">
                        {product.quantity || 0}
                      </span>
                      <button 
                        onClick={() => handleQuantityChange(index, true)}
                        className="px-2 py-1 bg-gray-50 hover:bg-gray-100 text-gray-700"
                        disabled={product.stockAmount <= 0 || (product.stockAmount !== undefined && product.quantity >= product.stockAmount)}
                      >
                        +
                      </button>
                    </div>
                    
                    <button
                      onClick={() => addToCart(index)}
                      disabled={product.stockAmount <= 0}
                      className={`flex-1 ${product.stockAmount > 0 ? 'bg-blue-500 hover:bg-blue-600' : 'bg-gray-400 cursor-not-allowed'} text-white py-1.5 px-3 rounded-md text-sm font-medium flex items-center justify-center gap-1`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      הוסף לסל
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderFormBusiness;
