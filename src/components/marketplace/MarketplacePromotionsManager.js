import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Swal from 'sweetalert2';
import {
  saveMarketplacePromotion,
  toDate,
  updateMarketplacePromotionStatus,
} from '../../services/marketplaceService';
import { normalizePromotionFulfillment } from '../../constants/marketplaceFulfillment';
import { PROMOTION_STATUS_LABELS } from '../../utils/marketplacePromotionAggregation';
import MarketplacePromotionEditor from './MarketplacePromotionEditor';

const formatDate = (value) => {
  const date = toDate(value);
  return date ? date.toLocaleDateString('he-IL') : '—';
};

const promotionToForm = (promotion) => {
  if (!promotion) return null;
  const normalized = normalizePromotionFulfillment(promotion);
  return {
    id: promotion.id,
    title: promotion.title || '',
    description: promotion.description || '',
    productIds: Array.isArray(promotion.productIds) ? [...promotion.productIds] : [],
    status: promotion.status || 'active',
    startsAt: promotion.startsAt
      ? (toDate(promotion.startsAt)?.toISOString().slice(0, 10) || '')
      : '',
    endsAt: promotion.endsAt
      ? (toDate(promotion.endsAt)?.toISOString().slice(0, 10) || '')
      : '',
    deliveryDate: promotion.deliveryDate || '',
    pickupInstructions: promotion.pickupInstructions || '',
    manualPaymentMethods: promotion.manualPaymentMethods || [],
    sortRank: promotion.sortRank || 0,
    ...normalized,
  };
};

