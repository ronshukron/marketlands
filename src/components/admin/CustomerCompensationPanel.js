import React, { useEffect, useMemo, useState } from 'react';
import Swal from 'sweetalert2';
import { listIntroductionBasketProductCandidates } from '../../services/introductionBasketService';
import {
  COMPENSATION_STATUSES,
  assignCompensation,
  listCompensationsForIdentity,
  restoreCompensation,
  revokeCompensation,
} from '../../services/compensationService';

const STATUS_LABELS = {
  [COMPENSATION_STATUSES.ACTIVE]: 'ממתין להזמנה הבאה',
  [COMPENSATION_STATUSES.REDEEMED]: 'מומש',
  [COMPENSATION_STATUSES.REVOKED]: 'בוטל',
};

const STATUS_CLASSES = {
  [COMPENSATION_STATUSES.ACTIVE]: 'bg-amber-100 text-amber-800',
  [COMPENSATION_STATUSES.REDEEMED]: 'bg-green-100 text-green-800',
  [COMPENSATION_STATUSES.REVOKED]: 'bg-gray-100 text-gray-600',
};

const formatMoney = (value) => `₪${Number(value || 0).toFixed(2)}`;

const formatWhen = (value) => {
  if (!value) return '-';
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('he-IL');
};

const CustomerCompensationPanel = ({ customer, adminUid, adminName }) => {
  const [grants, setGrants] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [selectedCandidateKey, setSelectedCandidateKey] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const identityFields = useMemo(() => ({
    uid: customer?.userId || '',
    phone: customer?.phone || '',
    email: customer?.email || '',
  }), [customer?.userId, customer?.phone, customer?.email]);

  const selectedCandidate = useMemo(
    () => candidates.find((item) => `${item.orderId}:${item.productId}` === selectedCandidateKey) || null,
    [candidates, selectedCandidateKey]
  );

  const filteredCandidates = useMemo(() => {
    const query = productQuery.trim().toLowerCase();
    return candidates.filter((candidate) => {
      if (!query) return true;
      return [
        candidate.productName,
        candidate.businessName,
        candidate.selectedOption,
        candidate.orderId,
      ].some((value) => String(value || '').toLowerCase().includes(query));
    }).slice(0, 80);
  }, [candidates, productQuery]);

  const loadGrants = async () => {
    setLoading(true);
    setError('');
    try {
      const next = await listCompensationsForIdentity(identityFields);
      setGrants(next);
    } catch (err) {
      console.error('Failed to load compensations', err);
      setError(err?.code === 'permission-denied'
        ? 'אין הרשאה לטעון פיצויים. פרסמו את בלוק compensationRecipients לכללי Firestore לפני ה-deny הכללי.'
        : 'טעינת הפיצויים נכשלה.');
    } finally {
      setLoading(false);
    }
  };

  const loadProducts = async () => {
    setProductsLoading(true);
    try {
      const next = await listIntroductionBasketProductCandidates();
      setCandidates(next);
    } catch (err) {
      console.error('Failed to load compensation products', err);
      Swal.fire('שגיאה', 'טעינת מוצרי החקלאים נכשלה. נסו לרענן את הדף.', 'error');
    } finally {
      setProductsLoading(false);
    }
  };

  useEffect(() => {
    if (!customer) return;
    loadGrants();
  }, [customer?.userId, customer?.phone, customer?.email]);

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    if (!selectedCandidate) return;
    const nextQuantity = selectedCandidate.measurementType === 'kg'
      ? Number(selectedCandidate.unitSize) || 1
      : 1;
    setQuantity(nextQuantity);
  }, [selectedCandidateKey]);

  const handleAssign = async () => {
    if (!selectedCandidate) {
      Swal.fire('שגיאה', 'בחרו מוצר לפיצוי', 'error');
      return;
    }
    try {
      setSaving(true);
      await assignCompensation({
        ...identityFields,
        displayName: customer?.name || '',
        product: selectedCandidate,
        quantity: Number(quantity),
        reason,
        assignedBy: adminUid,
        assignedByName: adminName || '',
      });
      setReason('');
      await loadGrants();
      Swal.fire('נשמר', 'הפיצוי יצורף אוטומטית להזמנה הבאה של הלקוח.', 'success');
    } catch (err) {
      console.error('Failed to assign compensation', err);
      const messages = {
        IDENTITY_REQUIRED: 'חסר מזהה לקוח, טלפון או אימייל',
        PRODUCT_REQUIRED: 'בחרו מוצר לפיצוי',
        QUANTITY_INVALID: 'הכמות חייבת להיות גדולה מאפס',
        QUANTITY_TOO_LARGE: 'הכמות גדולה מדי',
        REASON_TOO_LONG: 'סיבת הפיצוי ארוכה מדי',
      };
      Swal.fire('שגיאה', messages[err?.message] || 'שמירת הפיצוי נכשלה', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (grant) => {
    const confirmed = await Swal.fire({
      title: 'לבטל את הפיצוי?',
      text: grant.productSnapshot?.productName || '',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'כן, בטל',
      cancelButtonText: 'השאר',
    });
    if (!confirmed.isConfirmed) return;
    try {
      await revokeCompensation(grant.identityKey, grant.id, adminUid);
      await loadGrants();
    } catch (err) {
      Swal.fire('שגיאה', 'ביטול הפיצוי נכשל', 'error');
    }
  };

  const handleRestore = async (grant) => {
    try {
      await restoreCompensation(grant.identityKey, grant.id, adminUid);
      await loadGrants();
    } catch (err) {
      Swal.fire('שגיאה', 'שחזור הפיצוי נכשל', 'error');
    }
  };

  if (!customer) return null;

  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded p-4">
      <h3 className="font-bold text-gray-800 mb-1">פיצוי להזמנה הבאה</h3>
      <p className="text-xs text-gray-500 mb-4">
        המוצר יישמר ללקוח ללא תאריך תפוגה ויצורף אוטומטית רק אחרי שליחת ההזמנה הבאה.
        אם המוצר לא יהיה זמין אז, עדיין יצורף לפי הצילום שנשמר כאן במחיר ₪0.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">חיפוש מוצר</label>
          <input
            type="search"
            value={productQuery}
            onChange={(e) => setProductQuery(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-2 text-sm"
            placeholder="שם מוצר, חקלאי או הזמנה"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">כמות</label>
          <input
            type="number"
            min="0.1"
            step="0.1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-2 text-sm"
          />
        </div>
      </div>

      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-600 mb-1">מוצר לפיצוי</label>
        <select
          value={selectedCandidateKey}
          onChange={(e) => setSelectedCandidateKey(e.target.value)}
          className="w-full border border-gray-300 rounded px-2 py-2 text-sm"
          disabled={productsLoading}
        >
          <option value="">{productsLoading ? 'טוען מוצרים...' : 'בחרו מוצר...'}</option>
          {filteredCandidates.map((candidate) => (
            <option
              key={`${candidate.orderId}:${candidate.productId}`}
              value={`${candidate.orderId}:${candidate.productId}`}
            >
              {candidate.productName} · {candidate.businessName} · {formatMoney(candidate.price)}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-600 mb-1">סיבה (אופציונלי)</label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full border border-gray-300 rounded px-2 py-2 text-sm"
          placeholder="למשל: פרי חסר / איכות"
          maxLength={500}
        />
      </div>

      <button
        type="button"
        onClick={handleAssign}
        disabled={saving || !selectedCandidate}
        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded text-sm disabled:opacity-50"
      >
        {saving ? 'שומר...' : 'הוסף פיצוי להזמנה הבאה'}
      </button>

      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

      <div className="mt-4 overflow-x-auto border rounded bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-right">מוצר</th>
              <th className="p-2 text-right">כמות</th>
              <th className="p-2 text-right">שווי מקורי</th>
              <th className="p-2 text-right">סטטוס</th>
              <th className="p-2 text-right">נוצר</th>
              <th className="p-2 text-right">פעולות</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading && (
              <tr>
                <td colSpan="6" className="p-4 text-center text-gray-400">טוען פיצויים...</td>
              </tr>
            )}
            {!loading && grants.map((grant) => (
              <tr key={`${grant.identityKey}:${grant.id}`}>
                <td className="p-2">
                  <div className="font-medium text-gray-900">{grant.productSnapshot?.productName}</div>
                  <div className="text-xs text-gray-500">{grant.productSnapshot?.businessName}</div>
                  {grant.reason && <div className="text-xs text-gray-500">{grant.reason}</div>}
                  {grant.redeemedOrderId && (
                    <div className="text-xs text-gray-500">הזמנה: {grant.redeemedOrderId}</div>
                  )}
                </td>
                <td className="p-2">{grant.quantity}</td>
                <td className="p-2">{formatMoney(grant.originalValue)}</td>
                <td className="p-2">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_CLASSES[grant.status] || ''}`}>
                    {STATUS_LABELS[grant.status] || grant.status}
                  </span>
                </td>
                <td className="p-2 whitespace-nowrap">{formatWhen(grant.assignedAt)}</td>
                <td className="p-2 whitespace-nowrap">
                  {grant.status === COMPENSATION_STATUSES.ACTIVE && (
                    <button
                      type="button"
                      onClick={() => handleRevoke(grant)}
                      className="text-red-600 hover:underline text-xs font-bold"
                    >
                      בטל
                    </button>
                  )}
                  {grant.status !== COMPENSATION_STATUSES.ACTIVE && (
                    <button
                      type="button"
                      onClick={() => handleRestore(grant)}
                      className="text-emerald-700 hover:underline text-xs font-bold"
                    >
                      שחזר להזמנה הבאה
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!loading && grants.length === 0 && (
              <tr>
                <td colSpan="6" className="p-4 text-center text-gray-400">אין פיצויים ללקוח זה.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CustomerCompensationPanel;
