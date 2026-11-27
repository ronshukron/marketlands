import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/authContext';
import LoadingSpinner from '../LoadingSpinner';
import FunnelReport from './FunnelReport';
import { listAllSubscriptions } from '../../services/basketSubscriptionService';
import { isAdminAccount } from '../../utils/accountRoles';

// /admin/funnels: the "משפכים" report on its own page (also on
// /admin/subscriptions behind a link). Admin dashboard tile: "משפכים".

const FunnelReportPage = () => {
  const { currentUser, userRole, loading: authLoading } = useAuth();
  const isAdmin = isAdminAccount(currentUser, userRole);
  const [subscriptions, setSubscriptions] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading || !isAdmin) return undefined;
    let active = true;
    listAllSubscriptions()
      .then((list) => { if (active) setSubscriptions(list); })
      .catch((err) => {
        console.error('Failed to load subscriptions for the funnel report:', err);
        if (!active) return;
        setError('טעינת הסלים השבועיים נכשלה. מספרי ההרשמה, ההשהיה והביטול לא יוצגו.');
        setSubscriptions([]);
      });
    return () => { active = false; };
  }, [authLoading, isAdmin]);

  if (authLoading) return <div className="py-12"><LoadingSpinner /></div>;
  if (!isAdmin) return <div className="p-6 text-center text-red-700" dir="rtl">אין הרשאה לדף הזה</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-3 p-4 sm:p-6" dir="rtl">
      <Link to="/admin" className="text-sm text-blue-700 hover:underline">חזרה ללוח הניהול</Link>
      {error && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}
      {subscriptions === null ? (
        <div className="py-12"><LoadingSpinner /></div>
      ) : (
        <FunnelReport subscriptions={subscriptions} />
      )}
    </div>
  );
};

export default FunnelReportPage;
