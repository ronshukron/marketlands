import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMarketplaceCart } from '../../contexts/MarketplaceCartContext';

const formatCurrency = (value) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(Number(value || 0));

const MarketplaceCart = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { cartItems, removeItem, updateQuantity, cartTotal, itemsByStore } = useMarketplaceCart();
  const storeGroups = Object.values(itemsByStore);

  if (!isOpen) return null;

  const handleCheckout = () => {
    if (cartItems.length === 0) return;
    onClose();
    navigate('/community-marketplace/checkout');
  };

  return (
    <div
      className="mp-cart-overlay"
      role="dialog"
      aria-modal="true"
      dir="rtl"
      onClick={onClose}
    >
      <div className="mp-cart-panel" onClick={(e) => e.stopPropagation()}>
        <div className="mp-cart-header">
          <h2 className="mp-cart-title">סל הבסטה</h2>
          <button type="button" className="mp-cart-close" onClick={onClose} aria-label="סגירה">
            ×
          </button>
        </div>

        {cartItems.length === 0 ? (
          <p className="mp-cart-empty">הסל ריק. הוסיפו מוצרים מחנות הבסטה.</p>
        ) : (
          <>
            <div className="mp-cart-body">
              {storeGroups.map((group) => (
                <section key={group.businessId} className="mp-cart-store-section">
                  <div className="mp-cart-store-head">
                    <h3>{group.storeTitle || 'בסטה'}</h3>
                    <Link
                      to={`/community-marketplace/store/${group.businessId}/shop`}
                      className="mp-link text-sm"
                      onClick={onClose}
                    >
                      לחנות הבסטה
                    </Link>
                  </div>

                  <ul className="mp-cart-lines">
                    {group.items.map((item) => {
                      const atMaxStock =
                        item.stockLimit !== null &&
                        item.stockLimit !== undefined &&
                        item.quantity >= item.stockLimit;

                      return (
                      <li key={item.uid} className="mp-cart-line">
                        {item.images?.[0] ? (
                          <img
                            src={item.images[0]}
                            alt={item.name}
                            className="mp-cart-line-thumb"
                          />
                        ) : (
                          <div className="mp-cart-line-thumb mp-cart-line-thumb-placeholder">
                            ללא
                          </div>
                        )}
                        <div className="mp-cart-line-main">
                          <div className="mp-cart-line-info">
                            <span className="mp-cart-line-name">{item.name}</span>
                            <span className="mp-cart-line-price">
                              {formatCurrency(item.price)}
                            </span>
                          </div>
                          <div className="mp-cart-line-actions">
                            <button
                              type="button"
                              className="mp-cart-qty-btn"
                              onClick={() => updateQuantity(item.uid, item.quantity - 1)}
                              aria-label="הפחתה"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                              </svg>
                            </button>
                            <span className="mp-cart-qty">{item.quantity}</span>
                            <button
                              type="button"
                              className="mp-cart-qty-btn"
                              onClick={() => updateQuantity(item.uid, item.quantity + 1)}
                              disabled={atMaxStock}
                              aria-label="הוספה"
                              style={atMaxStock ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              className="mp-cart-remove"
                              onClick={() => removeItem(item.uid)}
                            >
                              הסרה
                            </button>
                          </div>
                          <div className="mp-cart-line-total">
                            {formatCurrency(item.price * item.quantity)}
                          </div>
                        </div>
                      </li>
                    );
                    })}
                  </ul>
                  <p className="mp-cart-store-subtotal">
                    סכום ביניים: {formatCurrency(group.total)}
                  </p>
                </section>
              ))}
            </div>

            <div className="mp-cart-footer">
              <p className="mp-cart-total">
                <strong>סה״כ:</strong> {formatCurrency(cartTotal)}
              </p>
              <p className="mp-cart-note text-sm">
                {storeGroups.length > 1
                  ? `הסל כולל ${storeGroups.length} בסטות — בקופה תאשרו כל אחת בנפרד.`
                  : 'בקופה תאשרו את ההזמנה ותבחרו אמצעי תשלום.'}
              </p>
              <button type="button" className="mp-btn mp-btn-wood w-full" onClick={handleCheckout}>
                לתשלום ואישור
              </button>
              <button type="button" className="mp-btn mp-btn-primary w-full mt-2" onClick={onClose}>
                המשך קנייה
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default MarketplaceCart;
