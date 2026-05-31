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

const STATUS_LABELS = {
  verified: { text: 'מאושר', className: 'mp-badge mp-badge-success' },
  pending: { text: 'ממתין לאישור', className: 'mp-badge mp-badge-warning' },
  rejected: { text: 'נדחה', className: 'mp-badge mp-badge-danger' },
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
      <div className="mp-page py-8" dir="rtl">
        <p className="text-center text-gray-600">גישה למוצרי שוק הבסטות מותרת לבעלי בסטה בלבד.</p>
      </div>
    );
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="mp-page py-8" dir="rtl">
      <div className="mp-main mp-stack">
        <div className="mp-panel">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="mp-section-kicker">שוק הבסטות</p>
              <h1 className="mp-hero-title" style={{ fontSize: '1.75rem' }}>
                המוצרים שלי
              </h1>
              <p className="mp-section-note mt-1">
                קטלוג נפרד מהמוצרים השבועיים. מוצרים חדשים ממתינים לאישור מנהל לפני שיופיעו בקידום.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/marketplace/dashboard" className="mp-link">
                לוח הבסטה
              </Link>
              <button
                type="button"
                className="mp-btn-primary"
                onClick={() => navigate('/marketplace/products/new')}
              >
                מוצר חדש
              </button>
            </div>
          </div>
        </div>

        <div className="mp-panel mp-stack" style={{ gap: '0.75rem' }}>
          <p className="mp-products-promo-hint">
            לבחירת מוצרים בהזמנה שבועית: עבורו ל{' '}
            <Link to="/marketplace/promotions/new">קידום שבועי חדש</Link>
            {' '}בלוח הבסטה, סמנו מוצרים <strong>מאושרים</strong> (או לחצו &quot;הוסף לקידום&quot; על מוצר מאושר למטה).
          </p>
          <input
            className="mp-input"
            placeholder="חיפוש מוצר..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {filteredProducts.length === 0 ? (
          <div className="mp-panel text-center py-10">
            <p className="text-gray-600 mb-4">אין מוצרים עדיין.</p>
            <button
              type="button"
              className="mp-btn-primary"
              onClick={() => navigate('/marketplace/products/new')}
            >
              הוספת מוצר ראשון
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredProducts.map((product) => {
              const status = getMarketplaceProductApprovalStatus(product);
              const badge = STATUS_LABELS[status] || STATUS_LABELS.pending;

              return (
                <div key={product.id} className="mp-product-card">
                  {product.images?.[0] ? (
                    <img src={product.images[0]} alt={product.name} className="mp-product-card-img" />
                  ) : (
                    <div className="mp-product-card-img mp-product-card-placeholder">ללא תמונה</div>
                  )}
                  <div className="mp-product-card-body">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-gray-900">{product.name}</h3>
                      <span className={badge.className}>{badge.text}</span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      ₪{Number(product.price || 0).toFixed(2)} · {product.category || 'אחר'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      מלאי: {product.stockAmount ?? 'ללא מעקב'}
                      {!isMarketplaceProductInStock(product) && (
                        <span className="text-red-600"> · אזל</span>
                      )}
                      {product.showInStore === false && (
                        <span className="text-amber-700"> · לא בחנות קבועה</span>
                      )}
                    </p>
                    {status === 'verified' && (
                      <button
                        type="button"
                        className="mp-btn-card-promo mt-2"
                        style={{ background: 'transparent', border: '1px solid #c4a574' }}
                        onClick={() => handleToggleStoreVisibility(product)}
                      >
                        {product.showInStore === false
                          ? 'הצגה בחנות הקבועה'
                          : 'הסרה מהחנות הקבועה'}
                      </button>
                    )}
                    {status === 'rejected' && product.rejectionReason && (
                      <p className="text-xs text-red-600 mt-1">{product.rejectionReason}</p>
                    )}
                    {status === 'verified' && (
                      <button
                        type="button"
                        className="mp-btn-card-promo"
                        onClick={() => handleAddToPromotion(product.id)}
                      >
                        הוסף לקידום שבועי
                      </button>
                    )}
                    <div className="mp-product-card-actions">
                      <Link
                        to={`/marketplace/products/${product.id}`}
                        className="mp-btn-card-edit"
                      >
                        עריכה
                      </Link>
                      <button
                        type="button"
                        className="mp-btn-card-delete"
                        onClick={() => handleDelete(product)}
                      >
                        מחק
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default MarketplaceProductsList;
