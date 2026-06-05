import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import { useAuth } from '../../../contexts/authContext';
import {
  getMarketplaceProduct,
  updateMarketplaceProduct,
} from '../../../services/marketplaceProductService';
import LoadingSpinner from '../../LoadingSpinner';
import MarketplaceProductForm from './MarketplaceProductForm';
import '../marketplace.css';

const MarketplaceEditProduct = () => {
  const { productId } = useParams();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!productId || !currentUser) {
        setLoading(false);
        return;
      }

      try {
        const item = await getMarketplaceProduct(productId);
        if (!item || item.businessId !== currentUser.uid) {
          Swal.fire({ icon: 'error', title: 'מוצר לא נמצא' });
          navigate('/marketplace/products');
          return;
        }
        setProduct(item);
      } catch (error) {
        console.error('Load product failed', error);
        Swal.fire({ icon: 'error', title: 'שגיאה בטעינת מוצר' });
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [productId, currentUser, navigate]);

  const handleSubmit = async (productData) => {
    setSaving(true);
    try {
      await updateMarketplaceProduct(productId, productData);
      await Swal.fire({
        icon: 'success',
        title: 'המוצר עודכן',
        text: 'שינויים במוצר שאושר בעבר עשויים לדרוש אישור מחדש — פנה למנהל במידת הצורך.',
        timer: 2500,
        showConfirmButton: false,
      });
      navigate('/marketplace/products');
    } catch (error) {
      console.error('Update failed', error);
      Swal.fire({ icon: 'error', title: 'שגיאה בעדכון' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (!product) return null;

  return (
    <div className="mp-page mp-bench-page" dir="rtl">
      <div className="mp-main mp-bench mp-stack">
        <header className="mp-bench-panel">
          <Link to="/marketplace/products" className="mp-link">
            ← חזרה למוצרים
          </Link>
          <h1 className="mp-bench-panel-title mp-section-title-chalk mt-2">
            עריכת מוצר: {product.name}
          </h1>
        </header>
        <div className="mp-bench-panel mp-bench-panel--form">
          <MarketplaceProductForm
            key={product.id}
            currentUser={currentUser}
            initialValues={product}
            onSubmit={handleSubmit}
            submitLabel="שמירת שינויים"
            loading={saving}
          />
        </div>
      </div>
    </div>
  );
};

export default MarketplaceEditProduct;
