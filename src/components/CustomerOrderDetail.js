import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { useAuth } from '../contexts/authContext';
import LoadingSpinner from './LoadingSpinner';
import {
  computeCustomerOrderGrandTotal,
  fetchOwnedCustomerOrderById,
  flattenCustomerOrderLines,
  getOrderDeliveryDateFromCustomerOrder,
  getOrderPickupSpot,
  isCustomerOrderEditable,
  isLineEditableForCustomer,
  toggleCustomerLineExclusion,
} from '../services/customerOrderService';
import { ensureLineIdsInBreakdown } from './adminV5/deliveryWeighingV5/v7/orderDraftUtils';

const formatDate = (timestamp) => {
  if (!timestamp) return 'לא זמין';
  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return 'לא זמין';
  }
};

const formatDeliveryDate = (dateKey) => {
  if (!dateKey) return null;
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString('he-IL', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
};

const getStatusBadge = (status) => {
  const normalized = String(status || '').toLowerCase();
  switch (normalized) {
    case 'completed':
    case 'paid':
      return 'bg-green-100 text-green-800';
    case 'pending_payment':
    case 'pending':
      return 'bg-yellow-100 text-yellow-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

const CustomerOrderDetail = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [order, setOrder] = useState(null);
  const [deliverySchedule, setDeliverySchedule] = useState(null);
  const [businessOrdersByKey, setBusinessOrdersByKey] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingLineId, setSavingLineId] = useState(null);

  useEffect(() => {
    const load = async () => {
      if (!currentUser?.uid) {
        setError('יש להתחבר כדי לצפות בהזמנה');
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const fetched = await fetchOwnedCustomerOrderById(orderId, currentUser.uid);
        if (!fetched) {
          setError('ההזמנה לא נמצאה או שאין לך הרשאה לצפות בה');
          return;
        }

        const { breakdown } = ensureLineIdsInBreakdown(orderId, fetched.orderBreakdown || {});
        const normalizedOrder = { ...fetched, orderBreakdown: breakdown };
        setOrder(normalizedOrder);

        const pickupSpot = getOrderPickupSpot(normalizedOrder);
        if (pickupSpot) {
          const scheduleSnap = await getDoc(doc(db, 'deliverySchedules', pickupSpot));
          setDeliverySchedule(scheduleSnap.exists() ? scheduleSnap.data() : null);
        }

        const businessKeys = Object.keys(breakdown);
        const businessEntries = await Promise.all(
          businessKeys.map(async (key) => {
            try {
              const snap = await getDoc(doc(db, 'Orders', key));
              return [key, snap.exists() ? snap.data() : null];
            } catch {
              return [key, null];
            }
          }),
        );
        setBusinessOrdersByKey(Object.fromEntries(businessEntries));
      } catch (err) {
        console.error(err);
        setError('אירעה שגיאה בטעינת ההזמנה');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [orderId, currentUser]);

  const excludedLineIds = useMemo(() => order?.customerExcludedLineIds || {}, [order]);
  const lines = useMemo(() => (order ? flattenCustomerOrderLines(order) : []), [order]);
  const activeLines = useMemo(() => lines.filter((line) => !excludedLineIds[line.lineId]), [lines, excludedLineIds]);
  const removedLines = useMemo(() => lines.filter((line) => excludedLineIds[line.lineId]), [lines, excludedLineIds]);

  const deliveryDate = order ? getOrderDeliveryDateFromCustomerOrder(order) : '';
  const pickupSpot = order ? getOrderPickupSpot(order) : '';
  const canEditOrder = order
    ? isCustomerOrderEditable(order, deliverySchedule, businessOrdersByKey)
    : false;

  const displayTotal = order ? computeCustomerOrderGrandTotal(order) : 0;

  const handleToggleLine = async (lineId, exclude) => {
    if (!order || !currentUser?.uid) return;
    setSavingLineId(lineId);
    try {
      const result = await toggleCustomerLineExclusion({
        orderId: order.id,
        customerOrderSource: order.customerOrderSource,
        lineId,
        exclude,
        userId: currentUser.uid,
      });
      setOrder((prev) => ({
        ...prev,
        orderBreakdown: result.orderBreakdown,
        items: result.items,
        customerExcludedLineIds: result.customerExcludedLineIds,
        grandTotal: result.grandTotal,
      }));
    } catch (err) {
      alert(err.message || 'אירעה שגיאה בעדכון ההזמנה');
    } finally {
      setSavingLineId(null);
    }
  };

  const isLineEditable = (line) => {
    if (!canEditOrder) return false;
    if (!deliveryDate || !deliverySchedule) return true;
    return isLineEditableForCustomer({
      deliveryDate,
      deliverySchedule,
      businessOrderData: businessOrdersByKey[line.businessOrderKey] || null,
      pickupSpot,
      customerOrder: order,
    });
  };

  if (loading) return <LoadingSpinner />;
  if (error) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-12 text-center" dir="rtl">
        <p className="text-red-600 font-semibold mb-4">{error}</p>
        <Link to="/my-orders" className="text-blue-600 hover:underline">חזרה להזמנות שלי</Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8" dir="rtl">
      <button
        type="button"
        onClick={() => navigate('/my-orders')}
        className="text-sm text-blue-600 hover:underline mb-4"
      >
        ← חזרה להזמנות שלי
      </button>

      <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
        <div className="p-6 bg-gradient-to-l from-blue-50 to-white border-b border-gray-100">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">פרטי הזמנה</h1>
              <p className="text-sm text-gray-500 mt-1">מספר: #{order.id.substring(0, 12)}...</p>
              <p className="text-sm text-gray-500">תאריך הזמנה: {formatDate(order.createdAt)}</p>
            </div>
            <span className={`self-start px-3 py-1 text-xs font-medium rounded-full ${getStatusBadge(order.paymentStatus)}`}>
              {order.paymentStatus || 'לא ידוע'}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-700">
            {pickupSpot && <p><span className="font-semibold">קהילה:</span> {pickupSpot}</p>}
            {deliveryDate && <p><span className="font-semibold">תאריך משלוח:</span> {formatDeliveryDate(deliveryDate)}</p>}
            {order.delayedPayment?.holdSum > 0 && (
              <p><span className="font-semibold">סכום החזקה:</span> ₪{Number(order.delayedPayment.holdSum).toFixed(2)}</p>
            )}
          </div>
        </div>

        {!canEditOrder && (
          <div className="mx-6 mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
            עבר זמן החיתוך לעריכה או שההזמנה כבר לא ניתנת לשינוי.
          </div>
        )}

        {canEditOrder && (
          <div className="mx-6 mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
            ניתן להסיר פריטים מההזמנה ולהחזירם עד זמן החיתוך. לא ניתן להוסיף פריטים חדשים.
          </div>
        )}

        <div className="p-6 space-y-6">
          {Object.entries(order.orderBreakdown || {}).map(([businessOrderId, businessOrder]) => {
            const businessLines = activeLines.filter((line) => line.businessOrderKey === businessOrderId);
            if (businessLines.length === 0) return null;
            return (
              <section key={businessOrderId} className="border border-gray-100 rounded-lg p-4">
                <h2 className="text-lg font-semibold text-gray-800 mb-3 border-r-4 border-blue-400 pr-3">
                  {businessOrder.businessName || 'עסק'}
                </h2>
                <ul className="space-y-3">
                  {businessLines.map((line) => (
                    <li key={line.lineId} className="flex items-start justify-between gap-3 py-2 border-b border-gray-50 last:border-0">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{line.productName}</p>
                        <p className="text-sm text-gray-500">
                          כמות: {line.quantity}
                          {line.selectedOption && line.selectedOption !== 'None' && ` • ${line.selectedOption}`}
                        </p>
                        <p className="text-sm font-semibold text-blue-600 mt-1">₪{line.lineTotal.toFixed(2)}</p>
                      </div>
                      {isLineEditable(line) && (
                        <button
                          type="button"
                          disabled={savingLineId === line.lineId}
                          onClick={() => handleToggleLine(line.lineId, true)}
                          className="text-xs px-3 py-1.5 rounded-md bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50"
                        >
                          {savingLineId === line.lineId ? 'שומר...' : 'הסר'}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          {removedLines.length > 0 && (
            <section className="border border-dashed border-gray-300 rounded-lg p-4 bg-gray-50">
              <h2 className="text-md font-semibold text-gray-700 mb-3">פריטים שהוסרו</h2>
              <ul className="space-y-3">
                {removedLines.map((line) => (
                  <li key={line.lineId} className="flex items-center justify-between gap-3 opacity-70">
                    <div>
                      <p className="font-medium text-gray-700 line-through">{line.productName}</p>
                      <p className="text-sm text-gray-500">₪{line.lineTotal.toFixed(2)}</p>
                    </div>
                    {isLineEditable(line) && (
                      <button
                        type="button"
                        disabled={savingLineId === line.lineId}
                        onClick={() => handleToggleLine(line.lineId, false)}
                        className="text-xs px-3 py-1.5 rounded-md bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50"
                      >
                        {savingLineId === line.lineId ? 'שומר...' : 'החזר'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
          <span className="text-lg font-semibold text-gray-800">סה״כ לתשלום</span>
          <span className="text-2xl font-bold text-blue-600">₪{displayTotal.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
};

export default CustomerOrderDetail;
