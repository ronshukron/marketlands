import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Swal from 'sweetalert2';
import { useAuth } from '../../contexts/authContext';
import {
  getBusinessProfile,
  getSellerMarketplaceOrders,
  markMarketplaceOrderPaid,
  unmarkMarketplaceOrderHandoff,
  unmarkMarketplaceOrderPaid,
  unmarkMarketplaceOrderReady,
} from '../../services/marketplaceService';
import {
  markOrderReadyForSeller,
  finishMarketplaceOrderForSeller,
} from '../../services/marketplaceOrderCompletion';
import { isMarketplaceSellerRole } from '../../utils/marketplaceSellerRole';
import LoadingSpinner from '../LoadingSpinner';
import MarketplaceOrderCard from './MarketplaceOrderCard';
import './marketplace.css';

const MarketplaceBusinessOrders = () => {
  const { currentUser, userRole, userLoggedIn } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [hasSellerProfile, setHasSellerProfile] = useState(false);
  const [statusUpdatingOrderId, setStatusUpdatingOrderId] = useState(null);
  const [readyNoticeByOrderId, setReadyNoticeByOrderId] = useState({});
  const [handoffNoticeByOrderId, setHandoffNoticeByOrderId] = useState({});

  useEffect(() => {
    const load = async () => {
      if (!currentUser) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const [profile, data] = await Promise.all([
          getBusinessProfile(currentUser.uid),
          getSellerMarketplaceOrders(currentUser.uid),
        ]);
        setHasSellerProfile(Boolean(profile));
        setOrders(data);
      } catch (error) {
        console.error('Failed to load business marketplace orders', error);
        setHasSellerProfile(false);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [currentUser]);

  const filteredOrders = orders.filter((order) => {
    if (filter === 'all') return true;
    return order.fulfillmentStatus === filter;
  });

  const isSeller = isMarketplaceSellerRole(userRole) || hasSellerProfile;

  const patchOrder = (orderId, patch) => {
    setOrders((prev) =>
      prev.map((item) => (item.id === orderId ? { ...item, ...patch } : item))
    );
  };

  const runOrderStatusUpdate = async (orderId, updateFn) => {
    if (!currentUser?.uid || statusUpdatingOrderId) return null;

    setStatusUpdatingOrderId(orderId);
    try {
      return await updateFn();
    } catch (error) {
      console.error('Failed to update order status', error);
      Swal.fire({
        icon: 'error',
        title: 'לא ניתן לעדכן',
        text: error?.message || 'נסו שוב או בדקו הרשאות Firestore.',
      });
      return null;
    } finally {
      setStatusUpdatingOrderId(null);
    }
  };

  const handleMarkReady = async (order) => {
    if (!currentUser?.uid || statusUpdatingOrderId) return;

    const confirm = await Swal.fire({
      icon: 'question',
      title: 'לסמן הזמנה כמוכנה?',
      text: 'ההזמנה תעבור ל"מוכנות". לאחר מכן תוכלו לשלוח וואטסאפ ללקוח.',
      showCancelButton: true,
      confirmButtonText: 'כן, מוכנה',
      cancelButtonText: 'ביטול',
    });

    if (!confirm.isConfirmed) return;

    setStatusUpdatingOrderId(order.id);
    try {
      const result = await markOrderReadyForSeller({
        order,
        businessId: currentUser.uid,
      });

      patchOrder(order.id, result.order);

      setReadyNoticeByOrderId((prev) => ({
        ...prev,
        [order.id]: { whatsappUrl: result.whatsappUrl },
      }));

      await Swal.fire({
        icon: 'success',
        title: 'ההזמנה מוכנה',
        text: 'שלחו וואטסאפ ללקוח מהכפתור למטה.',
        timer: 3000,
        showConfirmButton: true,
        confirmButtonText: 'הבנתי',
      });
    } catch (error) {
      console.error('Failed to mark order ready', error);
      Swal.fire({
        icon: 'error',
        title: 'לא ניתן לעדכן',
        text: error?.message || 'נסו שוב.',
      });
    } finally {
      setStatusUpdatingOrderId(null);
    }
  };

  const handleUnmarkReady = async (order) => {
    const updated = await runOrderStatusUpdate(order.id, () =>
      unmarkMarketplaceOrderReady({ orderId: order.id, businessId: currentUser.uid })
    );
    if (!updated) return;

    patchOrder(order.id, updated);
    setReadyNoticeByOrderId((prev) => {
      const next = { ...prev };
      delete next[order.id];
      return next;
    });
  };

  const handleMarkPaid = async (order) => {
    const updated = await runOrderStatusUpdate(order.id, () =>
      markMarketplaceOrderPaid({ orderId: order.id, businessId: currentUser.uid })
    );
    if (updated) patchOrder(order.id, updated);
  };

  const handleUnmarkPaid = async (order) => {
    const updated = await runOrderStatusUpdate(order.id, () =>
      unmarkMarketplaceOrderPaid({ orderId: order.id, businessId: currentUser.uid })
    );
    if (updated) patchOrder(order.id, updated);
  };

  const handleMarkHandoff = async (order) => {
    if (!currentUser?.uid || statusUpdatingOrderId) return;

    const isDelivery =
      String(order.fulfillmentLabel || '').includes('משלוח')
      || order.fulfillmentMethod === 'delivery';

    const confirm = await Swal.fire({
      icon: 'question',
      title: isDelivery ? 'לסמן כנמסר ולהשלים?' : 'לסמן כנאסף ולהשלים?',
      text: 'ההזמנה תעבור ל"הושלמו".',
      showCancelButton: true,
      confirmButtonText: 'כן',
      cancelButtonText: 'ביטול',
    });

    if (!confirm.isConfirmed) return;

    setStatusUpdatingOrderId(order.id);
    try {
      const result = await finishMarketplaceOrderForSeller({
        order,
        businessId: currentUser.uid,
      });

      patchOrder(order.id, result.order);

      setHandoffNoticeByOrderId((prev) => ({
        ...prev,
        [order.id]: {
          emailSent: Boolean(result.emailResult?.sent),
          emailAttempted: Boolean(result.emailResult?.attempted),
        },
      }));

      setReadyNoticeByOrderId((prev) => {
        const next = { ...prev };
        delete next[order.id];
        return next;
      });

      await Swal.fire({
        icon: 'success',
        title: 'ההזמנה הושלמה',
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error('Failed to finish order handoff', error);
      Swal.fire({
        icon: 'error',
        title: 'לא ניתן לעדכן',
        text: error?.message || 'נסו שוב.',
      });
    } finally {
      setStatusUpdatingOrderId(null);
    }
  };

  const handleUnmarkHandoff = async (order) => {
    const confirm = await Swal.fire({
      icon: 'question',
      title: 'לבטל השלמה?',
      text: 'ההזמנה תחזור ל"מוכנות".',
      showCancelButton: true,
      confirmButtonText: 'כן, בטל',
      cancelButtonText: 'ביטול',
    });

    if (!confirm.isConfirmed) return;

    const updated = await runOrderStatusUpdate(order.id, () =>
      unmarkMarketplaceOrderHandoff({ orderId: order.id, businessId: currentUser.uid })
    );
    if (!updated) return;

    patchOrder(order.id, updated);
    setHandoffNoticeByOrderId((prev) => {
      const next = { ...prev };
      delete next[order.id];
      return next;
    });
  };

  if (!userLoggedIn) {
    return (
      <div className="mp-page py-12" dir="rtl">
        <div className="mp-main mp-empty text-center">
          <h1 className="mp-section-title mb-3">הזמנות מהשוק</h1>
          <Link to="/login" className="mp-btn mp-btn-wood">
            התחברות
          </Link>
        </div>
      </div>
    );
  }

  if (!loading && !isSeller) {
    return (
      <div className="mp-page py-12" dir="rtl">
        <div className="mp-main mp-empty text-center">
          <h1 className="mp-section-title mb-3">גישה לבעלי בסטה בלבד</h1>
          <Link to="/community-marketplace" className="mp-btn mp-btn-wood mt-4">
            לשוק הבסטות
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mp-page py-8" dir="rtl">
      <div className="mp-main mp-stack">
        <div className="mp-panel">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <Link to="/marketplace/dashboard" className="mp-link">
                ← לוח הבסטה
              </Link>
              <h1 className="mp-section-title mt-2">הזמנות מהשוק</h1>
              <p className="mp-section-note mt-1">
                שלבים: מוכנה → תשלום → נאסף/נמסר (הושלמו).
              </p>
            </div>
            <span className="mp-badge">{orders.length} הזמנות</span>
          </div>

          <div className="mp-order-filters mt-4">
            {[
              { id: 'all', label: 'הכל' },
              { id: 'new', label: 'חדשות' },
              { id: 'confirmed', label: 'אושרו' },
              { id: 'ready', label: 'מוכנות' },
              { id: 'completed', label: 'הושלמו' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                className={`mp-toggle-btn ${filter === item.id ? 'is-active' : ''}`}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        )}

        {!loading && filteredOrders.length === 0 && (
          <div className="mp-panel mp-empty text-center">
            <h2 className="mp-empty-title">אין הזמנות להצגה</h2>
            <p className="mp-empty-text">
              {orders.length === 0
                ? 'כשלקוחות יזמינו מהבסטה — ההזמנות יופיעו כאן.'
                : 'אין הזמנות בסינון שנבחר.'}
            </p>
          </div>
        )}

        {!loading && filteredOrders.length > 0 && (
          <div className="mp-order-list">
            {filteredOrders.map((order) => (
              <MarketplaceOrderCard
                key={order.id}
                order={order}
                view="business"
                onMarkReady={handleMarkReady}
                onUnmarkReady={handleUnmarkReady}
                onMarkPaid={handleMarkPaid}
                onUnmarkPaid={handleUnmarkPaid}
                onMarkHandoff={handleMarkHandoff}
                onUnmarkHandoff={handleUnmarkHandoff}
                statusUpdating={statusUpdatingOrderId === order.id}
                readyNotice={readyNoticeByOrderId[order.id]}
                handoffNotice={handoffNoticeByOrderId[order.id]}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MarketplaceBusinessOrders;
