import React, { useMemo, useState } from 'react';
import { useMarketplaceCart } from '../../contexts/MarketplaceCartContext';
import {
  canAddProductToStoreCart,
  getProductStockLimit,
  getRemainingProductStock,
  isMarketplaceProductInStock,
} from '../../utils/marketplaceProductStock';
import './marketplace.css';

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

  const isLowStock = stockHint && inStock && remaining > 0 && remaining <= 3;

  return (
    <article
      className={`mp-crate-label mp-store-product-tile${!inStock ? ' is-sold-out' : ''}${
        quantityInCart > 0 ? ' is-in-cart' : ''
      }`}
    >
      <div className="mp-crate-label-stamp" aria-hidden="true">
        <span className="mp-crate-label-stamp-price">{formatCurrency(product.price)}</span>
      </div>

      <div className="mp-crate-label-media">
        {product.images?.[0] ? (
          <img src={product.images[0]} alt={product.name} />
        ) : (
          <div className="mp-store-product-tile-placeholder">ללא תמונה</div>
        )}
      </div>

      <div className="mp-crate-label-body mp-store-product-tile-body">
        {product.category && (
          <span className="mp-crate-label-category">{product.category}</span>
        )}
        <h3 className="mp-crate-label-name">{product.name}</h3>

        {stockHint && (
          <p
            className={`mp-crate-label-stock${
              !inStock || remaining === 0 ? ' is-out' : isLowStock ? ' is-low' : ''
            }`}
          >
            {stockHint}
          </p>
        )}

        <button
          type="button"
          className="mp-btn mp-btn-wood mp-store-add-btn mp-crate-label-add"
          onClick={handleAdd}
          disabled={!canAdd}
          aria-disabled={!canAdd}
        >
          {quantityInCart > 0
            ? `בסל השוק (${quantityInCart})`
            : inStock
              ? 'הוסף לסל השוק'
              : 'אזל המלאי'}
        </button>

        {addBlockedMessage && (
          <p className="mp-crate-label-error" role="status">
            {addBlockedMessage}
          </p>
        )}
      </div>
    </article>
  );
};

export default MarketplaceStoreProductTile;
