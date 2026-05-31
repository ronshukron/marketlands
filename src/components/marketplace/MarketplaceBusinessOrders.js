import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Swal from 'sweetalert2';
import { useAuth } from '../../contexts/authContext';
import { getSellerMarketplaceOrders } from '../../services/marketplaceService';
import { finishMarketplaceOrderForSeller } from '../../services/marketplaceOrderCompletion';
import LoadingSpinner from '../LoadingSpinner';
import MarketplaceOrderCard from './MarketplaceOrderCard';
import './marketplace.css';

const MarketplaceBusinessOrders = () => {
  const { currentUser, userRole, userLoggedIn } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [completingOrderId, setCompletingOrderId] = useState(null);
  const [completionNoticeByOrderId, setCompletionNoticeByOrderId] = useState({});

  useEffect(() => {
    const load = async () => {
      if (!currentUser) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const data = await getSellerMarketplaceOrders(currentUser.uid);
        setOrders(data);
      } catch (error) {
        console.error('Failed to load business marketplace orders', error);
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

  const isSeller = userRole === 'localBusiness' || userRole === 'business';

  const handleCompleteOrder = async (order) => {
    if (!currentUser?.uid || completingOrderId) return;

    const confirm = await Swal.fire({
      icon: 'question',
      title: 'לסמן הזמנה כהושלמה?',
      text: 'הלקוח יקבל אימייל שההזמנה מוכנה. לאחר מכן תוכלו לשלוח הודעת וואטסאפ.',
      showCancelButton: true,
      confirmButtonText: 'כן, הושלמה',
      cancelButtonText: 'ביטול',
    });

    if (!confirm.isConfirmed) return;

    setCompletingOrderId(order.id);
    try {
      const result = await finishMarketplaceOrderForSeller({
        order,
        businessId: currentUser.uid,
      });

      setOrders((prev) =>
        prev.map((item) =>
          item.id === order.id
            ? { ...item, ...result.order, fulfillmentStatus: 'completed' }
            : item
        )
      );

      setCompletionNoticeByOrderId((prev) => ({
        ...prev,
        [order.id]: {
          whatsappUrl: result.whatsappUrl,
          emailSent: Boolean(result.emailResult?.sent),
          emailAttempted: Boolean(result.emailResult?.attempted),
        },
      }));

      await Swal.fire({
        icon: 'success',
        title: 'ההזמנה הושלמה',
        html: result.emailResult?.sent
          ? 'נשלח אימייל ללקוח.<br/>לחצו על שליחת וואטסאפ להודעה אישית.'
          : 'ההזמנה עודכנה. שלחו וואטסאפ ללקוח מהכפתור למטה.',
        timer: 3500,
        showConfirmButton: true,
        confirmButtonText: 'הבנתי',
      });
    } catch (error) {
      console.error('Failed to complete marketplace order', error);
      Swal.fire({
        icon: 'error',
        title: 'לא ניתן להשלים',
        text: error?.message || 'נסו שוב או בדקו הרשאות Firestore לעדכון הזמנות.',
      });
    } finally {
      setCompletingOrderId(null);
    }
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

  if (!isSeller) {
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
                כל ההזמנות שהתקבלו מהלקוחות דרך שוק הבסטות והעגלה.
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
                onComplete={handleCompleteOrder}
                completing={completingOrderId === order.id}
                completionNotice={completionNoticeByOrderId[order.id]}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MarketplaceBusinessOrders;
