import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, doc, getDoc, where } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import LoadingSpinner from '../LoadingSpinner';
import ProductGrid from './ProductGrid';
import SearchBar from './SearchBar';
import './CategoryStore.css';
import { useLocation } from 'react-router-dom';

const CategoryStore = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('הכל');
  const [categoryCounts, setCategoryCounts] = useState({});
  const [searchResults, setSearchResults] = useState([]);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const location = useLocation();

  useEffect(() => {
    fetchCategorizedProducts();
  }, []);

  // Sync selected category with URL query param (?category=)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const cat = params.get('category') || 'הכל';
    setSelectedCategory(cat);
    setIsSearchActive(false); // leave search mode when category changes
  }, [location.search]);

  const fetchCategorizedProducts = async () => {
    setLoading(true);
    try {
      const currentTime = new Date();
      const adjustedCurrentTime = new Date(currentTime.getTime() + 60 * 60 * 1000); // Add 1 hour

      // Fetch all active orders
      const ordersQuery = query(collection(db, 'Orders'));
      const ordersSnapshot = await getDocs(ordersQuery);

      const allProducts = [];
      
      for (const orderDoc of ordersSnapshot.docs) {
        const orderData = orderDoc.data();
        const endingTime = orderData.Ending_Time || orderData.endingTime;
        
        // Check if order is still active
        let isActive = false;
        let orderType = orderData.orderType;
        
        if (!orderType) {
          if (orderData.schedule) {
            orderType = 'recurring';
          } else if (endingTime) {
            orderType = 'one_time';
          } else {
            orderType = 'unknown';
          }
        }

        if (orderType === 'one_time') {
          if (endingTime && endingTime.toDate() > adjustedCurrentTime) {
            isActive = true;
          }
        } else if (orderType === 'recurring') {
          if (orderData.schedule && isOrderActiveNow(orderData.schedule)) {
            isActive = true;
          }
        }

        // Only process active orders
        if (isActive && orderData.businessId && orderData.selectedProducts) {
          const businessDoc = await getDoc(doc(db, 'businesses', orderData.businessId));
          
          if (businessDoc.exists()) {
            const businessData = businessDoc.data();
            
            // Fetch selected products for this order
            const selectedProductIds = orderData.selectedProducts || [];
            
            if (selectedProductIds.length > 0) {
              const chunkSize = 10;
              for (let i = 0; i < selectedProductIds.length; i += chunkSize) {
                const chunk = selectedProductIds.slice(i, i + chunkSize);
                
                const productsQuery = query(
                  collection(db, 'Products'),
                  where('Owner_ID', '==', orderData.businessId),
                  where('__name__', 'in', chunk)
                );

                const productsSnapshot = await getDocs(productsQuery);
                
                productsSnapshot.docs.forEach(productDoc => {
                  const productData = productDoc.data();
                  
                  // Only include products with stockAmount > 0
                  if (productData.stockAmount > 0) {
                    allProducts.push({
                      // Product fields
                      id: productDoc.id,
                      name: productData.name,
                      price: productData.price,
                      description: productData.description,
                      images: productData.images || [],
                      options: productData.options || [],
                      stockAmount: productData.stockAmount,
                      category: productData.category || 'אחר',
                      catalogNumber: productData.catalogNumber,
                      vatType: productData.vatType ?? 3,
                      
                      // Order-related fields (critical for cart/checkout)
                      orderId: orderDoc.id,
                      businessId: orderData.businessId,
                      businessName: businessData.businessName,
                      businessKind: businessData.businessKind || 'חקלאי',
                      Owner_ID: productData.Owner_ID,
                      
                      // Order timing fields
                      orderType: orderType,
                      endingTime: endingTime,
                      schedule: orderData.schedule,
                      
                      // For cart compatibility
                      selectedOption: productData.options && productData.options.length > 0 ? productData.options[0] : "",
                      quantity: 0,
                      uid: `${productDoc.id}_${Math.random().toString(36).substr(2, 9)}`
                    });
                  }
                });
              }
            }
          }
        }
      }

      setProducts(allProducts);
      
      // Calculate category counts
      const counts = {};
      allProducts.forEach(product => {
        const cat = product.category || 'אחר';
        counts[cat] = (counts[cat] || 0) + 1;
      });
      counts['הכל'] = allProducts.length;
      setCategoryCounts(counts);
      
    } catch (error) {
      console.error('Error fetching categorized products:', error);
    } finally {
      setLoading(false);
    }
  };

  const isOrderActiveNow = (schedule) => {
    const now = new Date();
    const currentDayIndex = now.getDay();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    const dayIndexMap = {
      0: ['Sunday', 'ראשון'],
      1: ['Monday', 'שני'],
      2: ['Tuesday', 'שלישי'],
      3: ['Wednesday', 'רביעי'],
      4: ['Thursday', 'חמישי'],
      5: ['Friday', 'שישי'],
      6: ['Saturday', 'שבת'],
    };

    const dayNames = dayIndexMap[currentDayIndex];
    const daySchedule = schedule.find((day) => dayNames.includes(day.day));

    if (daySchedule && daySchedule.active) {
      const [startHour, startMinute] = daySchedule.startTime.split(':').map(Number);
      const [endHour, endMinute] = daySchedule.endTime.split(':').map(Number);

      let startTimeInMinutes = startHour * 60 + startMinute;
      let endTimeInMinutes = endHour * 60 + endMinute;

      if (endTimeInMinutes <= startTimeInMinutes) {
        endTimeInMinutes += 24 * 60;
      }

      let adjustedCurrentTime = currentTime;
      if (currentTime < startTimeInMinutes) {
        adjustedCurrentTime += 24 * 60;
      }

      return adjustedCurrentTime >= startTimeInMinutes && adjustedCurrentTime <= endTimeInMinutes;
    }
    return false;
  };

  const calculateTimeRemaining = (product) => {
    const orderType = product.orderType;
    const now = new Date();

    if (orderType === 'one_time') {
      const endingTime = product.endingTime;
      if (endingTime) {
        const end = endingTime.toDate();
        const adjustedEndTime = new Date(end.getTime() - 60 * 60 * 1000); // Adjust if needed
        const diff = adjustedEndTime - now;
        if (diff <= 0) {
          return 'ההזמנה הסתיימה';
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const minutes = Math.floor((diff / (1000 * 60)) % 60);

        let timeString = '';
        if (days > 0) timeString += `${days} ימים `;
        if (hours > 0) timeString += `${hours} שעות `;
        if (minutes > 0) timeString += `${minutes} דקות`;

        return timeString || 'פחות מדקה';
      } else {
        return 'תאריך סיום לא זמין';
      }
    } else if (orderType === 'recurring') {
      const schedule = product.schedule;
      if (schedule) {
        const isActive = isOrderActiveNow(schedule);
        return isActive ? 'פעיל כעת' : 'לא פעיל כעת';
      } else {
        return 'לוח זמנים לא זמין';
      }
    } else {
      return 'סוג הזמנה לא ידוע';
    }
  };

  // Determine which products to display
  const displayProducts = isSearchActive 
    ? searchResults 
    : selectedCategory === 'הכל' 
      ? products 
      : products.filter(product => (product.category || 'אחר') === selectedCategory);

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="category-store-container" dir="rtl" id="category-store">
      <div className="w-full max-w-full mx-auto">
        {/* Search Bar */}
        <SearchBar 
          products={products}
          onSearchResults={setSearchResults}
          setSearchActive={setIsSearchActive}
        />

        {/* Category Title - shown when not searching */}
        {!isSearchActive && (
          <div className="my-8 text-center">
            <h2 className="text-4xl font-bold text-gray-900 mb-2">
              {selectedCategory}
            </h2>
            {/* {categoryCounts[selectedCategory] > 0 && (
              <p className="text-lg text-gray-600">
                {categoryCounts[selectedCategory]} מוצרים זמינים
              </p>
            )} */}
          </div>
        )}

        {/* Show search results header when searching */}
        {isSearchActive && (
          <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-blue-900">
                תוצאות חיפוש
              </h3>
              <span className="text-sm text-blue-700">
                {displayProducts.length} מוצרים נמצאו
              </span>
            </div>
          </div>
        )}
        
        <ProductGrid 
          products={displayProducts} 
          calculateTimeRemaining={calculateTimeRemaining}
        />
      </div>
    </div>
  );
};

export default CategoryStore;

