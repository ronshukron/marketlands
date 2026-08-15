import React, { useState, useEffect } from 'react';
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import LoadingSpinner from '../LoadingSpinner';
import {
  REFUND_STATUSES,
  buildRefundCompletedWhatsAppMessage,
  clampRefundPercent,
  computeRefundItemAmount,
  getRefundStatusDetails,
  sumRefundAmount,
} from '../../utils/refundUtils';
import { Link } from 'react-router-dom';
import {
  approveRefundRequest,
  markManualRefundCompleted,
} from '../../services/refundApprovalService';
import { buildOrderReadyWhatsAppUrl } from '../../utils/marketplaceOrderWhatsApp';

const ADMIN_UIDS = ['rfHOLhNoJOW8ByNypCtm3hlSNKs2'];
const FILTER_OPTIONS = [
  { value: 'all', label: 'הכל' },
  { value: REFUND_STATUSES.PENDING, label: 'ממתינים' },
  { value: REFUND_STATUSES.APPROVED_PRE_CHARGE, label: 'הופחתו לפני חיוב' },
  { value: REFUND_STATUSES.PENDING_MANUAL_REFUND, label: 'החזר ידני ממתין' },
  { value: REFUND_STATUSES.MANUALLY_REFUNDED, label: 'הוחזרו' },
  { value: REFUND_STATUSES.REJECTED, label: 'נדחו' },
  { value: REFUND_STATUSES.LEGACY_COMPLETED, label: 'הושלמו (ישן)' },
];

const getDisplayAmount = (request) => {
  if (request.approvedRefundAmount != null) {
    return request.approvedRefundAmount;
  }
  return request.requestedRefundAmount ?? request.orderAmount ?? 0;
};

