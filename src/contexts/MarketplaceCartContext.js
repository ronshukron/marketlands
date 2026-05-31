import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  canAddProductToStoreCart,
  clampCartQuantityToStock,
  getProductStockLimit,
} from '../utils/marketplaceProductStock';

const STORAGE_KEY = 'marketplaceCartItems';

const MarketplaceCartContext = createContext();

export const useMarketplaceCart = () => useContext(MarketplaceCartContext);

export const MarketplaceCartProvider = ({ children }) => {
  const [cartItems, setCartItems] = useState([]);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setCartItems(JSON.parse(saved));
      }
    } catch (error) {
      console.error('Failed to load marketplace cart', error);
      localStorage.removeItem(STORAGE_KEY);
    }
    setHasLoaded(true);
  }, []);

  useEffect(() => {
    if (!hasLoaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cartItems));
    } catch (error) {
      console.error('Failed to save marketplace cart', error);
    }
  }, [cartItems, hasLoaded]);

  const addItem = (product, businessId, storeTitle = '') => {
    if (!product?.id || !businessId) return false;

    const existingQty = cartItems
      .filter((item) => item.id === product.id && item.businessId === businessId)
      .reduce((sum, item) => sum + item.quantity, 0);

    if (!canAddProductToStoreCart(product, existingQty)) {
      return false;
    }

    const stockLimit = getProductStockLimit(product);

    setCartItems((prev) => {
      const index = prev.findIndex(
        (item) => item.id === product.id && item.businessId === businessId
      );

      if (index >= 0) {
        const next = [...prev];
        const nextQty = clampCartQuantityToStock(product, next[index].quantity + 1);
        if (nextQty <= next[index].quantity) {
          return prev;
        }
        next[index] = {
          ...next[index],
          quantity: nextQty,
          stockLimit,
        };
        return next;
      }

      return [
        ...prev,
        {
          id: product.id,
          name: product.name || '',
          price: Number(product.price || 0),
          quantity: 1,
          businessId,
          storeTitle,
          imageUrl: product.images?.[0] || '',
          images: Array.isArray(product.images) ? product.images.filter(Boolean) : [],
          stockLimit,
          uid: `mp_${businessId}_${product.id}`,
        },
      ];
    });

    return true;
  };

  const removeItem = (uid) => {
    setCartItems((prev) => prev.filter((item) => item.uid !== uid));
  };

  const updateQuantity = (uid, quantity, productForStock = null) => {
    setCartItems((prev) => {
      const item = prev.find((entry) => entry.uid === uid);
      if (!item) return prev;

      const stockProduct =
        productForStock ||
        (item.stockLimit === null || item.stockLimit === undefined
          ? { stockAmount: undefined }
          : { stockAmount: item.stockLimit });

      const nextQty = clampCartQuantityToStock(stockProduct, quantity);

      return prev
        .map((entry) => (entry.uid === uid ? { ...entry, quantity: nextQty } : entry))
        .filter((entry) => entry.quantity > 0);
    });
  };

  const clearCart = () => {
    setCartItems([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  const clearStoreItems = (businessId) => {
    setCartItems((prev) => prev.filter((item) => item.businessId !== businessId));
  };

  const cartTotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cartItems]
  );

  const totalItems = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems]
  );

  const itemsByStore = useMemo(() => {
    const grouped = {};
    cartItems.forEach((item) => {
      if (!grouped[item.businessId]) {
        grouped[item.businessId] = {
          businessId: item.businessId,
          storeTitle: item.storeTitle,
          items: [],
          total: 0,
        };
      }
      grouped[item.businessId].items.push(item);
    });

    Object.values(grouped).forEach((group) => {
      group.total = group.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    });

    return grouped;
  }, [cartItems]);

  const value = {
    cartItems,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    clearStoreItems,
    cartTotal,
    totalItems,
    itemsByStore,
  };

  return (
    <MarketplaceCartContext.Provider value={value}>{children}</MarketplaceCartContext.Provider>
  );
};
