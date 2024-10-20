import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/authContext';
import { collection, query, where, getDocs, doc, deleteDoc } from 'firebase/firestore';
import { db, storage } from '../../firebase/firebase';
import { ref, deleteObject } from 'firebase/storage';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import './BusinessProducts.css';

// Import Slider and CSS
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";


const BusinessProducts = () => {
  const { currentUser } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProducts, setSelectedProducts] = useState([]); // Track selected products
  const navigate = useNavigate();

  useEffect(() => {
    const fetchProducts = async () => {
      if (!currentUser) return;
      try {
        const q = query(
          collection(db, 'Products'),
          where('Owner_Email', '==', currentUser.email)
        );
        const querySnapshot = await getDocs(q);
        const fetchedProducts = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setProducts(fetchedProducts);
      } catch (error) {
        console.error('Error fetching products:', error);
      }
      setLoading(false);
    };

    fetchProducts();
  }, [currentUser]);

  const handleAddProduct = () => {
    navigate('/add-product');
  };

  const handleEditProduct = (productId) => {
    navigate(`/edit-product/${productId}`);
  };

  const handleToggleProduct = (productId) => {
    // Toggle the selection of a product
    if (selectedProducts.includes(productId)) {
      setSelectedProducts(selectedProducts.filter(id => id !== productId));
    } else {
      setSelectedProducts([...selectedProducts, productId]);
    }
  };

    // Slider settings
    const sliderSettings = {
      dots: true,
      infinite: true,
      speed: 500,
      slidesToShow: 1,
      slidesToScroll: 1,
      arrows: true,
      rtl: true,
    };

  const handleCreateOrder = () => {
    if (selectedProducts.length === 0) {
      Swal.fire({
        icon: 'error',
        title: 'שגיאה',
        text: 'אנא בחרו לפחות מוצר אחד לפני יצירת הזמנה.',
      });
      return;
    }
    navigate(`/create-order-for-business`, { state: { selectedProducts } });
  };

  const handleDeleteProduct = async (productId, productImages) => {
    Swal.fire({
      title: 'האם אתה בטוח?',
      text: "לא תוכל לשחזר את המוצר הזה לאחר מחיקתו!",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'מחק',
      cancelButtonText: 'ביטול',
      reverseButtons: true,
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          // Delete images from Firebase Storage
          const imageDeletePromises = productImages.map(async (imageUrl) => {
            const imageRef = ref(storage, imageUrl);
            await deleteObject(imageRef);
          });

          // Wait for all image deletions to complete
          await Promise.all(imageDeletePromises);

          // Delete the product from Firestore
          await deleteDoc(doc(db, 'Products', productId));

          // Remove the product from the local state
          setProducts(products.filter((product) => product.id !== productId));

          Swal.fire({
            icon: 'success',
            title: 'המוצר נמחק בהצלחה',
            showConfirmButton: false,
            timer: 1500,
          });
        } catch (error) {
          console.error('Error deleting product:', error);
          Swal.fire({
            icon: 'error',
            title: 'שגיאה',
            text: 'אירעה שגיאה בעת מחיקת המוצר. נסה שוב מאוחר יותר.',
          });
        }
      }
    });
  };

  if (loading) {
    return <div>טוען...</div>;
  }

  return (
    <div className="my-products-container">
      <h1 className="my-products-header">המוצרים שלי</h1>
      <button className="add-product-button" onClick={handleAddProduct}>
        הוסף מוצר 
      </button>
      <div className="products-list">
        {products.length === 0 ? (
          <div className="empty-state">
            <img
              src="/assets/empty-products.png"
              alt="No products"
              className="empty-state-image"
            />
            <h2>עדיין אין לך מוצרים</h2>
            <p>התחל על ידי הוספת מוצר חדש לחנות שלך.</p>
            <button className="primary-button" onClick={handleAddProduct}>
              הוסף מוצר חדש
            </button>
          </div>        
        ) : (
          products.map((product) => (
            <div key={product.id} className="product-item">
              <input
                className="checkout-button"
                type="checkbox"
                checked={selectedProducts.includes(product.id)}
                onChange={() => handleToggleProduct(product.id)}
              />
              <button className="edit-product-button" onClick={() => handleEditProduct(product.id)}>
                ערוך
              </button>
              <button className="delete-product-button" onClick={() => handleDeleteProduct(product.id, product.images)}>
                מחק
              </button>
              <h3>{product.name}</h3>
              <p>מחיר: ₪{product.price}</p>
              <p>תיאור: {product.description}</p>
              {product.options && product.options.length > 0 && (
                <p>אופציות: {product.options.join(', ')}</p>
              )}
              {product.images && product.images.length > 0 && (
                  <div className="product-images">
                    <Slider {...sliderSettings} className="product-images-slider">
                      {product.images.map((image, index) => (
                        <img
                          key={index}
                          src={image}
                          alt={`תמונה ${index + 1} של ${product.name}`}
                          className="product-image"
                        />
                      ))}
                    </Slider>
                  </div>
              )}
            </div>
          ))
        )}
      </div>
        <button 
         className="floating-action-button"
         disabled={selectedProducts.length === 0}
         onClick={handleCreateOrder}>
          צור הזמנה
        </button>
    
    </div>
  );
};

export default BusinessProducts;
