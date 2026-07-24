import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/authContext';
import { getCheckoutRoute } from '../services/paymentConfigService';
import { saveCart } from '../services/savedCartService';
import Swal from 'sweetalert2';
import { getEstimatedChargeableQuantity } from '../utils/pricing';

const Cart = ({ isOpen, onClose }) => {
  const { cartItems, removeItem, removeBasketInstance, updateQuantity, cartTotal, totalItems, getCartSnapshot } = useCart();
  const { userLoggedIn, currentUser } = useAuth();
  const navigate = useNavigate();
  const [checkingRoute, setCheckingRoute] = useState(false);
  const [savingCart, setSavingCart] = useState(false);

  // Helper functions for formatting quantities
  // measurementType: 'kg' | 'unit' | 'package'
  const formatQuantity = (qty, measurementType) => {
    if (measurementType === 'kg') {
      return qty % 1 === 0 ? qty.toString() : qty.toFixed(1);
    }
    return Math.round(qty).toString();
  };

  const formatQuantityWithUnit = (qty, measurementType) => {
    if (measurementType === 'kg') {
      return `${formatQuantity(qty, 'kg')} ק"ג`;
    }
    if (measurementType === 'unit') {
      return `${Math.round(qty)} יח'`;
    }
    // package
    return `${Math.round(qty)} מארז`;
  };

  const handleSaveCart = async () => {
    if (!userLoggedIn || !currentUser?.uid) return;
    if (cartItems.length === 0) {
      Swal.fire('הסל ריק', 'אין מה לשמור.', 'warning');
      return;
    }

    const { value: name } = await Swal.fire({
      title: 'שמירת סל',
      input: 'text',
      inputLabel: 'שם לסל',
      inputPlaceholder: 'למשל: קניות שבועיות',
      showCancelButton: true,
      confirmButtonText: 'שמור',
      cancelButtonText: 'ביטול',
      inputValidator: (value) => {
        if (!value || !value.trim()) return 'יש להזין שם לסל';
        return undefined;
      },
    });

    if (!name) return;

    setSavingCart(true);
    try {
      const snapshot = getCartSnapshot();
      const pickupSpot = localStorage.getItem('selectedPickupSpot') || '';
      await saveCart(currentUser.uid, {
        name: name.trim(),
        cartItems: snapshot.cartItems,
        orderInfoMap: snapshot.orderInfoMap,
        pickupSpot,
        itemCount: totalItems,
        estimatedTotal: cartTotal,
      });
      Swal.fire({
        title: 'נשמר!',
        text: `הסל "${name.trim()}" נשמר בהצלחה`,
        icon: 'success',
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (error) {
      if (error.message === 'LIMIT_REACHED') {
        Swal.fire('מגבלה', 'ניתן לשמור עד 10 סלים. מחקו סל ישן כדי לשמור חדש.', 'warning');
      } else {
        Swal.fire('שגיאה', 'לא ניתן לשמור את הסל. נסו שוב מאוחר יותר.', 'error');
      }
    } finally {
      setSavingCart(false);
    }
  };

  const handleCheckout = async () => {
    if (cartItems.length === 0) {
      Swal.fire('הסל ריק', 'אנא הוסף פריטים לסל לפני המעבר לתשלום.', 'warning');
      return;
    }

    setCheckingRoute(true);
    try {
      // Get the selected pickup spot from localStorage (set in CategoryStore)
      const selectedPickupSpot = localStorage.getItem('selectedPickupSpot') || '';
      
      // Determine the correct checkout route based on pickup spot configuration
      const checkoutRoute = await getCheckoutRoute(selectedPickupSpot);
      
      navigate(checkoutRoute, {
        state: {
          cartProducts: cartItems,
        },
      });
      onClose();
    } catch (error) {
      console.error('Error determining checkout route:', error);
      // Default to regular checkout on error
      navigate('/order-confirmation', {
        state: {
          cartProducts: cartItems,
        },
      });
      onClose();
    } finally {
      setCheckingRoute(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity duration-200"
      onClick={onClose}
    >
      <div
        className="fixed top-0 right-0 h-full w-full max-w-sm bg-white shadow-xl z-50 transform transition-all duration-300 flex flex-col"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header with improved close button */}
        <div className="flex justify-between items-center p-3 border-b border-gray-100">
          <h2 className="text-base font-medium text-gray-800 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            סל הקניות
          </h2>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full text-white-600 hover:bg-gray-100 transition-colors"
            aria-label="סגור סל"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="2 2 20 20" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Cart Items - More compact and elegant */}
        <div className="flex-grow overflow-y-auto">
          <div className="p-2">
            {/* Cart Items */}
            {cartItems.length === 0 ? (
              <div className="text-center text-gray-500 py-6 px-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mx-auto mb-1 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <p className="text-xs">הסל שלך ריק</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {cartItems.map((item) => {
                  const measurementType = item.measurementType || 'kg';
                  const isKgItem = measurementType === 'kg';
                  const isUnitItem = measurementType === 'unit';
                  const isPackageItem = measurementType === 'package';
                  const isBasketLine = Boolean(item.basketInstanceId);
                  const isBasketAdjustment = item.isBasketAdjustment === true;
                  const unitSize = item.unitSize || 1;
                  const step = isKgItem ? unitSize : 1;
                  const estimatedChargeKg = isUnitItem ? getEstimatedChargeableQuantity(item) : 0;
                  
                  return (
                  <div key={item.uid} className="flex items-center py-2 px-2 hover:bg-gray-50 transition-colors">
                    {/* Smaller product image */}
                    <div className="flex-shrink-0 ml-3">
                      {item.images && item.images.length > 0 ? (
                        <img 
                          src={item.images[0]} 
                          alt={item.name} 
                          className="w-12 h-12 object-cover rounded-md border border-gray-100 shadow-sm" 
                        />
                      ) : (
                        <div className="w-12 h-12 bg-gray-100 rounded-md flex items-center justify-center">
                          <span className="text-gray-400 text-xs">אין תמונה</span>
                        </div>
                      )}
                    </div>
                    
                    {/* Product details - More compact layout */}
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-gray-800 truncate leading-tight">{item.name}</h4>
                      {isBasketLine && (
                        <p className="text-[10px] text-emerald-700 font-semibold mt-0.5 truncate">
                          חלק מ{item.basketTitle || 'סל היכרות'}
                        </p>
                      )}
                      {item.selectedOption && (
                        <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                          {item.selectedOption}
                        </p>
                      )}
                      <p className={`text-[11px] font-medium mt-0.5 ${isBasketAdjustment ? 'text-emerald-700' : 'text-blue-600'}`}>
                        {isBasketAdjustment && Number(item.price) < 0 ? '-' : ''}
                        ₪{Math.abs(Number(item.price) || 0).toFixed(2)}
                        {!isBasketAdjustment && isKgItem && '/ק"ג'}
                        {!isBasketAdjustment && isUnitItem && '/ק"ג'}
                        {!isBasketAdjustment && isPackageItem && '/מארז'}
                      </p>
                      {item.quantityDiscountApplied && (
                        <p className="text-[10px] font-semibold text-emerald-700 mt-0.5">
                          הנחת כמות הופעלה
                          {Number(item.basePrice) > Number(item.effectivePrice) && (
                            <span className="text-gray-400 font-normal mr-1 line-through">
                              ₪{Number(item.basePrice).toFixed(2)}
                            </span>
                          )}
                        </p>
                      )}
                      {isUnitItem && !isBasketAdjustment && (
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          הערכת חיוב: ~{estimatedChargeKg.toFixed(2)} ק"ג
                        </p>
                      )}
                    </div>
                    
                    {/* Improved quantity controls with more visible icons */}
                    {isBasketLine ? (
                      <div className="mr-1 min-w-[72px] text-center">
                        <span className="inline-flex rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                          {isBasketAdjustment ? 'התאמה' : formatQuantityWithUnit(item.quantity, measurementType)}
                        </span>
                      </div>
                    ) : (
                    <div className="flex items-center space-x-1 space-x-reverse mr-1">
                      <button 
                        onClick={() => {
                          const newQty = Math.round((item.quantity - step) * 1000) / 1000;
                          updateQuantity(item.uid, Math.max(0, newQty));
                        }} 
                        className="text-white-100 hover:bg-gray-100 transition-colors w-8 h-7 rounded-full flex items-center justify-center border border-gray-200"
                        aria-label="הפחת כמות"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" viewBox="5 0 10 20" fill="currentColor">
                          <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                        </svg>
                      </button>
                      <span className="text-[11px] font-medium text-gray-700 min-w-[40px] text-center">
                        {formatQuantityWithUnit(item.quantity, measurementType)}
                      </span>
                      <button 
                        onClick={() => {
                          const newQty = Math.round((item.quantity + step) * 1000) / 1000;
                          updateQuantity(item.uid, newQty);
                        }} 
                        className="text-white-600 hover:bg-gray-100 transition-colors w-8 h-7 rounded-full flex items-center justify-center border border-gray-200"
                        aria-label="הוסף כמות"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" viewBox="5 0 10 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                    )}
                    
                    {/* Improved delete button with more visible icon */}
                    <button
                      onClick={() => {
                        if (item.basketInstanceId) {
                          removeBasketInstance(item.basketInstanceId);
                        } else {
                          removeItem(item.uid);
                        }
                      }}
                      className="flex-shrink-0 w-10 h-9 flex items-center justify-center rounded-full bg-red-50 text-red-500 hover:bg-red-100 transition-colors ml-1 mr-3"
                      title={item.basketInstanceId ? 'הסר את סל ההיכרות' : 'הסר פריט'}
                      aria-label={item.basketInstanceId ? 'הסר את סל ההיכרות' : 'הסר פריט'}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="5 0 10 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer - Cleaner and more elegant */}
        {cartItems.length > 0 && (
          <div className="p-2 border-t border-gray-100 bg-white shadow-inner">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-medium text-gray-800">סה"כ לתשלום:</span>
              <span className="text-xs font-semibold text-blue-600">₪{cartTotal.toFixed(2)}</span>
            </div>
            <div className="mt-4 pb-16 md:pb-5 space-y-2">
              {userLoggedIn && (
                <button
                  type="button"
                  onClick={handleSaveCart}
                  disabled={savingCart}
                  className="w-full bg-white text-blue-700 border border-blue-300 py-2.5 px-3 rounded-lg text-sm font-medium hover:bg-blue-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {savingCart ? 'שומר...' : 'שמור סל'}
                </button>
              )}
              <button
                onClick={handleCheckout}
                disabled={checkingRoute}
                className="w-full bg-blue-600 text-white py-2.5 px-3 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {checkingRoute ? 'מעבר לתשלום...' : `לתשלום (${cartTotal.toFixed(2)} ₪)`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Cart; 