const AdminRefundRequests = () => {
  const { currentUser } = useAuth();
  const [allRefundRequests, setAllRefundRequests] = useState([]);
  const [filteredRequests, setFilteredRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processingId, setProcessingId] = useState(null);
  const [filter, setFilter] = useState('pending');
  const [expandedId, setExpandedId] = useState(null);
  const [editItemsByRequest, setEditItemsByRequest] = useState({});

  useEffect(() => {
    const checkAdminAndFetchRequests = async () => {
      if (!currentUser) {
        setError('יש להתחבר כדי לגשת לדף זה');
        setLoading(false);
        return;
      }
      if (!ADMIN_UIDS.includes(currentUser.uid)) {
        setError('אין לך הרשאות לצפות בדף זה');
        setLoading(false);
        return;
      }
      fetchRefundRequests();
    };
    checkAdminAndFetchRequests();
  }, [currentUser]);

  useEffect(() => {
    if (filter === 'all') {
      setFilteredRequests(allRefundRequests);
    } else {
      setFilteredRequests(allRefundRequests.filter((request) => request.status === filter));
    }
  }, [filter, allRefundRequests]);

  const fetchRefundRequests = async () => {
    setLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'refunds'));
      const requests = querySnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
        createdAtFormatted: docSnap.data().createdAt
          ? new Date(docSnap.data().createdAt.toDate()).toLocaleDateString('he-IL')
          : 'N/A',
      }));
      requests.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(0);
        const dateB = b.createdAt?.toDate?.() || new Date(0);
        return dateB - dateA;
      });
      setAllRefundRequests(requests);
    } catch (err) {
      console.error('Error fetching refund requests:', err);
      setError('אירעה שגיאה בטעינת בקשות ההחזר');
    } finally {
      setLoading(false);
    }
  };

  const getEditItems = (request) => {
    if (editItemsByRequest[request.id]) return editItemsByRequest[request.id];
    if (Array.isArray(request.refundItems) && request.refundItems.length > 0) {
      return request.refundItems;
    }
    return [];
  };

  const updateEditItemPercent = (requestId, lineId, refundPercent) => {
    const normalizedPercent = clampRefundPercent(refundPercent);
    setEditItemsByRequest((prev) => {
      const items = (prev[requestId] || []).map((item) => {
        if (item.lineId !== lineId) return item;
        return {
          ...item,
          refundPercent: normalizedPercent,
          refundAmount: computeRefundItemAmount(item.lineTotal, normalizedPercent),
        };
      });
      return { ...prev, [requestId]: items };
    });
  };

  const toggleExpand = (request) => {
    if (expandedId === request.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(request.id);
    if (!editItemsByRequest[request.id] && Array.isArray(request.refundItems)) {
      setEditItemsByRequest((prev) => ({
        ...prev,
        [request.id]: request.refundItems.map((item) => ({ ...item })),
      }));
    }
  };

  const handleApprove = async (request) => {
    setProcessingId(request.id);
    try {
      const editItems = getEditItems(request);
      const result = await approveRefundRequest({
        refundId: request.id,
        adminId: currentUser.uid,
        refundItemsOverride: editItems,
      });

      setAllRefundRequests((prev) => prev.map((req) => (
        req.id === request.id
          ? {
            ...req,
            status: result.status,
            approvedRefundAmount: result.approvedRefundAmount ?? req.approvedRefundAmount,
            refundItems: result.refundItems || editItems,
            manualRefundReason: result.reason || req.manualRefundReason,
          }
          : req
      )));
      setExpandedId(null);
      if (result.status === REFUND_STATUSES.PENDING_MANUAL_REFUND) {
        alert('ההזמנה כבר חויבה או אינה ניתנת לעדכון ב-V7. הבקשה הועברה להחזר ידני.');
      } else if (result.status === REFUND_STATUSES.APPROVED_PRE_CHARGE) {
        alert('הזיכוי אושר ומחירי הפריטים עודכנו ב-V7 לפני החיוב.');
      }
    } catch (err) {
      console.error('Error approving refund:', err);
      alert('אירעה שגיאה באישור ההחזר');
    } finally {
      setProcessingId(null);
    }
  };

  const handleMarkManualRefunded = async (request) => {
    setProcessingId(request.id);
    try {
      await markManualRefundCompleted({
        refundId: request.id,
        adminId: currentUser.uid,
      });
      setAllRefundRequests((prev) => prev.map((req) => (
        req.id === request.id
          ? { ...req, status: REFUND_STATUSES.MANUALLY_REFUNDED }
          : req
      )));
      setFilter(REFUND_STATUSES.MANUALLY_REFUNDED);
      setExpandedId(request.id);
    } catch (err) {
      console.error('Error completing manual refund:', err);
      alert('אירעה שגיאה בסימון ההחזר כבוצע');
    } finally {
      setProcessingId(null);
    }
  };

  const handleStatusChange = async (requestId, newStatus) => {
    setProcessingId(requestId);
    try {
      const refundRef = doc(db, 'refunds', requestId);
      await updateDoc(refundRef, {
        status: newStatus,
        processedAt: serverTimestamp(),
        processedBy: currentUser.uid,
      });
      setAllRefundRequests((prev) => prev.map((req) => (
        req.id === requestId ? { ...req, status: newStatus } : req
      )));
      setExpandedId(null);
    } catch (err) {
      console.error('Error updating refund status:', err);
      alert('אירעה שגיאה בעדכון סטטוס ההחזר');
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusBadgeClass = (status) => {
    return getRefundStatusDetails(status).badgeClass;
  };

  const getStatusText = (status) => {
    return getRefundStatusDetails(status).adminLabel;
  };

  if (loading) return <LoadingSpinner />;
  if (error) {
    return (
      <div className="text-center p-8">
        <p className="text-red-600 font-semibold text-lg">{error}</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl" dir="rtl">
      <h1 className="text-2xl font-bold mb-6 text-center">ניהול בקשות החזר כספי</h1>

      <div className="mb-6 flex justify-center">
        <div className="flex flex-wrap justify-center gap-2" role="group">
          {FILTER_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`px-3 py-2 text-sm font-medium border border-gray-200 rounded-lg ${
                filter === value ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {filteredRequests.length === 0 ? (
        <div className="text-center p-8 bg-gray-50 rounded-lg">
          <p className="text-gray-500">לא נמצאו בקשות החזר {filter !== 'all' ? `בסטטוס ${getStatusText(filter)}` : ''}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRequests.map((request) => {
            const editItems = getEditItems(request);
            const displayAmount = getDisplayAmount(request);
            const isExpanded = expandedId === request.id;

            return (
              <div key={request.id} className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                <div className="p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-gray-500">תאריך</p>
                      <p className="font-medium">{request.createdAtFormatted}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">לקוח</p>
                      <p className="font-medium">{request.userName || 'לא צוין'}</p>
                      <p className="text-xs text-gray-500">{request.userEmail}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">סכום מבוקש</p>
                      <p className="font-bold text-blue-700">₪{Number(displayAmount).toFixed(2)}</p>
                      {request.orderAmount > 0 && (
                        <p className="text-xs text-gray-500">מתוך ₪{Number(request.orderAmount).toFixed(2)}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">סטטוס</p>
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeClass(request.status)}`}>
                        {getStatusText(request.status)}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => toggleExpand(request)}
                      className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-md"
                    >
                      {isExpanded ? 'סגור פרטים' : 'פרטים'}
                    </button>
                    {request.status === REFUND_STATUSES.PENDING && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleApprove(request)}
                          disabled={processingId === request.id}
                          className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                        >
                          {processingId === request.id ? 'מעדכן...' : 'אשר החזר'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStatusChange(request.id, REFUND_STATUSES.REJECTED)}
                          disabled={processingId === request.id}
                          className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                        >
                          דחה
                        </button>
                      </>
                    )}
                    {request.status === REFUND_STATUSES.PENDING_MANUAL_REFUND && (
                      <button
                        type="button"
                        onClick={() => handleMarkManualRefunded(request)}
                        disabled={processingId === request.id}
                        className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                      >
                        {processingId === request.id ? 'מעדכן...' : 'סמן כהוחזר'}
                      </button>
                    )}
                    {request.status === REFUND_STATUSES.MANUALLY_REFUNDED && (() => {
                      const message = buildRefundCompletedWhatsAppMessage({
                        customerName: request.userName,
                        amount: displayAmount,
                        orderId: request.orderId,
                      });
                      const whatsappUrl = buildOrderReadyWhatsAppUrl({
                        phone: request.userPhone,
                        message,
                      });
                      return whatsappUrl ? (
                        <a
                          href={whatsappUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1.5 text-xs bg-green-700 text-white rounded-md hover:bg-green-800"
                        >
                          שלח הודעת WhatsApp
                        </a>
                      ) : null;
                    })()}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50 p-4 space-y-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-800 mb-1">סיבה</p>
                      <p className="text-sm text-gray-700">{request.reason || '—'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800 mb-1">טלפון לקוח</p>
                      <p className="text-sm text-gray-700">{request.userPhone || 'לא צוין'}</p>
                    </div>

                    {request.orderId && (
                      <p className="text-sm">
                        <span className="font-semibold">הזמנה: </span>
                        <Link to={`/my-orders/${request.orderId}`} className="text-blue-600 hover:underline">
                          #{request.orderId.substring(0, 12)}...
                        </Link>
                      </p>
                    )}

                    {editItems.length > 0 ? (
                      <div>
                        <p className="text-sm font-semibold text-gray-800 mb-2">פריטים לזיכוי</p>
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-sm bg-white rounded border border-gray-200">
                            <thead className="bg-gray-100">
                              <tr>
                                <th className="px-3 py-2 text-right">מוצר</th>
                                <th className="px-3 py-2 text-right">עסק</th>
                                <th className="px-3 py-2 text-right">סכום שורה</th>
                                <th className="px-3 py-2 text-right">אחוז זיכוי</th>
                                <th className="px-3 py-2 text-right">סכום זיכוי</th>
                              </tr>
                            </thead>
                            <tbody>
                              {editItems.map((item) => (
                                <tr key={item.lineId || item.productName} className="border-t border-gray-100">
                                  <td className="px-3 py-2">{item.productName}</td>
                                  <td className="px-3 py-2">{item.businessName || '—'}</td>
                                  <td className="px-3 py-2">₪{Number(item.lineTotal || 0).toFixed(2)}</td>
                                  <td className="px-3 py-2">
                                    {request.status === REFUND_STATUSES.PENDING ? (
                                      <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={item.refundPercent ?? 100}
                                        onChange={(e) => updateEditItemPercent(
                                          request.id,
                                          item.lineId,
                                          Number(e.target.value),
                                        )}
                                        className="w-20 border border-gray-300 rounded px-2 py-1"
                                      />
                                    ) : (
                                      `${item.refundPercent ?? 100}%`
                                    )}
                                  </td>
                                  <td className="px-3 py-2 font-semibold">
                                    ₪{Number(item.refundAmount || 0).toFixed(2)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {request.status === REFUND_STATUSES.PENDING && (
                          <p className="text-sm font-semibold mt-2 text-green-800">
                            סה״כ לאישור: ₪{sumRefundAmount(editItems).toFixed(2)}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">בקשה כללית ללא פירוט פריטים (הזמנה חיצונית או בקשה ישנה)</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminRefundRequests;
