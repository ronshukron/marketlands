import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMarketplaceCart } from '../../contexts/MarketplaceCartContext';
import './marketplace.css';

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
      aria-labelledby="mp-cart-dialog-title"
      dir="rtl"
      onClick={onClose}
    >
      <div className="mp-cart-panel mp-cart-ticket-book" onClick={(e) => e.stopPropagation()}>
        <div className="mp-cart-header mp-cart-ticket-header">
          <div>
            <h2 id="mp-cart-dialog-title" className="mp-cart-title">
              סל השוק
            </h2>
            <span className="mp-cart-title-sub">קבלה זמנית · מהשדה לשכונה</span>
          </div>
          <button type="button" className="mp-cart-close" onClick={onClose} aria-label="סגירה">
            ×
          </button>
        </div>

        {cartItems.length === 0 ? (
          <p className="mp-cart-empty mp-cart-ticket-empty">
            סל השוק ריק. הוסיפו מוצרים מדוכן בשוק.
          </p>
        ) : (
          <>
            <div className="mp-cart-body">
              {storeGroups.map((group) => (
                <section key={group.businessId} className="mp-cart-ticket-block">
                  <div className="mp-cart-ticket-block-head">
                    <h3>{group.storeTitle || 'דוכן'}</h3>
                    <Link
                      to={`/community-marketplace/store/${group.businessId}/shop`}
                      className="mp-link text-sm"
                      onClick={onClose}
                    >
                      לדוכן
                    </Link>
                  </div>

                  <ul className="mp-cart-lines">
                    {group.items.map((item) => {
                      const atMaxStock =
                        item.stockLimit !== null &&
                        item.stockLimit !== undefined &&
                        item.quantity >= item.stockLimit;

                      return (
                        <li key={item.uid} className="mp-cart-ticket-line">
                          <div className="mp-cart-ticket-line-inner">
                            {item.images?.[0] ? (
                              <img
                                src={item.images[0]}
                                alt=""
                                className="mp-cart-line-thumb"
                              />
                            ) : (
                              <div className="mp-cart-line-thumb mp-cart-line-thumb-placeholder">
                                —
                              </div>
                            )}
                            <div className="mp-cart-line-main">
                              <div className="mp-cart-line-info">
                                <span className="mp-cart-line-name">{item.name}</span>
                                <span className="mp-cart-line-unit">
                                  {formatCurrency(item.price)} × {item.quantity}
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
                                  aria-disabled={atMaxStock}
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
                                סכום שורה: {formatCurrency(item.price * item.quantity)}
                              </div>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mp-cart-store-subtotal mp-cart-ticket-subtotal">
                    <span>סכום ביניים לדוכן</span>
                    <strong>{formatCurrency(group.total)}</strong>
                  </p>
                </section>
              ))}
            </div>

            <div className="mp-cart-footer mp-cart-ticket-footer">
              <div className="mp-cart-ticket-total-row">
                <span>סה״כ בשוק</span>
                <strong className="mp-cart-ticket-total-amount">{formatCurrency(cartTotal)}</strong>
              </div>
              <p className="mp-cart-note">
                {storeGroups.length > 1
                  ? `הסל כולל ${storeGroups.length} דוכנים — בקופה תאשרו כל אחד בנפרד.`
                  : 'בקופה תאשרו את ההזמנה ותבחרו תשלום בשוק.'}
              </p>
              <button type="button" className="mp-btn mp-btn-wood w-full" onClick={handleCheckout}>
                לתשלום בשוק
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
