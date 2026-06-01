import { useState } from 'react';
import Swal from 'sweetalert2';
import {
  markMarketplaceOrderPaid,
  unmarkMarketplaceOrderHandoff,
  unmarkMarketplaceOrderPaid,
  unmarkMarketplaceOrderReady,
} from '../services/marketplaceService';
import {
  markOrderReadyForSeller,
  finishMarketplaceOrderForSeller,
} from '../services/marketplaceOrderCompletion';

/**
 * Shared seller order status actions for marketplace order lists.
 */
export const useMarketplaceSellerOrderActions = ({
  businessId,
  setOrders,
}) => {
  const [statusUpdatingOrderId, setStatusUpdatingOrderId] = useState(null);
  const [readyNoticeByOrderId, setReadyNoticeByOrderId] = useState({});
  const [handoffNoticeByOrderId, setHandoffNoticeByOrderId] = useState({});

  const patchOrder = (orderId, patch) => {
    setOrders((prev) =>
      prev.map((item) => (item.id === orderId ? { ...item, ...patch } : item))
    );
  };

  const runOrderStatusUpdate = async (orderId, updateFn) => {
    if (!businessId || statusUpdatingOrderId) return null;

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
    if (!businessId || statusUpdatingOrderId) return;

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
      const result = await markOrderReadyForSeller({ order, businessId });
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
      unmarkMarketplaceOrderReady({ orderId: order.id, businessId })
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
      markMarketplaceOrderPaid({ orderId: order.id, businessId })
    );
    if (updated) patchOrder(order.id, updated);
  };

  const handleUnmarkPaid = async (order) => {
    const updated = await runOrderStatusUpdate(order.id, () =>
      unmarkMarketplaceOrderPaid({ orderId: order.id, businessId })
    );
    if (updated) patchOrder(order.id, updated);
  };

  const handleMarkHandoff = async (order) => {
    if (!businessId || statusUpdatingOrderId) return;

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
      const result = await finishMarketplaceOrderForSeller({ order, businessId });
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
      unmarkMarketplaceOrderHandoff({ orderId: order.id, businessId })
    );
    if (!updated) return;

    patchOrder(order.id, updated);
    setHandoffNoticeByOrderId((prev) => {
      const next = { ...prev };
      delete next[order.id];
      return next;
    });
  };

  return {
    statusUpdatingOrderId,
    readyNoticeByOrderId,
    handoffNoticeByOrderId,
    handleMarkReady,
    handleUnmarkReady,
    handleMarkPaid,
    handleUnmarkPaid,
    handleMarkHandoff,
    handleUnmarkHandoff,
  };
};
