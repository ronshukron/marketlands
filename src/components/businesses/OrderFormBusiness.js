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
      businessName: businessInfo.name
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
    <div className="bg-gray-50 min-h-screen pb-16">
      {/* Business info and product list */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Business info */}
        {/* <div className="bg-white rounded-xl shadow-md overflow-hidden mb-8">
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
        </div> */}

        {/* Instructions */}
        <div className="bg-blue-50 border-r-4 border-blue-400 p-4 rounded-lg mb-8">
          <h4 className="font-bold text-blue-800 mb-2">הסבר שימוש</h4>
          <ul className="text-blue-700 text-sm space-y-1">
            <li>• בחר מוצר, אופציה וכמות</li>
            <li>• לחץ על הוסף לסל</li>
            <li>• לחץ עבור לסיכום הזמנה</li>
          </ul>
        </div>

        {/* Order Details Section */}
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
            
            {/* Shipping Date Range */}
            {orderDetails.shippingDateRange && (
              <div className="flex items-center text-gray-700 mb-3">
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

            {/* Pickup Spots */}
            {orderDetails.pickupSpots && orderDetails.pickupSpots.length > 0 && (
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-gray-800 mb-2">נקודות איסוף</h3>
                <div className="bg-gray-50 p-3 rounded-md">
                  <ul className="list-disc list-inside text-gray-700">
                    {orderDetails.pickupSpots.map((spot, index) => (
                      <li key={index}>{spot}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Products */}
        <div className="mt-8 space-y-6">
          {products.map((product, index) => (
            <div key={product.id} className="bg-white rounded-lg shadow-md overflow-hidden">
              <h3 className="text-lg font-bold text-gray-900 p-4 border-b">
                {product.name} - ₪{product.price}
              </h3>
              
              <div className="relative h-32">
                {product.images && product.images.length > 0 ? (
                  product.images.length > 1 ? (
                    <div className="product-carousel h-32">
                      <Slider {...settings} className="h-full">
                        {product.images.map((image, index) => (
                          <div key={index} className="h-32">
                            <img
                              src={image}
                              alt={`תמונה ${index + 1} של ${product.name}`}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ))}
                      </Slider>
                    </div>
                  ) : (
                    <div className="single-image-container h-32">
                      <img 
                        src={product.images[0]} 
                        alt={product.name}
                        className="w-full h-full object-cover object-center" 
                      />
                    </div>
                  )
                ) : (
                  <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                    <span className="text-gray-400 text-sm">אין תמונה</span>
                  </div>
                )}
              </div>
              
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
                  className="bg-blue-500 hover:bg-blue-600 text-white py-1.5 px-4 rounded-md shadow-sm transition-colors text-sm font-medium flex items-center gap-1"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  הוסף לסל
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default OrderFormBusiness;
