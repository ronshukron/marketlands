import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/authContext';
import { useSubscriber } from '../../contexts/SubscriberContext';
import LoadingSpinner from '../LoadingSpinner';

// /my-basket: the link in the "basket ready" email (and later the WhatsApp
// reminder). Opens the upcoming delivery in the store's cart drawer; without
// a weekly basket in subscriber mode, the weekly-basket page.
export const MY_BASKET_PATH = '/my-basket';

const MyBasketRedirect = () => {
  const { currentUser, loading: authLoading } = useAuth() || {};
  const subscriber = useSubscriber();

  if (authLoading) return <div className="py-12"><LoadingSpinner /></div>;
  if (!currentUser) return <Navigate to="/login" replace state={{ from: MY_BASKET_PATH }} />;
  if (!subscriber || subscriber.loading) return <div className="py-12"><LoadingSpinner /></div>;
  if (subscriber.active) return <Navigate to="/" replace state={{ openSubscriptionCart: true }} />;
  return <Navigate to="/my-subscriptions" replace />;
};

export default MyBasketRedirect;
