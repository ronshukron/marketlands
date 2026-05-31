import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import LoadingSpinner from '../LoadingSpinner';
import Swal from 'sweetalert2';
import { verifyProduct, rejectProduct } from '../../services/independentAdminService';
import {
  approveMarketplaceProduct,
  getPendingMarketplaceProducts,
  rejectMarketplaceProduct,
} from '../../services/marketplaceProductService';

const ProductApprovals = () => {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState('marketplace');
  const [legacyProducts, setLegacyProducts] = useState([]);
  const [marketplaceProducts, setMarketplaceProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const fetchLegacyPending = async () => {
    const q = query(collection(db, 'Products'), where('verified', '==', false));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => ({ id: d.id, source: 'legacy', ...d.data() }))
      .filter((p) => p.rejected !== true);
  };

  const fetchPending = async () => {
    setLoading(true);
    try {
      const [legacy, marketplace] = await Promise.all([
        fetchLegacyPending(),
        getPendingMarketplaceProducts().then((items) =>
          items.map((p) => ({ ...p, source: 'marketplace' }))
        ),
      ]);
      setLegacyProducts(legacy);
      setMarketplaceProducts(marketplace);
    } catch (e) {
      console.error('Failed to load pending products', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, []);

  const products = activeTab === 'marketplace' ? marketplaceProducts : legacyProducts;

  const handleApprove = async (product) => {
    if (!currentUser) {
      Swal.fire({ icon: 'error', title: 'שגיאת התחברות', text: 'יש להתחבר מחדש למערכת' });
      return;
    }
    try {
      setActionLoadingId(product.id);
      if (product.source === 'marketplace') {
        await approveMarketplaceProduct(product.id);
      } else {
        await verifyProduct({ productId: product.id });
      }
      Swal.fire({ icon: 'success', title: 'המוצר אושר', timer: 1500, showConfirmButton: false });
      await fetchPending();
    } catch (e) {
      console.error('Approve failed', e);
      Swal.fire({ icon: 'error', title: 'שגיאה באישור מוצר' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReject = async (product) => {
    if (!currentUser) {
      Swal.fire({ icon: 'error', title: 'שגיאת התחברות', text: 'יש להתחבר מחדש למערכת' });
      return;
    }
    try {
      const { value: reason } = await Swal.fire({
        title: 'סיבת דחייה',
        input: 'text',
        inputPlaceholder: 'הזן סיבה לדחיית המוצר',
        showCancelButton: true,
        cancelButtonText: 'ביטול',
        confirmButtonText: 'דחה מוצר',
        inputValidator: (value) => {
          if (!value) {
            return 'חובה להזין סיבה לדחייה';
          }
        },
      });

      if (!reason) return;

      setActionLoadingId(product.id);
      if (product.source === 'marketplace') {
        await rejectMarketplaceProduct(product.id, reason);
      } else {
        await rejectProduct({ productId: product.id, reason });
      }
      Swal.fire({ icon: 'success', title: 'המוצר נדחה', timer: 1500, showConfirmButton: false });
      await fetchPending();
    } catch (e) {
      console.error('Reject failed', e);
      Swal.fire({ icon: 'error', title: 'שגיאה בדחיית מוצר' });
    } finally {
      setActionLoadingId(null);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div dir="rtl" className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-4">אישור מוצרים</h1>
      <div className="flex gap-2 mb-6">
        <button
          type="button"
          onClick={() => setActiveTab('marketplace')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            activeTab === 'marketplace' ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-700'
          }`}
        >
          שוק הבסטות ({marketplaceProducts.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('legacy')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            activeTab === 'legacy' ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-700'
          }`}
        >
          מוצרים שבועיים / עצמאיים ({legacyProducts.length})
        </button>
      </div>

      {products.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 border border-gray-200 rounded-lg">
          <h3 className="text-lg font-medium text-gray-900 mb-2">אין מוצרים ממתינים לאישור</h3>
          <p className="text-gray-600">
            {activeTab === 'marketplace'
              ? 'מוצרים שיוספו על ידי בעלי בסטה בשוק יופיעו כאן.'
              : 'מוצרים שיוספו על ידי חקלאים עצמאיים יופיעו כאן.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {products.map((p) => (
            <div key={`${p.source}-${p.id}`} className="bg-white rounded-lg border border-gray-200 p-4 flex gap-4 items-start">
              {Array.isArray(p.images) && p.images[0] && (
                <img src={p.images[0]} alt={p.name} className="w-24 h-24 object-cover rounded" />
              )}
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{p.name}</h2>
                    <div className="text-sm text-gray-600">₪{Number(p.price || 0).toFixed(2)}</div>
                    {p.description && (
                      <p className="text-sm text-gray-600 mt-1 line-clamp-2">{p.description}</p>
                    )}
                    {p.category && (
                      <div className="text-xs text-gray-500 mt-1">קטגוריה: {p.category}</div>
                    )}
                    {p.vatType != null && (
                      <div className="text-xs text-gray-500 mt-1">סוג מע"מ: {p.vatType}</div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(p)}
                      disabled={actionLoadingId === p.id}
                      className={`px-3 py-1 rounded bg-green-600 text-white text-sm ${actionLoadingId === p.id ? 'opacity-60 cursor-not-allowed' : 'hover:bg-green-700'}`}
                    >
                      אישור
                    </button>
                    <button
                      onClick={() => handleReject(p)}
                      disabled={actionLoadingId === p.id}
                      className={`px-3 py-1 rounded bg-red-600 text-white text-sm ${actionLoadingId === p.id ? 'opacity-60 cursor-not-allowed' : 'hover:bg-red-700'}`}
                    >
                      דחייה
                    </button>
                  </div>
                </div>
                {Array.isArray(p.options) && p.options.length > 0 && (
                  <div className="text-xs text-gray-500 mt-2">אפשרויות: {p.options.join(', ')}</div>
                )}
                <div className="text-xs text-gray-500 mt-1">
                  בעלים: {p.ownerEmail || p.Owner_Email || p.businessId || p.Owner_ID}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProductApprovals;
