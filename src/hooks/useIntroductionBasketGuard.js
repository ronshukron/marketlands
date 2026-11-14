import { useCallback } from 'react';
import Swal from 'sweetalert2';
import { useCart } from '../contexts/CartContext';
import { getIntroductionBasketStates } from '../services/introductionBasketService';
import {
  describeBlockedBasketsHtml,
  findBlockedCartBaskets,
  getCartBasketIds,
} from '../utils/introductionBasketLimit';

/**
 * Returns an async check to run before letting the customer pay.
 * It re-reads every introduction basket in the cart, so a basket that was
 * switched off after it was added, or that passes the per-customer limit,
 * is removed from the cart with an explanation. Resolves true when the cart
 * can be ordered as it is, false when something was removed (the customer
 * then sees the updated cart and total and can continue).
 */
export default function useIntroductionBasketGuard() {
  const { cartItems, removeBasketInstance } = useCart();

  return useCallback(async ({ phone = '', email = '', uid = '', blockOnCheckFailure = true } = {}) => {
    const basketIds = getCartBasketIds(cartItems);
    const hasBasketLines = (cartItems || []).some((item) => item?.basketInstanceId);
    if (!hasBasketLines) return true;

    let states = {};
    try {
      states = await getIntroductionBasketStates({ basketIds, phone, email, uid });
    } catch (error) {
      console.error('Could not verify introduction baskets:', error);
      if (!blockOnCheckFailure) return true;
      await Swal.fire({
        icon: 'error',
        title: 'לא הצלחנו לבדוק את סל ההיכרות',
        text: 'בדקו את החיבור לאינטרנט ונסו שוב.',
        confirmButtonText: 'הבנתי',
      });
      return false;
    }

    const blocked = findBlockedCartBaskets(cartItems, states);
    if (blocked.length === 0) return true;

    blocked.forEach((basket) => removeBasketInstance(basket.basketInstanceId));
    await Swal.fire({
      icon: 'warning',
      title: blocked.length === 1 ? 'סל היכרות הוסר מהעגלה' : 'סלי היכרות הוסרו מהעגלה',
      html: `${describeBlockedBasketsHtml(blocked)}<br><br>שאר הפריטים נשארו בעגלה. בדקו את הסכום המעודכן והמשיכו.`,
      confirmButtonText: 'הבנתי',
    });
    return false;
  }, [cartItems, removeBasketInstance]);
}
