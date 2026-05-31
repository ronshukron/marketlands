import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { useAuth } from '../../../contexts/authContext';
import { createMarketplaceProduct } from '../../../services/marketplaceProductService';
import MarketplaceProductForm from './MarketplaceProductForm';
import '../marketplace.css';

const MarketplaceAddProduct = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (productData) => {
    if (!currentUser) return;

    setLoading(true);
    try {
      await createMarketplaceProduct({
        businessId: currentUser.uid,
        ownerEmail: currentUser.email,
        productData,
      });

      await Swal.fire({
        icon: 'success',
        title: 'המוצר נוסף',
        text: 'המוצר נשלח לאישור מנהל לפני שיופיע בקידום שבועי.',
      });
      navigate('/marketplace/products');
    } catch (error) {
      console.error('Create marketplace product failed', error);
      Swal.fire({ icon: 'error', title: 'שגיאה', text: 'לא ניתן לשמור את המוצר.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mp-page py-8" dir="rtl">
      <div className="mp-main mp-stack">
        <div className="mp-panel">
          <Link to="/marketplace/products" className="mp-link text-sm">
            ← חזרה למוצרים
          </Link>
          <h1 className="mp-hero-title mt-2" style={{ fontSize: '1.5rem' }}>
            מוצר חדש לשוק הבסטות
          </h1>
        </div>
        <div className="mp-panel">
          <MarketplaceProductForm
            currentUser={currentUser}
            onSubmit={handleSubmit}
            submitLabel="הוספת מוצר"
            loading={loading}
          />
        </div>
      </div>
    </div>
  );
};

export default MarketplaceAddProduct;
