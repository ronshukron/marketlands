import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import LoadingSpinner from '../LoadingSpinner';
import { pickupSpots } from '../../data/pickupSpots';

// Analytics Components
import RevenueChart from './analytics/RevenueChart';
import CommunityGrowthChart from './analytics/CommunityGrowthChart';
import AbandonedCartsCard from './analytics/AbandonedCartsCard';
import RefundsCard from './analytics/RefundsCard';
import CustomerJourney from './analytics/CustomerJourney';
import TopBusinesses from './analytics/TopBusinesses';
import TopProducts from './analytics/TopProducts';
import PriceElasticity from './analytics/PriceElasticity';

const AnalyticsDashboard = () => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [refunds, setRefunds] = useState([]);
  
  // Admin Authorization
  const ADMIN_UIDS = ['rfHOLhNoJOW8ByNypCtm3hlSNKs2'];

  useEffect(() => {
    if (currentUser && ADMIN_UIDS.includes(currentUser.uid)) {
      fetchAllData();
    }
  }, [currentUser]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      // 1. Fetch all customer orders
      const ordersRef = collection(db, 'customerOrders');
      const q = query(ordersRef, orderBy('createdAt', 'desc')); 
      const snap = await getDocs(q);
      
      const fetchedOrders = snap.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
          grandTotal: Number(data.grandTotal || 0)
        };
      });

      setOrders(fetchedOrders);

      // 2. Fetch refunds
      const refundsRef = collection(db, 'refunds');
      const refundSnap = await getDocs(refundsRef);
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
    <div className="min-h-screen bg-gray-50 p-4 md:p-8" dir="rtl">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">ניתוח נתונים וסטטיסטיקות</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* 1. Revenue & Orders */}
            <div className="h-full">
                <RevenueChart orders={orders} communities={pickupSpots} />
            </div>

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
      </div>
    </div>
  );
};

export default AnalyticsDashboard;