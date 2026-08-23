import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import Swal from 'sweetalert2';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import LoadingSpinner from '../LoadingSpinner';

const EditOrderProducts = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [order, setOrder] = useState(null);
  const [products, setProducts] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [minimumOrderAmount, setMinimumOrderAmount] = useState('');
  const [minimumOrderItemCount, setMinimumOrderItemCount] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!currentUser || !orderId) return;
      setLoading(true);
      try {
        const orderSnap = await getDoc(doc(db, 'Orders', orderId));
        if (!orderSnap.exists()) throw new Error('הזמנה לא נמצאה');
        const orderData = { id: orderSnap.id, ...orderSnap.data() };
        if (orderData.businessId !== currentUser.uid) throw new Error('אין הרשאה לערוך הזמנה זו');
        setOrder(orderData);
        setSelectedProducts(Array.isArray(orderData.selectedProducts) ? [...new Set(orderData.selectedProducts)] : []);
        setMinimumOrderAmount(orderData.minimumOrderAmount > 0 ? String(orderData.minimumOrderAmount) : '');
        setMinimumOrderItemCount(orderData.minimumOrderItemCount > 0 ? String(orderData.minimumOrderItemCount) : '');

        const productsSnap = await getDocs(query(
          collection(db, 'Products'),
          where('Owner_Email', '==', currentUser.email)
        ));
        setProducts(productsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (error) {
        Swal.fire('שגיאה', error.message || 'טעינה נכשלה', 'error').then(() => navigate('/Business-DashBoard'));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [currentUser, orderId, navigate]);

  const selectedList = useMemo(
    () => products.filter((p) => selectedProducts.includes(p.id)),
    [products, selectedProducts]
  );

  const toggleProduct = (productId) => {
    setSelectedProducts((prev) => (
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    ));
  };

  const handleSave = async () => {
    if (!order) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'Orders', order.id), {
        selectedProducts: [...new Set(selectedProducts)],
        minimumOrderAmount: minimumOrderAmount ? parseFloat(minimumOrderAmount) || 0 : 0,
        minimumOrderItemCount: minimumOrderItemCount ? parseInt(minimumOrderItemCount, 10) || 0 : 0,
        updatedAt: new Date(),
      });
      Swal.fire('נשמר', 'מוצרי טופס ההזמנה עודכנו', 'success');
      navigate('/Business-DashBoard');
    } catch (error) {
      Swal.fire('שגיאה', error.message || 'שמירה נכשלה', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="max-w-5xl mx-auto p-6" dir="rtl">
      <div className="flex flex-wrap gap-3 mb-4 text-sm">
        <span className="text-gray-900 font-medium">עריכת מוצרים</span>
        <span className="text-gray-300">|</span>
        <Link to={`/edit-order/${orderId}/communities`} className="text-blue-600 hover:text-blue-800">
          עריכת יישובים
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-2">עריכת מוצרים בטופס הזמנה</h1>
      <p className="text-gray-600 mb-6">{order?.orderName || order?.name || order.id}</p>

      <div className="mb-4 bg-blue-50 border border-blue-200 rounded p-4">
        <p className="font-medium mb-3">נבחרו {selectedProducts.length} מוצרים</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="block text-gray-700 mb-1">סכום מינימום (₪)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={minimumOrderAmount}
              onChange={(e) => setMinimumOrderAmount(e.target.value)}
              className="w-full px-3 py-2 border border-blue-200 rounded bg-white"
              placeholder="אופציונלי"
            />
          </label>
          <label className="block text-sm">
            <span className="block text-gray-700 mb-1">מינימום יחידות/מארזים</span>
            <input
              type="number"
              min="0"
              step="1"
              value={minimumOrderItemCount}
              onChange={(e) => setMinimumOrderItemCount(e.target.value)}
              className="w-full px-3 py-2 border border-blue-200 rounded bg-white"
              placeholder="אופציונלי"
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-gray-600">
          הלקוח יכול לעמוד באחד מהתנאים. רק פריטי יחידה או מארז נספרים למינימום הכמות.
        </p>
        {selectedList.length > 0 && (
          <ul className="mt-2 text-sm text-gray-700 list-disc list-inside">
            {selectedList.map((p) => <li key={p.id}>{p.Product_Name || p.name}</li>)}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {products.map((product) => {
          const isSelected = selectedProducts.includes(product.id);
          return (
            <button
              key={product.id}
              type="button"
              onClick={() => toggleProduct(product.id)}
              className={`text-right p-4 rounded-lg border-2 transition ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}
            >
              <div className="font-semibold">{product.Product_Name || product.name}</div>
              <div className="text-sm text-gray-500">₪{Number(product.Price || product.price || 0).toFixed(2)}</div>
            </button>
          );
        })}
      </div>

      <div className="flex gap-3">
        <button type="button" onClick={handleSave} disabled={saving} className="px-6 py-3 bg-green-600 text-white font-bold rounded hover:bg-green-700 disabled:opacity-50">
          שמור שינויים
        </button>
        <button type="button" onClick={() => navigate('/Business-DashBoard')} className="px-6 py-3 bg-gray-200 rounded hover:bg-gray-300">
          ביטול
        </button>
      </div>
    </div>
  );
};

export default EditOrderProducts;
