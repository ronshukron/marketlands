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

      {/* Integrated guidance section - always visible */}
      <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6 rounded-lg shadow-sm">
        <div className="flex">
          <div className="flex-shrink-0 mr-3">
            <svg className="h-6 w-6 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-medium text-blue-800 mb-1">כיצד ליצור מודעת מכירה</h3>
            <div className="space-y-2">
              <div className="flex items-start">
                <div className="bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 mr-2 text-xs">1</div>
                <p className="text-sm text-blue-700"><strong> בחרו מספר מוצרים </strong> -  סמנו את כל המוצרים שתרצו לכלול במודעת מכירה ולחצו על צור מודעה</p>
              </div>
              <div className="flex items-start">
                <div className="bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 mr-2 text-xs">2</div>
                <p className="text-sm text-blue-700"><strong>הגדירו את פרטי ההזמנה</strong> -  בדף הבא תנו שם למודעת מכירה והגדירו את הפרטים הנדרשים</p>
              </div>
              {/* <div className="flex items-start">
                <div className="bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 mr-2 text-xs">3</div>
                <p className="text-sm text-blue-700"><strong>שתפו את הטופס</strong> - שתפו את הקישור לטופס ההזמנה עם הלקוחות שלכם</p>
              </div> */}
              <div className="mt-2 pt-2 border-t border-blue-200">
                <p className="text-sm text-blue-800 font-semibold flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  חשוב: צרו מודעת מכירה אחת עם כל המוצרים שלכם במקום ליצור מודעה בנפרד לכל מוצר
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Status section - shows depending on selection state */}
      {selectedProducts.length > 0 && (
        <div className="bg-green-50 border-l-4 border-green-400 p-4 mb-6 rounded-lg">
          <div className="flex">
            <div className="flex-shrink-0 mr-3">
              <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-medium text-green-800">נבחרו {selectedProducts.length} מוצרים</h3>
              <div className="mt-1 text-sm text-green-700">
                <p>בחרתם {selectedProducts.length} מוצרים למודעת מכירה. לחצו על כפתור "צור מודעת מכירה" למטה כדי להמשיך.</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {products
                    .filter(product => selectedProducts.includes(product.id))
                    .map(product => (
                      <span key={product.id} className="bg-green-100 text-green-800 text-xs font-medium px-2 py-0.5 rounded">
                        {product.name}
                      </span>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
                    product.images.length > 1 ? (
                      <div className="product-carousel h-32">
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
                      </div>
                    ) : (
                      <div className="single-image-container h-32">
                        <img 
                          src={product.images[0]} 
                          alt={product.name}
                          className="w-full h-full object-cover object-center" 
                        />
                      </div>
                    )
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
          <div className="fixed bottom-4 left-0 right-0 flex justify-center z-20">
            <button
              onClick={handleCreateOrder}
              disabled={selectedProducts.length === 0}
              className={`
                py-3 px-6 rounded-full shadow-lg flex items-center gap-2 font-medium
                transition-all duration-300 transform
                ${selectedProducts.length === 0 
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-70'
                  : 'bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:shadow-xl hover:scale-105'
                }
              `}
            >
              {selectedProducts.length > 0 ? (
                <>
                  <span className="bg-white text-blue-600 rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">
                    {selectedProducts.length}
                  </span>
                  <span>צור מודעת מכירה</span>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </>
              ) : (
                <span>בחרו מוצרים למודעה</span>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default BusinessProducts;
