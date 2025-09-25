import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import LoadingSpinner from '../LoadingSpinner';
import Swal from 'sweetalert2';
import { verifyProduct, rejectProduct } from '../../services/independentAdminService';

const ProductApprovals = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const fetchPending = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'Products'),
        where('verified', '==', false),
        where('rejected', '!=', true)
      );
      const snap = await getDocs(q);
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setProducts(items);
    } catch (e) {
      console.error('Failed to load pending products', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, []);

  const handleApprove = async (product) => {
    try {
      setActionLoadingId(product.id);
      await verifyProduct({ productId: product.id });
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
        }
      });

      if (!reason) return; // User cancelled

      setActionLoadingId(product.id);
      await rejectProduct({ productId: product.id, reason });
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
      <h1 className="text-2xl font-bold text-gray-800 mb-6">אישור מוצרים</h1>
      {products.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 border border-gray-200 rounded-lg">
          <h3 className="text-lg font-medium text-gray-900 mb-2">אין מוצרים ממתינים לאישור</h3>
          <p className="text-gray-600">מוצרים שיוספו על ידי חקלאים עצמאיים יופיעו כאן.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {products.map((p) => (
            <div key={p.id} className="bg-white rounded-lg border border-gray-200 p-4 flex gap-4 items-start">
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
                    <div className="text-xs text-gray-500 mt-1">סוג מע"מ: {p.vatType ?? '—'}</div>
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
                <div className="text-xs text-gray-500 mt-1">בעלים: {p.Owner_Email || p.Owner_ID}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProductApprovals; 