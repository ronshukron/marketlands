import React, { createContext, useState, useContext, useMemo, useEffect } from 'react';
import { useSaleMode } from './SaleModeContext';

// Create a new React Context for managing cart state.
// This context will hold the cart items, order information, and functions to manipulate them.
const CartContext = createContext();

// Custom hook to easily access the CartContext values in consuming components.
// It simplifies the usage from `useContext(CartContext)` to just `useCart()`.
export const useCart = () => useContext(CartContext);

const STORAGE_KEY_CART = 'cartItemsByMode';
const STORAGE_KEY_INFO = 'orderInfoByMode';

const emptyByMode = () => ({ weekly: [], independent: [] });
const emptyInfoByMode = () => ({ weekly: {}, independent: {} });

// CartProvider component wraps parts of the application that need access to cart state.
// It manages the cart's state and provides it down the component tree via CartContext.
export const CartProvider = ({ children }) => {
  const { saleMode } = useSaleMode();

  // Per-mode cart items and order info
  const [cartItemsByMode, setCartItemsByMode] = useState(emptyByMode());
  const [orderInfoByMode, setOrderInfoByMode] = useState(emptyInfoByMode());

  // Flag to track whether we've loaded from localStorage yet
  const [hasLoadedFromStorage, setHasLoadedFromStorage] = useState(false);

  // Load cart data from localStorage on component mount
  useEffect(() => {
    try {
      const savedByMode = localStorage.getItem(STORAGE_KEY_CART);
      const savedInfoByMode = localStorage.getItem(STORAGE_KEY_INFO);

      if (savedByMode && savedInfoByMode) {
        const parsedCartByMode = JSON.parse(savedByMode);
        const parsedInfoByMode = JSON.parse(savedInfoByMode);
        setCartItemsByMode({ weekly: parsedCartByMode.weekly || [], independent: parsedCartByMode.independent || [] });
        setOrderInfoByMode({ weekly: parsedInfoByMode.weekly || {}, independent: parsedInfoByMode.independent || {} });
      } else {
        // Migrate legacy storage if present
        const legacyItems = localStorage.getItem('cartItems');
        const legacyInfo = localStorage.getItem('orderInfoMap');
        const weeklyItems = legacyItems ? JSON.parse(legacyItems) : [];
        const weeklyInfo = legacyInfo ? JSON.parse(legacyInfo) : {};
        setCartItemsByMode({ weekly: weeklyItems, independent: [] });
        setOrderInfoByMode({ weekly: weeklyInfo, independent: {} });
        // Clear legacy keys after migration
        localStorage.removeItem('cartItems');
        localStorage.removeItem('orderInfoMap');
      }
    } catch (error) {
      console.error('Error loading cart from localStorage:', error);
      localStorage.removeItem(STORAGE_KEY_CART);
      localStorage.removeItem(STORAGE_KEY_INFO);
      setCartItemsByMode(emptyByMode());
      setOrderInfoByMode(emptyInfoByMode());
    }

    // Mark that we've completed the initial load
    setHasLoadedFromStorage(true);
  }, []);

  // Save per-mode cart to localStorage when changes occur (post-initial-load)
  useEffect(() => {
    if (!hasLoadedFromStorage) return;
    try {
      localStorage.setItem(STORAGE_KEY_CART, JSON.stringify(cartItemsByMode));
    } catch (error) {
      console.error('Error saving cart items to localStorage:', error);
    }
  }, [cartItemsByMode, hasLoadedFromStorage]);

  // Save per-mode order info to localStorage
  useEffect(() => {
    if (!hasLoadedFromStorage) return;
    try {
      localStorage.setItem(STORAGE_KEY_INFO, JSON.stringify(orderInfoByMode));
    } catch (error) {
      console.error('Error saving order info to localStorage:', error);
    }
  }, [orderInfoByMode, hasLoadedFromStorage]);

  // Active mode views
  const cartItems = useMemo(() => cartItemsByMode[saleMode] || [], [cartItemsByMode, saleMode]);
  const orderInfoMap = useMemo(() => orderInfoByMode[saleMode] || {}, [orderInfoByMode, saleMode]);

  /**
   * Adds an item to the cart (active mode only).
   */
  const addItem = (item, orderId, businessId, minimumOrderAmount) => {
    setCartItemsByMode(prev => {
      const current = prev[saleMode] || [];
      const existingItemIndex = current.findIndex(
        cartItem => cartItem.id === item.id && cartItem.orderId === orderId
      );

      let updatedCurrent;
      if (existingItemIndex >= 0) {
        updatedCurrent = [...current];
        updatedCurrent[existingItemIndex] = {
          ...updatedCurrent[existingItemIndex],
          quantity: updatedCurrent[existingItemIndex].quantity + item.quantity
        };
      } else {
        const newItemWithDetails = {
          ...item,
          orderId,
          businessId,
          uid: `${orderId}_${item.id}_${item.selectedOption || 'default'}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };
        updatedCurrent = [...current, newItemWithDetails];
      }

      return { ...prev, [saleMode]: updatedCurrent };
    });

    setOrderInfoByMode(prev => ({
      ...prev,
      [saleMode]: {
        ...prev[saleMode],
        [orderId]: {
          businessId,
          minimumOrderAmount,
          lastUpdated: new Date().toISOString()
        }
      }
    }));
  };

  /**
   * Removes an item from the cart by uid (active mode only).
   */
  const removeItem = (uid) => {
    setCartItemsByMode(prev => {
      const current = prev[saleMode] || [];
      const newItems = current.filter(item => item.uid !== uid);

      // Clean order info if needed
      const remainingOrderIds = new Set(newItems.map(item => item.orderId));
      const currentOrderIds = new Set(Object.keys(orderInfoByMode[saleMode] || {}));
      const orderIdsToRemove = [...currentOrderIds].filter(id => !remainingOrderIds.has(id));

      if (orderIdsToRemove.length > 0) {
        setOrderInfoByMode(prevInfo => {
          const updatedForMode = { ...(prevInfo[saleMode] || {}) };
          orderIdsToRemove.forEach(id => { delete updatedForMode[id]; });
          return { ...prevInfo, [saleMode]: updatedForMode };
        });
      }

      return { ...prev, [saleMode]: newItems };
    });
  };

  /**
   * Updates quantity for an item (active mode only).
   */
  const updateQuantity = (uid, quantity) => {
    setCartItemsByMode(prev => {
      const current = prev[saleMode] || [];
      const updated = current
        .map(item => item.uid === uid ? { ...item, quantity: Math.max(0, quantity) } : item)
        .filter(item => item.quantity > 0);
      return { ...prev, [saleMode]: updated };
    });
  };

  /**
   * Clears all items in the active mode.
   */
  const clearCart = () => {
    setCartItemsByMode(prev => ({ ...prev, [saleMode]: [] }));
    setOrderInfoByMode(prev => ({ ...prev, [saleMode]: {} }));
  };

  /**
   * Clears a specific order in the active mode.
   */
  const clearOrderItems = (orderId) => {
    setCartItemsByMode(prev => {
      const current = prev[saleMode] || [];
      const filtered = current.filter(item => item.orderId !== orderId);
      return { ...prev, [saleMode]: filtered };
    });

    setOrderInfoByMode(prev => {
      const updated = { ...(prev[saleMode] || {}) };
      delete updated[orderId];
      return { ...prev, [saleMode]: updated };
    });
  };

  /**
   * Removes an entire order (alias for clearOrderItems) in active mode.
   */
  const removeOrderFromCart = (orderId) => {
    clearOrderItems(orderId);
  };

  // Derived totals for the active mode
  const cartTotal = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }, [cartItems]);

  const totalItems = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.quantity, 0);
  }, [cartItems]);

  const itemsByOrder = useMemo(() => {
    const grouped = {};
    cartItems.forEach(item => {
      if (!grouped[item.orderId]) {
        grouped[item.orderId] = {
          items: [],
          businessId: item.businessId,
          minimumOrderAmount: (orderInfoMap[item.orderId]?.minimumOrderAmount) || 0
        };
      }
      grouped[item.orderId].items.push(item);
    });

    Object.keys(grouped).forEach(orderId => {
      grouped[orderId].total = grouped[orderId].items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    });

    return grouped;
  }, [cartItems, orderInfoMap]);

  const value = {
    // Active mode views
    cartItems,
    cartTotal,
    totalItems,
    itemsByOrder,
    orderInfoMap,
    // Mutations (active mode)
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    clearOrderItems,
    removeOrderFromCart,
    // Raw per-mode (if ever needed by advanced screens)
    cartItemsByMode,
    orderInfoByMode
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}; 