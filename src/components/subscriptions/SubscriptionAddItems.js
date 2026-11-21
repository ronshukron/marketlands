import React, { useMemo, useState } from 'react';
import Swal from 'sweetalert2';
import {
  addSubscriptionOrderItems,
  describeSubscriptionError,
  listSubscriptionAddableProducts,
} from '../../services/basketSubscriptionService';

const UNIT_LABELS = { kg: 'ק״ג', unit: 'יח׳', package: 'מארז' };

const defaultQuantity = (product) => (product.measurementType === 'kg' ? (product.unitSize || 1) : 1);
const quantityStep = (product) => (product.measurementType === 'kg' ? (product.unitSize || 0.5) : 1);

/**
 * Lets a subscriber add products to one delivery. Only products whose
 * farmer form is still open for that delivery are offered (checked again on save).
 */
const SubscriptionAddItems = ({ orderId, onAdded }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState([]);
  const [queryText, setQueryText] = useState('');
  const [quantities, setQuantities] = useState({});
  const [savingId, setSavingId] = useState('');

  const loadProducts = async () => {
    setOpen(true);
    setLoading(true);
    try {
      const result = await listSubscriptionAddableProducts(orderId);
      setProducts(Array.isArray(result?.products) ? result.products : []);
    } catch (error) {
      Swal.fire('שגיאה', describeSubscriptionError(error), 'error');
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const text = queryText.trim().toLowerCase();
    return products
      .filter((product) => !text || [product.productName, product.businessName, product.category]
        .some((value) => String(value || '').toLowerCase().includes(text)))
      .slice(0, 60);
  }, [products, queryText]);

  const getQuantity = (product) => quantities[product.productId] ?? defaultQuantity(product);

  const handleAdd = async (product) => {
    const quantity = Number(getQuantity(product));
    if (!(quantity > 0)) return;
    setSavingId(product.productId);
    try {
      await addSubscriptionOrderItems(orderId, [{
        productId: product.productId,
        formId: product.formId,
        quantity,
        selectedOption: product.options?.[0] || '',
      }]);
      setProducts((prev) => prev.filter((entry) => entry.productId !== product.productId));
      if (onAdded) await onAdded();
    } catch (error) {
      Swal.fire('לא נוסף', describeSubscriptionError(error), 'error');
    } finally {
      setSavingId('');
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={loadProducts}
        className="w-full py-2.5 rounded-lg border-2 border-dashed border-emerald-300 text-emerald-700 font-semibold hover:bg-emerald-50"
      >
        + הוספת מוצרים למשלוח הזה
      </button>
    );
  }

  return (
    <section className="border border-emerald-200 rounded-lg p-4 bg-emerald-50/40">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-md font-semibold text-gray-800">הוספת מוצרים</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-gray-500 hover:underline">סגירה</button>
      </div>
      <p className="text-xs text-gray-600 mb-3">
        מוצגים רק מוצרים שההזמנה מהחקלאי שלהם עדיין פתוחה למשלוח הזה ויש להם מלאי.
      </p>
      <input
        value={queryText}
        onChange={(event) => setQueryText(event.target.value)}
        placeholder="חיפוש מוצר או חקלאי"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 mb-3"
      />
      {loading ? (
        <p className="text-center text-gray-500 py-4">טוען מוצרים...</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-gray-500 py-4">אין כרגע מוצרים שאפשר להוסיף</p>
      ) : (
        <ul className="divide-y divide-gray-100 max-h-96 overflow-auto bg-white rounded-lg border border-gray-100">
          {filtered.map((product) => (
            <li key={product.productId} className="p-3 flex items-center gap-3">
              {product.image ? (
                <img src={product.image} alt={product.productName} className="w-12 h-12 rounded object-cover" loading="lazy" />
              ) : (
                <div className="w-12 h-12 rounded bg-gray-100" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{product.productName}</p>
                <p className="text-xs text-gray-500 truncate">
                  {product.businessName} · ₪{Number(product.price).toFixed(2)}
                  {product.measurementType === 'package' ? '/מארז' : '/ק״ג'}
                </p>
              </div>
              <input
                type="number"
                min={quantityStep(product)}
                step={quantityStep(product)}
                value={getQuantity(product)}
                onChange={(event) => setQuantities((prev) => ({ ...prev, [product.productId]: event.target.value }))}
                aria-label={`כמות ${product.productName}`}
                className="w-20 rounded border border-gray-300 px-2 py-1 text-right"
              />
              <span className="text-xs text-gray-500 w-8">{UNIT_LABELS[product.measurementType] || ''}</span>
              <button
                type="button"
                disabled={savingId === product.productId}
                onClick={() => handleAdd(product)}
                className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50"
              >
                {savingId === product.productId ? 'מוסיף...' : 'הוסף'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default SubscriptionAddItems;
