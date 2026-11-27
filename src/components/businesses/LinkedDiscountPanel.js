import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import Swal from 'sweetalert2';
import { db } from '../../firebase/firebase';
import { getBusinessProductPromotions, saveBusinessProductPromotions } from '../../services/productPromotionService';
import {
  createGroupPromotionId,
  getGroupPromotionLabel,
  normalizeQuantityDiscount,
  validateGroupPromotion,
} from '../../utils/pricing';
import {
  LINKABLE_MEASUREMENT_TYPES,
  buildLinkedPromotion,
  discountMatchesPromotion,
  findProductPromotion,
  unlinkProduct,
  upsertPromotion,
} from '../../utils/linkedDiscount';

// "לחבר את ההנחה למוצרים נוספים" next to a product's quantity discount: the
// same shared promotion as /business-promotions ("מבצעים משותפים"), built
// from this product's "N for ₪X". Example: red and black raspberry, each "2 for
// ₪40"; linked, one red plus one black is ₪40 too.

const isVerified = (product) => product?.rejected !== true
  && (product?.verified === true || !Object.prototype.hasOwnProperty.call(product || {}, 'verified'));

async function loadFarmerCatalog({ businessId, ownerEmail }) {
  const [promotions, productsSnap] = await Promise.all([
    getBusinessProductPromotions(businessId),
    ownerEmail
      ? getDocs(query(collection(db, 'Products'), where('Owner_Email', '==', ownerEmail)))
      : Promise.resolve({ docs: [] }),
  ]);
  return {
    promotions,
    products: productsSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })),
  };
}

/**
 * Save the link for a product (also used by AddProduct right after the product is created).
 * @return {Promise<string>} '' when saved, otherwise the reason in Hebrew
 */
export async function saveLinkedDiscount({
  businessId, ownerEmail, productId, productName, measurementType, price, threshold, discountPrice, linkedIds,
  catalog = null,
}) {
  const { promotions, products } = catalog || await loadFarmerCatalog({ businessId, ownerEmail });
  const existing = findProductPromotion(promotions, productId);
  const promotion = buildLinkedPromotion({
    existing,
    productId,
    linkedIds,
    measurementType,
    threshold,
    price: discountPrice,
    createId: createGroupPromotionId,
  });
  const withThisProduct = [
    ...products.filter((product) => product.id !== productId),
    { id: productId, name: productName, price: Number(price), measurementType },
  ];
  const error = validateGroupPromotion({
    ...promotion,
    products: withThisProduct,
    existingPromotions: promotions,
    currentId: existing?.id,
  });
  if (error) return error;
  await saveBusinessProductPromotions(businessId, upsertPromotion(promotions, promotion));
  return '';
}

/**
 * @param {Object} props
 * @param {'edit'|'add'} props.mode add: the product has no id yet; the choice is saved with it
 * @param {string} props.businessId the farmer (businesses/{uid})
 * @param {string} props.ownerEmail Products.Owner_Email
 * @param {string} [props.productId] edit mode
 * @param {string} props.productName
 * @param {string} props.measurementType
 * @param {string|number} props.price regular price on the form
 * @param {string|number} props.threshold quantity discount threshold on the form
 * @param {string|number} props.discountPrice quantity discount price on the form
 * @param {Array<string>} [props.pendingLinkedIds] add mode
 * @param {Function} [props.onPendingChange] add mode
 */
