import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { useAuth } from '../../../contexts/authContext';
import {
  deleteMarketplaceProduct,
  getMarketplaceProductsForBusiness,
  getMarketplaceProductApprovalStatus,
  setMarketplaceProductShowInStore,
} from '../../../services/marketplaceProductService';
import { isMarketplaceProductInStock } from '../../../utils/marketplaceProductStock';
import LoadingSpinner from '../../LoadingSpinner';
import '../marketplace.css';

const STATUS_STAMPS = {
  verified: { text: 'מאושר', className: 'mp-product-stamp mp-product-stamp--approved' },
  pending: { text: 'ממתין', className: 'mp-product-stamp mp-product-stamp--pending' },
  rejected: { text: 'נדחה', className: 'mp-product-stamp mp-product-stamp--rejected' },
};

const MarketplaceProductsList = () => {
  const { currentUser, userRole } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const loadProducts = async () => {
    if (!currentUser) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const items = await getMarketplaceProductsForBusiness(currentUser.uid);
      setProducts(items);
    } catch (error) {
      console.error('Failed to load marketplace products', error);
      Swal.fire({
        icon: 'error',
        title: 'שגיאה',
        text: 'לא ניתן לטעון את המוצרים. ודאו שהרשאות Firestore עודכנו.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, [currentUser]);

  const filteredProducts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q)
    );
  }, [products, searchTerm]);

  const handleToggleStoreVisibility = async (product) => {
    const next = product.showInStore === false;
    try {
      await setMarketplaceProductShowInStore(product.id, next);
      setProducts((current) =>
        current.map((item) =>
          item.id === product.id ? { ...item, showInStore: next } : item
        )
      );
    } catch (error) {
      console.error('Failed to toggle store visibility', error);
      Swal.fire({ icon: 'error', title: 'שגיאה בעדכון הצגה בחנות' });
    }
  };

  const handleAddToPromotion = (productId) => {
    navigate('/marketplace/promotions/new', {
      state: { preselectedProductIds: [productId] },
    });
  };

  const handleDelete = async (product) => {
    const result = await Swal.fire({
      title: 'למחוק את המוצר?',
      text: product.name,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'מחק',
      cancelButtonText: 'ביטול',
    });

    if (!result.isConfirmed) return;

    try {
      await deleteMarketplaceProduct(product.id);
      await loadProducts();
      Swal.fire({ icon: 'success', title: 'המוצר נמחק', timer: 1200, showConfirmButton: false });
    } catch (error) {
      console.error('Delete failed', error);
      Swal.fire({ icon: 'error', title: 'שגיאה במחיקה' });
    }
  };

  if (userRole !== 'localBusiness' && userRole !== 'business') {
    return (
      <div className="mp-page mp-bench-page" dir="rtl">
        <p className="mp-main mp-section-note text-center">גישה למוצרי השוק מותרת לבעלי דוכן בלבד.</p>
      </div>
    );
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="mp-page mp-bench-page" dir="rtl">
      <div className="mp-main mp-bench mp-stack">
        <header className="mp-bench-header">
          <div className="mp-bench-header-main">
            <span className="mp-weekly-board-label">שדה ושכונה · דוכן</span>
            <h1 className="mp-bench-title mp-section-title-chalk">מוצרים</h1>
            <p className="mp-bench-subtitle">
              קטלוג הדוכן — מוצרים חדשים ממתינים לאישור לפני קידום שבועי.
            </p>
          </div>
          <div className="mp-bench-header-actions">
            <Link to="/marketplace/dashboard" className="mp-link">
              לוח הדוכן
            </Link>
            <button
              type="button"
              className="mp-btn mp-btn-wood mp-bench-btn-sm"
              onClick={() => navigate('/marketplace/products/new')}
            >
              מוצר חדש
            </button>
          </div>
        </header>

        <div className="mp-bench-panel mp-stack">
          <p className="mp-products-promo-hint">
            לבחירת מוצרים בהזמנה שבועית: עבורו ל{' '}
            <Link to="/marketplace/promotions/new">קידום מהשדה</Link>
            {' '}בלוח הדוכן, או לחצו &quot;הוסף לקידום&quot; על מוצר{' '}
            <strong>מאושר</strong>.
          </p>
          <input
            className="mp-input"
            placeholder="חיפוש מוצר..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="חיפוש מוצר"
          />
        </div>

        {filteredProducts.length === 0 ? (
          <div className="mp-bench-panel mp-bench-empty">
            <p className="mp-section-note">אין מוצרים עדיין.</p>
            <button
              type="button"
              className="mp-btn mp-btn-wood mt-3"
              onClick={() => navigate('/marketplace/products/new')}
            >
              הוספת מוצר ראשון
            </button>
          </div>
        ) : (
          <ul className="mp-product-crate-grid">
            {filteredProducts.map((product) => {
              const status = getMarketplaceProductApprovalStatus(product);
              const stamp = STATUS_STAMPS[status] || STATUS_STAMPS.pending;

              return (
                <li key={product.id} className="mp-product-crate">
                  <div className="mp-product-crate-media">
                    {product.images?.[0] ? (
                      <img
                        src={product.images[0]}
                        alt={product.name}
                        className="mp-product-crate-img"
                      />
                    ) : (
                      <div className="mp-product-crate-img mp-product-crate-placeholder">
                        ללא תמונה
                      </div>
                    )}
                    <span className={stamp.className} aria-label={`סטטוס: ${stamp.text}`}>
                      {stamp.text}
                    </span>
                  </div>
                  <div className="mp-product-crate-body">
                    <h3 className="mp-product-crate-name">{product.name}</h3>
                    <p className="mp-product-crate-meta">
                      ₪{Number(product.price || 0).toFixed(2)} · {product.category || 'אחר'}
                    </p>
                    <p className="mp-product-crate-stock">
                      מלאי: {product.stockAmount ?? 'ללא מעקב'}
                      {!isMarketplaceProductInStock(product) && (
                        <span className="mp-product-crate-out"> · אזל</span>
                      )}
                      {product.showInStore === false && (
                        <span className="mp-product-crate-hidden"> · לא בחנות קבועה</span>
                      )}
                    </p>
                    {status === 'rejected' && product.rejectionReason && (
                      <p className="mp-product-crate-reject">{product.rejectionReason}</p>
                    )}
                    {status === 'verified' && (
                      <>
                        <button
                          type="button"
                          className="mp-btn mp-btn-outline mp-product-crate-action"
                          onClick={() => handleToggleStoreVisibility(product)}
                        >
                          {product.showInStore === false
                            ? 'הצגה בחנות הקבועה'
                            : 'הסרה מהחנות הקבועה'}
                        </button>
                        <button
                          type="button"
                          className="mp-btn mp-btn-wood mp-product-crate-action"
                          onClick={() => handleAddToPromotion(product.id)}
                        >
                          הוסף לקידום שבועי
                        </button>
                      </>
                    )}
                    <div className="mp-product-crate-actions">
                      <Link
                        to={`/marketplace/products/${product.id}`}
                        className="mp-btn mp-btn-outline mp-bench-btn-sm"
                      >
                        עריכה
                      </Link>
                      <button
                        type="button"
                        className="mp-btn mp-btn-chalk-danger mp-bench-btn-sm"
                        onClick={() => handleDelete(product)}
                      >
                        מחק
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default MarketplaceProductsList;
