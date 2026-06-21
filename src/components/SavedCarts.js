import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { useAuth } from '../contexts/authContext';
import { useCart } from '../contexts/CartContext';
import LoadingSpinner from './LoadingSpinner';
import {
  listSavedCarts,
  deleteSavedCart,
  loadSavedCartSnapshot,
} from '../services/savedCartService';

const formatSavedCartDate = (timestamp) => {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const sanitizeCartSnapshot = (savedCart) => {
  const cartItems = (savedCart.cartItems || []).filter(
    (item) => item && item.id && item.orderId && item.quantity > 0
  );
  const skipped = (savedCart.cartItems || []).length - cartItems.length;
  return {
    cartItems,
    orderInfoMap: savedCart.orderInfoMap || {},
    skipped,
  };
};

const SavedCarts = () => {
  const { currentUser, userLoggedIn } = useAuth();
  const { cartItems, replaceCart, mergeCart } = useCart();
  const navigate = useNavigate();
  const [savedCarts, setSavedCarts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionId, setActionId] = useState(null);

  const fetchCarts = useCallback(async () => {
    if (!currentUser?.uid) {
      setError('אנא התחבר כדי לראות סלים שמורים.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const carts = await listSavedCarts(currentUser.uid);
      setSavedCarts(carts);
    } catch (err) {
      console.error('Error loading saved carts:', err);
      setError('לא ניתן לטעון סלים שמורים. נסו שוב מאוחר יותר.');
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!userLoggedIn) {
      setLoading(false);
      return;
    }
    fetchCarts();
  }, [userLoggedIn, fetchCarts]);

  const applySavedCart = async (savedCart) => {
    const snapshot = sanitizeCartSnapshot(savedCart);
    if (snapshot.cartItems.length === 0) {
      Swal.fire('סל ריק', 'אין פריטים תקינים בסל השמור.', 'warning');
      return;
    }

    const apply = (mode) => {
      if (mode === 'merge') {
        mergeCart(snapshot);
      } else {
        replaceCart(snapshot);
      }

      const skippedNote = snapshot.skipped > 0
        ? ` (${snapshot.skipped} פריטים לא תקינים דולגו)`
        : '';

      Swal.fire({
        title: 'הסל נטען',
        text: `הסל "${savedCart.name}" הוחל בהצלחה${skippedNote}`,
        icon: 'success',
        timer: 2000,
        showConfirmButton: false,
      });
      navigate('/');
    };

    if (cartItems.length === 0) {
      apply('replace');
      return;
    }

    const result = await Swal.fire({
      title: 'יש פריטים בסל הנוכחי',
      text: 'איך להחיל את הסל השמור?',
      icon: 'question',
      showCancelButton: true,
      showDenyButton: true,
      confirmButtonText: 'החלף את הסל',
      denyButtonText: 'מזג עם הסל הקיים',
      cancelButtonText: 'ביטול',
    });

    if (result.isConfirmed) {
      apply('replace');
    } else if (result.isDenied) {
      apply('merge');
    }
  };

  const handleUseCart = async (cartId) => {
    if (!currentUser?.uid) return;
    setActionId(cartId);
    try {
      const savedCart = await loadSavedCartSnapshot(currentUser.uid, cartId);
      if (!savedCart) {
        Swal.fire('שגיאה', 'הסל לא נמצא.', 'error');
        return;
      }
      await applySavedCart(savedCart);
    } catch (err) {
      console.error('Error loading saved cart:', err);
      Swal.fire('שגיאה', 'לא ניתן לטעון את הסל. נסו שוב.', 'error');
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async (cartId, cartName) => {
    if (!currentUser?.uid) return;

    const result = await Swal.fire({
      title: 'מחיקת סל',
      text: `למחוק את "${cartName}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'מחק',
      cancelButtonText: 'ביטול',
      confirmButtonColor: '#dc2626',
    });

    if (!result.isConfirmed) return;

    setActionId(cartId);
    try {
      await deleteSavedCart(currentUser.uid, cartId);
      setSavedCarts((prev) => prev.filter((cart) => cart.id !== cartId));
      Swal.fire({
        title: 'נמחק',
        text: 'הסל נמחק בהצלחה',
        icon: 'success',
        timer: 1500,
        showConfirmButton: false,
      });
    } catch (err) {
      console.error('Error deleting saved cart:', err);
      Swal.fire('שגיאה', 'לא ניתן למחוק את הסל.', 'error');
    } finally {
      setActionId(null);
    }
  };

  if (!userLoggedIn) {
    return (
      <div className="container mx-auto px-4 py-12 text-center" dir="rtl">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">סלים שמורים</h1>
        <p className="text-gray-600 mb-6">יש להתחבר כדי לשמור ולטעון סלים.</p>
        <Link to="/login" className="text-blue-600 hover:underline">התחברות</Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[40vh]" dir="rtl">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl" dir="rtl">
      <h1 className="text-3xl font-bold text-gray-800 mb-2 text-center">סלים שמורים</h1>
      <p className="text-sm text-gray-500 text-center mb-8">
        עד 10 סלים שמורים. טעינת סל תעביר אותך לחנות.
      </p>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-center">
          {error}
        </div>
      )}

      {savedCarts.length === 0 && !error ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-gray-600 mb-4">אין עדיין סלים שמורים.</p>
          <Link to="/" className="text-blue-600 hover:underline">חזרה לחנות</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {savedCarts.map((cart) => {
            const isBusy = actionId === cart.id;
            return (
              <div
                key={cart.id}
                className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold text-gray-900 truncate">{cart.name}</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {formatSavedCartDate(cart.updatedAt || cart.createdAt)}
                  </p>
                  <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-600">
                    <span>{cart.itemCount || 0} פריטים</span>
                    <span>₪{Number(cart.estimatedTotal || 0).toFixed(2)}</span>
                    {cart.pickupSpot && <span>איסוף: {cart.pickupSpot}</span>}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleUseCart(cart.id)}
                    disabled={isBusy}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 rounded-lg transition-colors"
                  >
                    {isBusy ? 'טוען...' : 'השתמש בסל'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(cart.id, cart.name)}
                    disabled={isBusy}
                    className="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50 rounded-lg transition-colors"
                  >
                    מחק
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SavedCarts;
