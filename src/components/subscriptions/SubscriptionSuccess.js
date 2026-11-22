import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/authContext';
import LoadingSpinner from '../LoadingSpinner';
import SecureCardProgress from './SecureCardProgress';
import { useSubscriber } from '../../contexts/SubscriberContext';
import {
  confirmBasketSubscriptionCard,
  describeSubscriptionError,
} from '../../services/basketSubscriptionService';
import { parseDateSafe } from '../../utils/deliveryScheduleUtils';

// The card is saved by Grow's server update, which usually arrives before the
// customer is back. If it is late, the server asks Grow directly a minute
// after the first check, so keep checking a little past that.
const MAX_ATTEMPTS = 27;
const RETRY_DELAY_MS = 3000;

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const SubscriptionSuccess = () => {
  const location = useLocation();
  const { currentUser, loading: authLoading } = useAuth();
  const subscriptionId = useMemo(
    () => new URLSearchParams(location.search).get('subscriptionId') || '',
    [location.search]
  );
  const [state, setState] = useState({ phase: 'checking', result: null, error: '' });
  const navigate = useNavigate();
  const subscriber = useSubscriber();
  const subscriberActive = Boolean(subscriber?.active);

  // Once the card is saved and subscriber mode is on, the store becomes the
  // upcoming delivery: go there right away.
  useEffect(() => {
    if (state.phase === 'done' && subscriberActive) {
      navigate('/', { replace: true, state: { subscriptionActivated: true } });
    }
  }, [navigate, state.phase, subscriberActive]);

  useEffect(() => {
    if (authLoading || !currentUser || !subscriptionId) return undefined;
    let active = true;
    (async () => {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        try {
          const result = await confirmBasketSubscriptionCard(subscriptionId);
          if (!active) return;
          if (result?.card?.status === 'saved') {
            setState({ phase: 'done', result, error: '' });
            return;
          }
        } catch (error) {
          if (!active) return;
          if (error?.response?.status === 404) {
            setState({ phase: 'error', result: null, error: describeSubscriptionError(error) });
            return;
          }
        }
        await wait(RETRY_DELAY_MS);
      }
      if (active) setState({ phase: 'pending', result: null, error: '' });
    })();
    return () => {
      active = false;
    };
  }, [authLoading, currentUser, subscriptionId]);

  if (authLoading) return <div className="py-12"><LoadingSpinner /></div>;

  if (!currentUser || !subscriptionId) {
    return (
      <div className="max-w-xl mx-auto p-6 text-center" dir="rtl">
        <p className="mb-3">כדי לראות את המנוי צריך להתחבר.</p>
        <Link to="/login" className="text-emerald-700 underline">התחברות</Link>
      </div>
    );
  }

  const nextDate = parseDateSafe(state.result?.nextDeliveryDate);

  if (state.phase === 'checking') {
    return <div className="px-4 py-8"><SecureCardProgress step="confirming" variant="inline" /></div>;
  }

  return (
    <div className="max-w-xl mx-auto p-6 text-center" dir="rtl">
      {state.phase === 'done' && (
        <>
          <h1 className="text-2xl font-black text-emerald-800 mb-2">נרשמתם למנוי</h1>
          <p className="text-gray-700 mb-1">
            הכרטיס נשמר{state.result.card?.last4 ? ` (מסתיים ב-${state.result.card.last4})` : ''}. לא בוצע חיוב.
          </p>
          {nextDate && (
            <p className="text-gray-700 mb-4">
              המשלוח הבא: {nextDate.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric' })}.
              כמה ימים לפני נשלח לכם את הסל לעריכה.
            </p>
          )}
          <Link to="/my-subscriptions" className="inline-block px-5 py-2.5 rounded-lg bg-emerald-600 text-white font-bold">
            לניהול המנוי
          </Link>
        </>
      )}
      {state.phase === 'pending' && (
        <>
          <h1 className="text-xl font-bold mb-2">עדיין מחכים לאישור מחברת הסליקה</h1>
          <p className="text-gray-700 mb-4">זה יכול לקחת כמה דקות. המנוי יופעל אוטומטית ברגע שהכרטיס יאושר.</p>
          <Link to="/my-subscriptions" className="text-emerald-700 underline">לעמוד המנויים</Link>
        </>
      )}
      {state.phase === 'error' && (
        <>
          <h1 className="text-xl font-bold mb-2 text-red-700">לא הצלחנו לאשר את המנוי</h1>
          <p className="text-gray-700 mb-4">{state.error}</p>
          <Link to="/my-subscriptions" className="text-emerald-700 underline">לעמוד המנויים</Link>
        </>
      )}
    </div>
  );
};

export default SubscriptionSuccess;