const MarketplacePromotionsManager = ({
  promotions = [],
  approvedProducts = [],
  storeForm = {},
  business = null,
  businessId,
  onReload,
  initialEditId = null,
}) => {
  const [editingId, setEditingId] = useState(initialEditId || null);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState(null);

  useEffect(() => {
    if (!initialEditId) return;
    const promo = promotions.find((p) => p.id === initialEditId);
    if (promo) {
      setEditingId(initialEditId);
      setEditForm(promotionToForm(promo));
    }
  }, [initialEditId, promotions]);

  const startEdit = (promotion) => {
    setEditingId(promotion.id);
    setEditForm(promotionToForm(promotion));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const toggleProduct = (productId) => {
    setEditForm((current) => {
      const next = new Set(current.productIds || []);
      next.has(productId) ? next.delete(productId) : next.add(productId);
      return { ...current, productIds: [...next] };
    });
  };

  const togglePaymentMethod = (method) => {
    setEditForm((current) => {
      const set = new Set(current.manualPaymentMethods || []);
      set.has(method) ? set.delete(method) : set.add(method);
      return { ...current, manualPaymentMethods: [...set] };
    });
  };

  const handleSaveEdit = async (event) => {
    event.preventDefault();
    if (!businessId || !editForm) return;

    if ((editForm.productIds || []).length === 0) {
      Swal.fire({ icon: 'warning', title: 'בחרו לפחות מוצר מאושר אחד' });
      return;
    }

    setSaving(true);
    try {
      await saveMarketplacePromotion({
        businessId,
        businessData: business || {},
        promotionData: editForm,
      });
      await onReload?.();
      cancelEdit();
      Swal.fire({ icon: 'success', title: 'הקידום עודכן', timer: 1600, showConfirmButton: false });
    } catch (error) {
      console.error('Failed to update promotion', error);
      Swal.fire({ icon: 'error', title: 'שגיאה בעדכון', text: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (promotion) => {
    if (!businessId || statusUpdatingId) return;

    const isActive = promotion.status === 'active' || !promotion.status;
    const nextStatus = isActive ? 'paused' : 'active';
    const actionLabel = isActive ? 'להשהות' : 'להפעיל מחדש';

    const confirm = await Swal.fire({
      icon: 'question',
      title: `${actionLabel} את הקידום?`,
      text: isActive
        ? 'הקידום לא יוצג ללקוחות בשוק (הזמנות קיימות נשמרות).'
        : 'הקידום יחזור להיות גלוי ללקוחות.',
      showCancelButton: true,
      confirmButtonText: 'כן',
      cancelButtonText: 'ביטול',
    });

    if (!confirm.isConfirmed) return;

    setStatusUpdatingId(promotion.id);
    try {
      await updateMarketplacePromotionStatus({
        businessId,
        promotionId: promotion.id,
        status: nextStatus,
      });
      await onReload?.();
      Swal.fire({
        icon: 'success',
        title: isActive ? 'הקידום הושהה' : 'הקידום הופעל',
        timer: 1400,
        showConfirmButton: false,
      });
    } catch (error) {
      Swal.fire({ icon: 'error', title: 'שגיאה', text: error.message });
    } finally {
      setStatusUpdatingId(null);
    }
  };

  return (
    <div className="mp-bench-content mp-stack">
      {editingId && editForm ? (
        <div className="mp-bench-panel">
          <h2 className="mp-bench-panel-title mp-section-title-chalk mb-4">
            עריכת הזמנה שבועית
          </h2>
          <MarketplacePromotionEditor
            form={editForm}
            onChange={setEditForm}
            approvedProducts={approvedProducts}
            storeForm={storeForm}
            onToggleProduct={toggleProduct}
            onTogglePaymentMethod={togglePaymentMethod}
            onSubmit={handleSaveEdit}
            saving={saving}
            submitLabel="שמירת שינויים"
            showCancel
            onCancel={cancelEdit}
          />
        </div>
      ) : null}

      <div className="mp-bench-panel">
        <div className="mp-bench-panel-head">
          <div>
            <h2 className="mp-bench-panel-title mp-section-title-chalk">השבוע בשוק</h2>
            <p className="mp-section-note text-sm mt-1">
              קידומים שבועיים שמוצגים ללקוחות בשוק
            </p>
          </div>
          <Link to="/marketplace/promotions/new" className="mp-btn mp-btn-wood mp-bench-btn-sm">
            פתיחת הזמנה שבועית
          </Link>
        </div>

        {promotions.length === 0 ? (
          <div className="mp-bench-empty">
            <p className="mp-section-note">עדיין לא נוצרו קידומים.</p>
            <Link to="/marketplace/promotions/new" className="mp-btn mp-btn-wood mt-3">
              פתיחת קידום ראשון
            </Link>
          </div>
        ) : (
          <ul className="mp-bench-promo-list">
            {promotions.map((promotion) => {
              const isActive = promotion.status === 'active' || !promotion.status;
              const productCount = Array.isArray(promotion.productIds)
                ? promotion.productIds.length
                : 0;

              return (
                <li key={promotion.id} className="mp-bench-promo-card">
                  <div className="mp-bench-promo-main">
                    <div className="mp-bench-promo-head">
                      <h3 className="mp-bench-promo-title">{promotion.title}</h3>
                      <span
                        className={`mp-bench-promo-badge${
                          isActive ? ' is-active' : ' is-paused'
                        }`}
                      >
                        {PROMOTION_STATUS_LABELS[promotion.status] || (isActive ? 'פעיל' : 'מושהה')}
                      </span>
                    </div>
                    <p className="mp-bench-promo-meta">
                      {formatDate(promotion.startsAt)} — {formatDate(promotion.endsAt)}
                      {promotion.deliveryDate && ` · משלוח ${promotion.deliveryDate}`}
                    </p>
                    <p className="mp-bench-promo-count">{productCount} מוצרים בקידום</p>
                  </div>
                  <div className="mp-bench-promo-actions">
                    <Link
                      to={`/marketplace/promotions/${promotion.id}/orders`}
                      className="mp-btn mp-btn-wood mp-bench-btn-sm"
                    >
                      הזמנות וסיכום
                    </Link>
                    <button
                      type="button"
                      className="mp-btn mp-btn-outline mp-bench-btn-sm"
                      onClick={() => startEdit(promotion)}
                    >
                      עריכה
                    </button>
                    <button
                      type="button"
                      className={`mp-btn mp-bench-btn-sm${
                        isActive ? ' mp-bench-btn-pause' : ' mp-bench-btn-resume'
                      }`}
                      disabled={statusUpdatingId === promotion.id}
                      onClick={() => handleToggleStatus(promotion)}
                    >
                      {statusUpdatingId === promotion.id
                        ? '...'
                        : isActive
                          ? 'השהיה'
                          : 'הפעלה'}
                    </button>
                    <Link
                      to={`/community-marketplace/order/${promotion.id}`}
                      className="mp-link mp-bench-promo-preview"
                      target="_blank"
                      rel="noreferrer"
                    >
                      צפייה ללקוח
                    </Link>
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

export default MarketplacePromotionsManager;
