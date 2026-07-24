import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import LoadingSpinner from '../LoadingSpinner';
import { pickupSpots } from '../../data/pickupSpots';
import { loadLegacyRetentionOrders } from '../../services/productRetentionAnalyticsService';

// Analytics Components
import RevenueChart from './analytics/RevenueChart';
import CommunityGrowthChart from './analytics/CommunityGrowthChart';
import AbandonedCartsCard from './analytics/AbandonedCartsCard';
import RefundsCard from './analytics/RefundsCard';
import CustomerJourney from './analytics/CustomerJourney';
import TopBusinesses from './analytics/TopBusinesses';
import TopProducts from './analytics/TopProducts';
import PriceElasticity from './analytics/PriceElasticity';
import ProductRetentionCard from './analytics/ProductRetentionCard';

const ADMIN_UIDS = ['rfHOLhNoJOW8ByNypCtm3hlSNKs2'];

const AnalyticsDashboard = () => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [refunds, setRefunds] = useState([]);

  useEffect(() => {
    if (currentUser && ADMIN_UIDS.includes(currentUser.uid)) {
      fetchAllData();
    }
  }, [currentUser]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const refundsRef = collection(db, 'refunds');

      const [allOrders, refundSnap] = await Promise.all([
        loadLegacyRetentionOrders(),
        getDocs(refundsRef)
      ]);

      setOrders(allOrders);

      const fetchedRefunds = refundSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRefunds(fetchedRefunds);

    } catch (err) {
      console.error("Error fetching analytics data:", err);
    } finally {
      setLoading(false);
    }
  };

  if (!currentUser || !ADMIN_UIDS.includes(currentUser.uid)) {
    return <div className="p-8 text-center">אין לך הרשאה לצפות בדף זה.</div>;
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6" dir="rtl">
      <div className="w-full">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">ניתוח נתונים וסטטיסטיקות</h1>
        
        {/* Revenue Chart - Full Width */}
        <div className="mb-8">
          <RevenueChart orders={orders} communities={pickupSpots} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* 6. Community Growth */}
            <div className="h-full">
                <CommunityGrowthChart orders={orders} communities={pickupSpots} />
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            {/* 4. Abandoned Carts */}
            <AbandonedCartsCard orders={orders} communities={pickupSpots} />

            {/* 5. Refunds */}
            <RefundsCard refunds={refunds} />

            {/* 7. Customer Journey */}
            <CustomerJourney orders={orders} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
             {/* 2. Top Businesses */}
             <TopBusinesses orders={orders} />

            {/* 3. Top Products */}
            <TopProducts orders={orders} />
        </div>

        <div className="mb-8">
            <PriceElasticity orders={orders} />
        </div>

        <div className="mb-8">
          <ProductRetentionCard orders={orders} communities={pickupSpots} />
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;