export default function LinkedDiscountPanel({
  mode = 'edit', businessId, ownerEmail, productId = '', productName, measurementType, price, threshold, discountPrice,
  pendingLinkedIds = [], onPendingChange,
}) {
  const [catalog, setCatalog] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selection, setSelection] = useState([]);
  const [saving, setSaving] = useState(false);

  const linkable = LINKABLE_MEASUREMENT_TYPES.includes(measurementType);
  const discount = normalizeQuantityDiscount(threshold, discountPrice);

  useEffect(() => {
    if (!businessId || !linkable) return undefined;
    let active = true;
    loadFarmerCatalog({ businessId, ownerEmail })
      .then((loaded) => { if (active) setCatalog(loaded); })
      .catch(() => { if (active) setCatalog({ promotions: [], products: [] }); });
    return () => { active = false; };
  }, [businessId, ownerEmail, linkable]);

  const linked = mode === 'edit' && catalog ? findProductPromotion(catalog.promotions, productId) : null;
  const candidates = useMemo(() => (catalog?.products || []).filter((product) => (
    product.id !== productId && isVerified(product) && (product.measurementType || 'kg') === measurementType
  )), [catalog, measurementType, productId]);
  const nameOf = (id) => (catalog?.products || []).find((product) => product.id === id)?.name || 'מוצר';
  const linkedNames = linked ? linked.productIds.filter((id) => id !== productId).map(nameOf) : [];
  const pendingNames = pendingLinkedIds.map(nameOf);

  if (!linkable) {
    return (
      <p className="text-xs text-gray-500">
        חיבור הנחה למוצרים נוספים אפשרי רק במוצרים שנמכרים במארז או ביחידה.
      </p>
    );
  }

  const openPicker = () => {
    setSelection(linked ? linked.productIds.filter((id) => id !== productId) : pendingLinkedIds);
    setPickerOpen(true);
  };

  const save = async () => {
    if (mode === 'add') {
      onPendingChange?.(selection);
      setPickerOpen(false);
      return;
    }
    if (selection.length === 0) {
      Swal.fire('לא נבחרו מוצרים', 'בחרו לפחות מוצר אחד לחבר אליו את ההנחה.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const error = await saveLinkedDiscount({
        businessId, ownerEmail, productId, productName, measurementType, price,
        threshold: discount.quantityDiscountThreshold,
        discountPrice: discount.quantityDiscountPrice,
        linkedIds: selection,
        catalog,
      });
      if (error) {
        Swal.fire('לא נשמר', error, 'error');
        return;
      }
      setCatalog(await loadFarmerCatalog({ businessId, ownerEmail }));
      setPickerOpen(false);
      Swal.fire({ icon: 'success', title: 'ההנחה חוברה', timer: 1800, showConfirmButton: false });
    } catch (error) {
      Swal.fire('לא נשמר', error?.message || 'שמירת המבצע נכשלה', 'error');
    } finally {
      setSaving(false);
    }
  };

  const unlink = async () => {
    const answer = await Swal.fire({
      title: 'לנתק את ההנחה המשותפת?',
      text: 'כל מוצר יחזור להנחת הכמות שלו בלבד.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'ניתוק',
      cancelButtonText: 'ביטול',
    });
    if (!answer.isConfirmed) return;
    setSaving(true);
    try {
      await saveBusinessProductPromotions(businessId, unlinkProduct(catalog.promotions, productId));
      setCatalog(await loadFarmerCatalog({ businessId, ownerEmail }));
    } catch (error) {
      Swal.fire('לא נשמר', error?.message || 'שמירת המבצע נכשלה', 'error');
    } finally {
      setSaving(false);
    }
  };

  const updateToThisDiscount = async () => {
    setSelection(linked.productIds.filter((id) => id !== productId));
    setSaving(true);
    try {
      const error = await saveLinkedDiscount({
        businessId, ownerEmail, productId, productName, measurementType, price,
        threshold: discount.quantityDiscountThreshold,
        discountPrice: discount.quantityDiscountPrice,
        linkedIds: linked.productIds.filter((id) => id !== productId),
        catalog,
      });
      if (error) Swal.fire('לא נשמר', error, 'error');
      else setCatalog(await loadFarmerCatalog({ businessId, ownerEmail }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-emerald-200 bg-white p-3 text-sm" data-testid="linked-discount">
      {linked ? (
        <>
          <p className="font-semibold text-emerald-900">
            מחובר ל: {linkedNames.join(', ')}
            <span className="font-normal text-gray-600"> · {getGroupPromotionLabel(linked)} על המוצרים יחד</span>
          </p>
          {discount && !discountMatchesPromotion(linked, discount.quantityDiscountThreshold, discount.quantityDiscountPrice) && (
            <p className="mt-1 text-xs text-amber-800">
              ההנחה כאן שונה מההנחה המשותפת.{' '}
              <button type="button" onClick={updateToThisDiscount} disabled={saving} className="font-semibold underline">
                לעדכן את ההנחה המשותפת לפי המוצר הזה
              </button>
            </p>
          )}
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={openPicker} disabled={saving}
              className="rounded-md border border-emerald-300 px-3 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50">
              עריכה
            </button>
            <button type="button" onClick={unlink} disabled={saving}
              className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              ניתוק
            </button>
          </div>
        </>
      ) : (
        <>
          {mode === 'add' && pendingNames.length > 0 && (
            <p className="mb-2 font-semibold text-emerald-900">יחובר ל: {pendingNames.join(', ')} (יישמר עם המוצר)</p>
          )}
          <button
            type="button"
            onClick={openPicker}
            disabled={!discount || !catalog || saving}
            className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            לחבר את ההנחה למוצרים נוספים
          </button>
          <p className="mt-1 text-xs text-gray-500">
            {discount
              ? 'לדוגמה פטל אדום ופטל שחור: אחד מכל סוג יקבלו יחד את מחיר ההנחה.'
              : 'קודם מלאו הנחת כמות למוצר הזה.'}
          </p>
        </>
      )}

      {pickerOpen && (
        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3" role="group" aria-label="מוצרים לחיבור ההנחה">
          {candidates.length === 0 ? (
            <p className="text-xs text-gray-600">
              אין מוצרים מאושרים נוספים מאותו סוג ({measurementType === 'package' ? 'מארז' : 'יחידה'}).
            </p>
          ) : (
            <ul className="max-h-60 space-y-1 overflow-y-auto">
              {candidates.map((product) => (
                <li key={product.id}>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selection.includes(product.id)}
                      onChange={() => setSelection((prev) => (prev.includes(product.id)
                        ? prev.filter((id) => id !== product.id)
                        : [...prev, product.id]))}
                    />
                    <span>{product.name}</span>
                    <span className="text-xs text-gray-500">₪{Number(product.price || 0).toFixed(2)}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-gray-600">
            ההנחה המשותפת:{' '}
            {discount
              ? (measurementType === 'package'
                ? `${discount.quantityDiscountThreshold} ב-₪${(discount.quantityDiscountThreshold * discount.quantityDiscountPrice).toFixed(2)}`
                : `${discount.quantityDiscountThreshold}+ ב-₪${discount.quantityDiscountPrice.toFixed(2)} לק"ג`)
              : '—'}
            {' '}מכל המוצרים יחד, מאותו טופס הזמנה. כל מוצר יכול להיות רק במבצע משותף אחד.
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={save} disabled={saving}
              className="rounded-md bg-emerald-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">
              {saving ? 'שומרים…' : 'שמירה'}
            </button>
            <button type="button" onClick={() => setPickerOpen(false)} disabled={saving}
              className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700">
              ביטול
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
