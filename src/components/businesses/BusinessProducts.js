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
    return <div dir="rtl" className="text-center text-xl p-4">טוען...</div>;
  }

  return (
    <div dir="rtl" className="max-w-6xl mx-auto px-4 py-4">
      <div className="text-center mb-4">
        <h1 className="text-xl font-bold mb-3">המוצרים שלי</h1>
        <button
          onClick={handleAddProduct}
          className="w-40 bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors text-sm"
        >
          + הוסף מוצר
        </button>
      </div>

      {products.length === 0 ? (
        <div className="text-center py-8 px-4 bg-gray-50 rounded-lg shadow">
          <img
            src="/assets/empty-products.png"
            alt="No products"
            className="mx-auto w-32 h-32 object-contain mb-3"
          />
          <h2 className="text-lg font-semibold mb-2">עדיין אין לך מוצרים</h2>
          <p className="text-sm text-gray-600 mb-3">התחל על ידי הוספת מוצר חדש לחנות שלך.</p>
          <button
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-1.5 rounded-lg font-medium transition-colors text-sm"
            onClick={handleAddProduct}
          >
            הוסף מוצר חדש
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {products.map((product) => (
              <div
                key={product.id}
                className={`bg-white rounded-lg shadow-sm overflow-hidden border transition-all
                  ${selectedProducts.includes(product.id) ? 'border-blue-500' : 'border-gray-200'}`}
              >
                {/* Smaller Image Section */}
                <div className="relative h-32">
                  {product.images && product.images.length > 0 ? (
                    <Slider {...sliderSettings} className="h-full">
                      {product.images.map((image, index) => (
                        <div key={index} className="h-32">
                          <img
                            src={image}
                            alt={`תמונה ${index + 1} של ${product.name}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ))}
                    </Slider>
                  ) : (
                    <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                      <span className="text-gray-400 text-sm">אין תמונה</span>
                    </div>
                  )}
                </div>

                {/* Product Info - More Compact */}
                <div className="p-3">
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="text-base font-semibold">{product.name}</h3>
                    <span className="text-base font-bold text-green-600">₪{product.price}</span>
                  </div>
                  
                  <p className="text-xs text-gray-600 mb-1 line-clamp-2">{product.description}</p>
                  
                  {product.options && product.options.length > 0 && (
                    <p className="text-xs text-gray-600 mb-2 line-clamp-1">
                      <span className="font-medium">אופציות:</span> {product.options.join(', ')}
                    </p>
                  )}

                  {/* Actions - More Compact */}
                  <div className="mt-2 flex flex-col gap-2">
                    <button
                      onClick={() => handleToggleProduct(product.id)}
                      className={`w-full py-1.5 px-3 rounded transition-colors text-xs font-medium
                        ${selectedProducts.includes(product.id)
                          ? 'bg-blue-500 text-white hover:bg-blue-600'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                      {selectedProducts.includes(product.id) ? '✓ נבחר להזמנה' : 'בחר להזמנה'}
                    </button>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEditProduct(product.id)}
                        className="flex-1 px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
                      >
                        ערוך
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(product.id, product.images)}
                        className="flex-1 px-3 py-1 text-xs bg-red-50 hover:bg-red-100 text-red-700 rounded transition-colors"
                      >
                        מחק
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Floating Create Order Button - Smaller */}
          {selectedProducts.length > 0 && (
            <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-10">
              <button
                onClick={handleCreateOrder}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg font-medium transition-colors flex items-center gap-2 text-sm"
              >
                <span>צור הזמנה</span>
                <span className="bg-blue-400 px-2 py-0.5 rounded-full text-xs">
                  {selectedProducts.length}
                </span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default BusinessProducts;
