import React, { useMemo, useState } from 'react';
import { useMarketplaceCart } from '../../contexts/MarketplaceCartContext';
import {
  canAddProductToStoreCart,
  getProductStockLimit,
  getRemainingProductStock,
  isMarketplaceProductInStock,
} from '../../utils/marketplaceProductStock';

const formatCurrency = (value) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(Number(value || 0));

const MarketplaceStoreProductTile = ({ product, businessId, storeTitle }) => {
  const { addItem, cartItems } = useMarketplaceCart();
  const [addBlockedMessage, setAddBlockedMessage] = useState('');

  const quantityInCart = useMemo(
    () =>
      cartItems
        .filter((item) => item.id === product.id && item.businessId === businessId)
        .reduce((sum, item) => sum + item.quantity, 0),
    [cartItems, product.id, businessId]
  );

  const stockLimit = getProductStockLimit(product);
  const inStock = isMarketplaceProductInStock(product);
  const remaining = getRemainingProductStock(product, quantityInCart);
  const canAdd = canAddProductToStoreCart(product, quantityInCart);

  const handleAdd = () => {
    if (!canAdd) {
      setAddBlockedMessage(
        !inStock ? 'אזל המלאי' : 'הגעתם לכמות המקסימלית במלאי'
      );
      return;
    }

    const added = addItem(product, businessId, storeTitle);
    if (!added) {
      setAddBlockedMessage('לא ניתן להוסיף — בדקו מלאי');
      return;
    }
    setAddBlockedMessage('');
  };

  const stockHint =
    stockLimit === null
      ? null
      : remaining === 0
        ? 'אזל המלאי'
        : `נותרו ${remaining} יחידות`;

  return (
    <div className="mp-store-product-tile">
      {product.images?.[0] ? (
        <img src={product.images[0]} alt={product.name} />
      ) : (
        <div className="mp-store-product-tile-placeholder">ללא תמונה</div>
      )}
      <div className="mp-store-product-tile-body">
        <h3>{product.name}</h3>
        <p>{formatCurrency(product.price)}</p>
        {product.category && <span className="text-xs text-gray-500">{product.category}</span>}
        {stockHint && (
          <p className={`text-xs mt-1 ${!inStock || remaining === 0 ? 'text-red-600' : 'text-gray-500'}`}>
            {stockHint}
          </p>
        )}
        <button
          type="button"
          className="mp-btn mp-btn-wood mp-store-add-btn"
          onClick={handleAdd}
          disabled={!canAdd}
          style={!canAdd ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
        >
          {quantityInCart > 0
            ? `בסל (${quantityInCart})`
            : inStock
              ? 'הוספה לסל'
              : 'אזל המלאי'}
        </button>
        {addBlockedMessage && (
          <p className="text-xs text-red-600 mt-1" role="status">
            {addBlockedMessage}
          </p>
        )}
      </div>
    </div>
  );
};

export default MarketplaceStoreProductTile;
