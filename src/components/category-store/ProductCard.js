import React, { useState, useMemo } from 'react';
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import Swal from 'sweetalert2';
import { useCart } from '../../contexts/CartContext';

const ProductCard = ({ product, calculateTimeRemaining }) => {
  const [quantity, setQuantity] = useState(1);
  const [selectedOption, setSelectedOption] = useState(
    product.options && product.options.length > 0 ? product.options[0] : ""
  );
  const { addItem, cartItems } = useCart();

  const quantityInCart = useMemo(() => {
    return cartItems
      .filter(item => item.id === product.id)
      .reduce((sum, item) => sum + item.quantity, 0);
  }, [cartItems, product.id]);

  const handleQuantityChange = (increment) => {
    if (increment) {
      // Check if the NEXT quantity would exceed stock
      const nextQuantity = quantity + 1;
      
      if (product.stockAmount && nextQuantity > product.stockAmount) {
        // Show popup when trying to exceed stock
        Swal.fire({
          title: 'הגעת למלאי המקסימלי',
          text: `יש רק ${product.stockAmount} יחידות זמינות במלאי`,
          icon: 'info',
          confirmButtonText: 'הבנתי',
          confirmButtonColor: '#3b82f6'
        });
        return; // Don't allow more than stock
      }
      
      setQuantity(nextQuantity);
    } else {
      setQuantity(Math.max(quantity - 1, 0));
    }
  };

  const addToCart = () => {
    if (quantity <= 0) {
      Swal.fire({
        title: 'אופס!',
        text: 'אנא בחר כמות גדולה מאפס',
        icon: 'warning',
        confirmButtonText: 'אישור'
      });
      return;
    }

    if (product.stockAmount !== undefined && quantity > product.stockAmount) {
      Swal.fire({
        title: 'מלאי לא מספיק',
        text: `יש רק ${product.stockAmount} יחידות במלאי מתוך ${quantity} שביקשת`,
        icon: 'warning',
        confirmButtonText: 'אישור'
      });
      return;
    }

    const productToAdd = {
      id: product.id,
      name: product.name,
      price: product.price,
      selectedOption: selectedOption,
      quantity: quantity,
      images: product.images || [],
      businessId: product.businessId,
      businessName: product.businessName,
      stockAmount: product.stockAmount,
      catalogNumber: product.catalogNumber,
      vatType: product.vatType ?? 3
    };

    addItem(
      productToAdd,
      product.orderId,
      product.businessId,
      0 // minimumOrderAmount - can be retrieved from order if needed
    );

    // Reset quantity to 1 instead of 0
    setQuantity(1);

    Swal.fire({
      title: 'נוסף לסל!',
      text: `${product.name} נוסף לסל הקניות שלך`,
      icon: 'success',
      timer: 1500,
      showConfirmButton: false
    });
  };

  const sliderSettings = {
    dots: true,
    infinite: true,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1
  };

  const isOutOfStock = product.stockAmount <= 0;

  return (
    <div className={`product-card bg-white rounded-md shadow-sm overflow-hidden ${isOutOfStock ? 'opacity-60 grayscale' : ''}`}>
      {/* Desktop Layout - Vertical with larger image */}
      <div className="hidden md:flex md:flex-col">
        {/* Product Image Section - Desktop */}
        <div className="relative h-56 w-full flex-shrink-0">
          {product.images && product.images.length > 0 ? (
            product.images.length > 1 ? (
              <div className="h-full">
                <Slider {...sliderSettings} className="h-full">
                  {product.images.map((image, index) => (
                    <div key={index} className="h-56">
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
              <div className="h-full">
                <img 
                  src={product.images[0]} 
                  alt={product.name}
                  className="w-full h-full object-cover" 
                />
              </div>
            )
          ) : (
            <div className="w-full h-full bg-gray-100 flex items-center justify-center">
              <span className="text-gray-400">אין תמונה</span>
            </div>
          )}
          
          {isOutOfStock && (
            <div className="absolute top-2 right-2 bg-red-500 text-white text-xs px-3 py-1 rounded-full shadow-lg">
              אזל במלאי
            </div>
          )}
          
          {!isOutOfStock && quantityInCart > 0 && (
            <div className="absolute top-2 left-2 bg-green-500 text-white text-xs px-3 py-1 rounded-full shadow-lg z-10 flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              בסל: {quantityInCart}
            </div>
          )}
        </div>

        {/* Product Info - Desktop */}
        <div className="flex-1 p-3">
          <h3 className="text-base font-bold text-gray-900 mb-1">
            {product.name}
          </h3>
          <p className="text-lg font-semibold text-blue-600 mb-1">₪{product.price}</p>
          <p className="text-xs text-gray-600 line-clamp-2 mb-2">{product.description}</p>
          
          {/* Farmer attribution */}
          <p className="text-xs text-blue-600 font-medium mb-1">
            מאת: {product.businessName} - {product.businessKind}
          </p>
          
          {/* Time remaining */}
          {calculateTimeRemaining && (
            <p className="text-[11px] text-red-600 font-medium">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 inline ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {calculateTimeRemaining(product)}
            </p>
          )}
        </div>
        
        {/* Controls Section - Desktop */}
        <div className="p-3 space-y-2 border-t">
          {/* Options Select - COMMENTED OUT for desktop */}
          {/* {product.options.length > 0 && (
            <select
              value={selectedOption}
              onChange={(e) => setSelectedOption(e.target.value)}
              className={`block w-full px-2 py-1.5 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 ${isOutOfStock ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={isOutOfStock}
            >
              <option value="" disabled>בחר אפשרות</option>
              {product.options.map((option, idx) => (
                <option key={idx} value={option}>{option}</option>
              ))}
            </select>
          )} */}
          
          {/* Quantity and Add to Cart */}
          <div className="flex items-center gap-2">
            <div className={`flex items-center border border-gray-300 rounded-md overflow-hidden ${isOutOfStock ? 'opacity-50' : ''}`}>
              <button 
                onClick={() => handleQuantityChange(false)}
                className="px-3 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 font-medium"
                disabled={isOutOfStock}
              >
                -
              </button>
              <span className="px-4 py-2 text-base text-center min-w-[50px] font-medium">
                {quantity}
              </span>
              <button 
                onClick={() => handleQuantityChange(true)}
                className="px-3 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 font-medium"
                disabled={isOutOfStock}
              >
                +
              </button>
            </div>
            
            <button
              onClick={addToCart}
              disabled={isOutOfStock}
              className={`flex-1 ${isOutOfStock ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600'} text-white py-2.5 px-4 rounded-md text-sm font-medium flex items-center justify-center gap-2`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              הוסף לסל
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Layout - Horizontal (original) */}
      <div className="md:hidden flex border-b">
        {/* Product Image Section - Mobile */}
        <div className="relative h-28 w-28 flex-shrink-0 border-l">
          {product.images && product.images.length > 0 ? (
            product.images.length > 1 ? (
              <div className="h-full">
                <Slider {...sliderSettings} className="h-full">
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
          
          {isOutOfStock && (
            <div className="absolute top-0 right-0 bg-red-500 text-white text-xs px-2 py-1 rounded-bl-md">
              אזל במלאי
            </div>
          )}
          
          {!isOutOfStock && quantityInCart > 0 && (
            <div className="absolute top-0 left-0 bg-green-500 text-white text-xs px-2 py-1 rounded-br-md shadow-sm flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              {quantityInCart} בסל
            </div>
          )}
        </div>

        {/* Product Info */}
        <div className="flex-1 p-2.5">
          <h3 className="text-sm font-bold text-gray-900 mb-0.5">
            {product.name}
          </h3>
          <p className="text-sm text-gray-500 mb-0.5">₪{product.price}</p>
          <p className="text-xs text-gray-600 line-clamp-2 mb-0.5">{product.description}</p>
          
          {/* Farmer attribution */}
          <p className="text-xs text-blue-600 font-medium">
            מאת: {product.businessName} - {product.businessKind}
          </p>
          
          {/* Time remaining */}
          {calculateTimeRemaining && (
            <p className="text-[11px] text-red-600 font-medium mt-0.5">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 inline ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {calculateTimeRemaining(product)}
            </p>
          )}
        </div>
      </div>
      
      {/* Controls Section - Mobile */}
      <div className="md:hidden p-2.5 space-y-1.5">
        {/* Options Select - COMMENTED OUT for mobile
        {product.options.length > 0 && (
          <select
            value={selectedOption}
            onChange={(e) => setSelectedOption(e.target.value)}
            className={`block w-full px-2 py-1.5 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 ${isOutOfStock ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={isOutOfStock}
          >
            <option value="" disabled>בחר אפשרות</option>
            {product.options.map((option, idx) => (
              <option key={idx} value={option}>{option}</option>
            ))}
          </select>
        )}
        */}
        
        {/* Quantity and Add to Cart */}
        <div className="flex items-center gap-2">
          <div className={`flex items-center border border-gray-300 rounded-md overflow-hidden ${isOutOfStock ? 'opacity-50' : ''}`}>
            <button 
              onClick={() => handleQuantityChange(false)}
              className="px-2 py-1 bg-gray-50 hover:bg-gray-100 text-gray-700"
              disabled={isOutOfStock}
            >
              -
            </button>
            <span className="px-2.5 py-1 text-sm text-center min-w-[34px]">
              {quantity}
            </span>
            <button 
              onClick={() => handleQuantityChange(true)}
              className="px-2 py-1 bg-gray-50 hover:bg-gray-100 text-gray-700"
              disabled={isOutOfStock}
            >
              +
            </button>
          </div>
          
          <button
            onClick={addToCart}
            disabled={isOutOfStock}
            className={`flex-1 ${isOutOfStock ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600'} text-white py-1.5 px-3 rounded-md text-sm font-medium flex items-center justify-center gap-1`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            הוסף לסל
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductCard;

