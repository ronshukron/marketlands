import React from 'react';
import { Navigate } from 'react-router-dom';
import { useSubscriber } from '../../contexts/SubscriberContext';
import LoadingSpinner from '../LoadingSpinner';

// Regular checkout pages are not for customers in subscriber mode: their cart
// is the upcoming subscription delivery. A direct visit goes back to the store
// with that cart open. The Firestore rules refuse the order as well.
const RegularCheckoutGuard = ({ children }) => {
  const subscriber = useSubscriber();
  if (subscriber?.loading) return <div className="py-12"><LoadingSpinner /></div>;
  if (subscriber?.active) return <Navigate to="/" replace state={{ openSubscriptionCart: true }} />;
  return children;
};

export default RegularCheckoutGuard;
