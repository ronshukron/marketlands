import React, { createContext, useState, useContext, useMemo, useEffect } from 'react';

// Create a new React Context for managing cart state.
// This context will hold the cart items, order information, and functions to manipulate them.
const CartContext = createContext();

// Custom hook to easily access the CartContext values in consuming components.
// It simplifies the usage from `useContext(CartContext)` to just `useCart()`.
export const useCart = () => useContext(CartContext);

// CartProvider component wraps parts of the application that need access to cart state.
// It manages the cart's state and provides it down the component tree via CartContext.
export const CartProvider = ({ children }) => {
  // State variable to store the array of items currently in the cart.
  // Each item is an object with details like id, name, price, quantity, orderId, businessId, and a unique uid.
  const [cartItems, setCartItems] = useState([]);

  // State variable to store metadata about each distinct order present in the cart.
  // It's an object where keys are orderIds and values are objects containing
  // businessId, minimumOrderAmount, and lastUpdated timestamp for that order.
  const [orderInfoMap, setOrderInfoMap] = useState({});

  // Flag to track whether we've loaded from localStorage yet
  const [hasLoadedFromStorage, setHasLoadedFromStorage] = useState(false);

  // Load cart data from localStorage on component mount
  useEffect(() => {
    try {
      const savedCartItems = localStorage.getItem('cartItems');
      const savedOrderInfoMap = localStorage.getItem('orderInfoMap');
      
      if (savedCartItems) {
        const parsedCartItems = JSON.parse(savedCartItems);
        setCartItems(parsedCartItems);
      }
      
      if (savedOrderInfoMap) {
        const parsedOrderInfoMap = JSON.parse(savedOrderInfoMap);
        setOrderInfoMap(parsedOrderInfoMap);
      }
    } catch (error) {
      console.error('Error loading cart from localStorage:', error);
      // If there's an error, clear the localStorage to prevent future issues
      localStorage.removeItem('cartItems');
      localStorage.removeItem('orderInfoMap');
    }
    
    // Mark that we've completed the initial load
    setHasLoadedFromStorage(true);
  }, []);

  // Save cart data to localStorage whenever cartItems changes (but only after initial load)
  useEffect(() => {
    if (!hasLoadedFromStorage) return; // Don't save during initial load
    
    try {
      localStorage.setItem('cartItems', JSON.stringify(cartItems));
    } catch (error) {
      console.error('Error saving cart items to localStorage:', error);
    }
  }, [cartItems, hasLoadedFromStorage]);

  // Save order info to localStorage whenever orderInfoMap changes (but only after initial load)
  useEffect(() => {
    if (!hasLoadedFromStorage) return; // Don't save during initial load
    
    try {
      localStorage.setItem('orderInfoMap', JSON.stringify(orderInfoMap));
    } catch (error) {
      console.error('Error saving order info to localStorage:', error);
    }
  }, [orderInfoMap, hasLoadedFromStorage]);

  /**
   * Adds an item to the cart.
   * Ensures each added item instance is unique using a generated uid.
   * Updates the orderInfoMap with details for the item's order.
   * @param {object} item - The item object to add (should include id, price, etc.).
   * @param {string} orderId - The identifier for the order this item belongs to.
   * @param {string} businessId - The identifier for the business associated with the order.
   * @param {number} minimumOrderAmount - The minimum amount required for the order.
   */
  const addItem = (item, orderId, businessId, minimumOrderAmount) => {
    setCartItems(prevItems => {
      // Check if item already exists in cart
      const existingItemIndex = prevItems.findIndex(
        cartItem => cartItem.id === item.id && cartItem.orderId === orderId
      );

      if (existingItemIndex >= 0) {
        // If item exists, update its quantity
        const updatedItems = [...prevItems];
        updatedItems[existingItemIndex] = {
          ...updatedItems[existingItemIndex],
          quantity: updatedItems[existingItemIndex].quantity + item.quantity
        };
        return updatedItems;
      }

      // If item doesn't exist, add it to cart
      const newItemWithDetails = {
        ...item, // Spread existing item properties
        orderId, // Associate with the specific order
        businessId, // Associate with the specific business
        // Generate a unique identifier (uid) for this specific cart item instance.
        // This allows multiple identical items (e.g., two separate servings of the same dish)
        // to exist as distinct entries in the cart. It combines orderId, item id, selected option,
        // timestamp, and a random string for uniqueness.
        uid: `${orderId}_${item.id}_${item.selectedOption || 'default'}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };

      // Update the orderInfoMap state.
      // Use the functional form of setState to ensure we're working with the latest state.
      setOrderInfoMap(prev => ({
        ...prev, // Keep existing order info
        // Add or update the info for the current orderId.
        [orderId]: {
          businessId,
          minimumOrderAmount,
          lastUpdated: new Date().toISOString() // Track when this order was last touched
        }
      }));

      // Return the updated list of cart items.
      return [...prevItems, newItemWithDetails];
    });
  };

  /**
   * Removes an item from the cart based on its unique identifier (uid).
   * Also cleans up the orderInfoMap if removing the item results in an order having no items left.
   * @param {string} uid - The unique identifier of the cart item to remove.
   */
  const removeItem = (uid) => {
    setCartItems((prevItems) => {
      // Filter out the item with the matching uid.
      const newItems = prevItems.filter((item) => item.uid !== uid);

      // After removing the item, check if its corresponding order still has any items left.
      const remainingOrderIds = new Set(newItems.map(item => item.orderId)); // Get unique orderIds remaining
      const currentOrderIds = new Set(Object.keys(orderInfoMap)); // Get orderIds currently tracked

      // Determine which orderIds were present before but are not anymore.
      const orderIdsToRemove = [...currentOrderIds].filter(id => !remainingOrderIds.has(id));

      // If there are orders with no items left, remove them from the orderInfoMap.
      if (orderIdsToRemove.length > 0) {
        // Create a copy of the current orderInfoMap to modify.
        const updatedOrderInfoMap = {...orderInfoMap};
        // Delete the entries for orders that are now empty.
        orderIdsToRemove.forEach(id => {
          delete updatedOrderInfoMap[id];
        });
        // Update the orderInfoMap state.
        setOrderInfoMap(updatedOrderInfoMap);
      }

      // Return the updated list of cart items.
      return newItems;
    });
  };

  /**
   * Updates the quantity of a specific item in the cart.
   * If the quantity is reduced to 0 or less, the item is removed from the cart.
   * @param {string} uid - The unique identifier of the cart item to update.
   * @param {number} quantity - The new quantity for the item.
   */
  const updateQuantity = (uid, quantity) => {
    setCartItems((prevItems) =>
      // Map over the items: update the target item's quantity (ensuring it's not negative).
      prevItems.map((item) =>
        item.uid === uid ? { ...item, quantity: Math.max(0, quantity) } : item
      )
      // Filter out any items whose quantity was set to 0 or less.
      .filter(item => item.quantity > 0)
    );
    // Note: This function doesn't currently update orderInfoMap if an item removal
    // leads to an empty order. This might be desired or an area for enhancement
    // depending on requirements (removeItem handles this cleanup).
  };

  /**
   * Clears all items from the cart and resets the order information map.
   * Also clears the data from localStorage.
   */
  const clearCart = () => {
    setCartItems([]); // Reset items to an empty array
    setOrderInfoMap({}); // Reset order info to an empty object
    // Clear localStorage as well
    localStorage.removeItem('cartItems');
    localStorage.removeItem('orderInfoMap');
  };

  /**
   * Clears all items associated with a specific orderId from the cart.
   * Also removes the corresponding entry from the orderInfoMap.
   * @param {string} orderId - The identifier of the order to clear.
   */
  const clearOrderItems = (orderId) => {
    // Filter out items belonging to the specified orderId.
    setCartItems(prevItems => prevItems.filter(item => item.orderId !== orderId));

    // Remove this order's information from the orderInfoMap.
    setOrderInfoMap(prev => {
      const updated = {...prev}; // Create a copy
      delete updated[orderId]; // Delete the entry for the cleared order
      return updated; // Return the updated map
    });
  };

  // Calculate the total monetary value of all items in the cart.
  // useMemo ensures this calculation is only re-run when cartItems changes.
  const cartTotal = useMemo(() => {
    // Sum the price * quantity for each item.
    return cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }, [cartItems]); // Dependency array: recalculate only if cartItems changes

  // Calculate the total number of individual items in the cart (sum of quantities).
  // useMemo ensures this calculation is only re-run when cartItems changes.
  const totalItems = useMemo(() => {
    // Sum the quantity for each item.
    return cartItems.reduce((sum, item) => sum + item.quantity, 0);
  }, [cartItems]); // Dependency array: recalculate only if cartItems changes

  // Group cart items by their orderId. Also calculates the total for each order.
  // This is useful for displaying the cart separated by orders or for processing checkouts per order.
  // useMemo ensures this complex grouping and calculation only happens when cartItems or orderInfoMap changes.
  const itemsByOrder = useMemo(() => {
    const grouped = {}; // Initialize an empty object to store grouped items

    // Iterate over each item in the cart.
    cartItems.forEach(item => {
      // If this orderId hasn't been seen yet, initialize its entry in the grouped object.
      if (!grouped[item.orderId]) {
        grouped[item.orderId] = {
          items: [], // Array to hold items for this order
          businessId: item.businessId, // Store the businessId associated with this order
          // Retrieve the minimum order amount from the orderInfoMap, defaulting to 0 if not found.
          minimumOrderAmount: orderInfoMap[item.orderId]?.minimumOrderAmount || 0
        };
      }
      // Add the current item to the items array for its corresponding orderId.
      grouped[item.orderId].items.push(item);
    });

    // Calculate the total price for each individual order group.
    Object.keys(grouped).forEach(orderId => {
      grouped[orderId].total = grouped[orderId].items.reduce(
        (sum, item) => sum + item.price * item.quantity, 0 // Sum price * quantity for items in this group
      );
    });

    // Return the final object containing items grouped by orderId, along with order totals and metadata.
    return grouped;
  }, [cartItems, orderInfoMap]); // Dependencies: recalculate if items or order info change

  // The value object provided to consumers of the CartContext.
  // It includes the cart state (cartItems, orderInfoMap) and the functions to modify it,
  // as well as the memoized derived values (cartTotal, totalItems, itemsByOrder).
  const value = {
    cartItems,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    clearOrderItems,
    cartTotal,
    totalItems,
    itemsByOrder,
    orderInfoMap // Expose the order info map directly as well
  };

  // Render the CartContext.Provider, passing the 'value' object down
  // to all descendant components wrapped by CartProvider.
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}; 