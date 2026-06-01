import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  DEFAULT_MANUAL_PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
} from '../../services/marketplaceService';
import { storeFulfillmentToForm } from '../../constants/marketplaceFulfillment';
import MarketplaceFulfillmentEditor from './MarketplaceFulfillmentEditor';

const formatCurrency = (value) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(Number(value || 0));

/**
 * Shared promotion create/edit form fields.
 */
const MarketplacePromotionEditor = ({
  form,
  onChange,
  approvedProducts = [],
  storeForm = {},
  onToggleProduct,
  onTogglePaymentMethod,
  onSubmit,
  saving = false,
  submitLabel = 'שמירה',
  showCancel = false,
  onCancel,
}) => {
  const selectedProductSet = useMemo(() => new Set(form.productIds || []), [form.productIds]);
  const storeFulfillment = storeFulfillmentToForm(storeForm);

  const patch = (updates) => onChange({ ...form, ...updates });

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <input
        value={form.title || ''}
        onChange={(e) => patch({ title: e.target.value })}
        placeholder="שם ההזמנה השבועית"
        className="mp-input"
        required
      />
      <textarea
        value={form.description || ''}
        onChange={(e) => patch({ description: e.target.value })}
        placeholder="תיאור ההזמנה השבועית"
        rows={3}
        className="mp-textarea"
      />
      <MarketplaceFulfillmentEditor
        mode="promotion"
        value={form}
        storeFulfillment={storeFulfillment}
        onChange={(fulfillmentPatch) => patch(fulfillmentPatch)}
      />
      <div>
        <p className="text-sm font-medium text-gray-700 mb-1">מוצרים בקידום</p>
        <p className="mp-promotion-products-intro">
          סמנו מוצרים מאושרים. ניתן להוסיף מוצרים מ{' '}
          <Link to="/marketplace/products">רשימת המוצרים</Link>.
        </p>
        {approvedProducts.length === 0 ? (
          <div className="text-sm text-gray-600 bg-yellow-50 border border-yellow-200 rounded-xl p-4">
            אין מוצרים מאושרים. הוסיפו מוצרים והמתינו לאישור מנהל.
          </div>
        ) : (
          <>
            <p className="mp-promotion-selected-count">
              נבחרו {form.productIds?.length || 0} מתוך {approvedProducts.length} מוצרים
            </p>
            <div className="mp-promotion-product-grid">
              {approvedProducts.map((product) => {
                const isSelected = selectedProductSet.has(product.id);
                return (
                  <label
                    key={product.id}
                    className={`mp-promotion-product-option ${isSelected ? 'is-selected' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleProduct(product.id)}
                    />
                    <span className="mp-promotion-product-option-text">
                      <span className="block font-medium text-gray-900">{product.name}</span>
                      <span className="block text-sm text-gray-600">
                        {formatCurrency(product.price)}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </>
        )}
      </div>
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">אמצעי תשלום ידניים</p>
        <div className="flex flex-wrap gap-2">
          {DEFAULT_MANUAL_PAYMENT_METHODS.map((method) => (
            <label
              key={method}
              className="inline-flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-full px-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                checked={(form.manualPaymentMethods || []).includes(method)}
                onChange={() => onTogglePaymentMethod(method)}
              />
              {PAYMENT_METHOD_LABELS[method]}
            </label>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={saving || approvedProducts.length === 0}
          className="mp-btn mp-btn-wood"
          style={{ opacity: saving || approvedProducts.length === 0 ? 0.6 : 1 }}
        >
          {saving ? 'שומר...' : submitLabel}
        </button>
        {showCancel && (
          <button type="button" className="mp-btn mp-btn-primary" onClick={onCancel}>
            ביטול
          </button>
        )}
      </div>
    </form>
  );
};

export default MarketplacePromotionEditor;
