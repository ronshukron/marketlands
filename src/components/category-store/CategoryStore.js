import React, { useState, useEffect, useRef } from 'react';
import { collection, query, getDocs, doc, getDoc, where } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import LoadingSpinner from '../LoadingSpinner';
import ProductGrid from './ProductGrid';
import SearchBar from './SearchBar';
import './CategoryStore.css';
import { useLocation, useNavigate } from 'react-router-dom';
import Slider from 'react-slick';

const CategoryStore = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('הכל');
  const [categoryCounts, setCategoryCounts] = useState({});
  const [searchResults, setSearchResults] = useState([]);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const sliderRef = useRef(null);
  const storeTopRef = useRef(null);
  
  const categories = ['הכל', 'ירקות', 'פירות', 'ירוקים', 'אחר'];

  useEffect(() => {
    fetchCategorizedProducts();
  }, []);

  // Sync selected category with URL query param (?category=)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const cat = params.get('category') || 'הכל';
    setSelectedCategory(cat);
    setIsSearchActive(false); // leave search mode when category changes
    
    // Update slider position when category changes
    const categoryIndex = categories.indexOf(cat);
    if (sliderRef.current && categoryIndex !== -1) {
      // Use setTimeout to ensure slider is fully initialized
      setTimeout(() => {
        if (sliderRef.current) {
          const targetIndex = getAdjustedSlideIndex(categoryIndex);
          sliderRef.current.slickGoTo(targetIndex);
        }
      }, 100);
    }
  }, [location.search]);
  
  // Ensure slider is positioned correctly on mount
  useEffect(() => {
    if (sliderRef.current && selectedCategory) {
      const categoryIndex = categories.indexOf(selectedCategory);
      if (categoryIndex !== -1) {
        setTimeout(() => {
          if (sliderRef.current) {
            const targetIndex = getAdjustedSlideIndex(categoryIndex);
            sliderRef.current.slickGoTo(targetIndex);
          }
        }, 200);
      }
    }
  }, [sliderRef.current]);
  
  const handleCategoryChange = (category) => {
    navigate({ pathname: '/', search: `?category=${encodeURIComponent(category)}` });
  };

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

  // Do not early-return on loading; show search/carousel immediately and spinner below

  const currentCategoryIndex = categories.indexOf(selectedCategory);

  // Adjust the slide index so edges behave nicely with 3 visible slides
  // - Index 0 can be centered when infinite=true
  // - Last index cannot be centered; use second-to-last so the last is visible on the right
  // - Second-to-last can be centered and shows the last on the right
  const getAdjustedSlideIndex = (index) => {
    const maxIndex = categories.length - 1;
    if (index >= maxIndex) return Math.max(maxIndex - 1, 0);
    return index;
  };
  
  const sliderSettings = {
    dots: false,
    infinite: true,
    speed: 250,
    slidesToShow: 3,
    slidesToScroll: 1,
    centerMode: true,
    centerPadding: '0px',
    rtl: true,
    arrows: false,
    swipeToSlide: false,
    focusOnSelect: false,
    draggable: true,
    initialSlide: currentCategoryIndex !== -1 ? getAdjustedSlideIndex(currentCategoryIndex) : 0,
    responsive: [
      {
        breakpoint: 768,
        settings: {
          slidesToShow: 3,
          centerPadding: '0px',
        }
      },
      {
        breakpoint: 480,
        settings: {
          slidesToShow: 3,
          centerPadding: '0px',
        }
      }
    ]
  };

  return (
    <div className="category-store-container" dir="rtl" id="category-store" ref={storeTopRef}>
      <div className="w-full max-w-full mx-auto">
        {/* Search Bar */}
        <SearchBar 
          products={products}
          onSearchResults={setSearchResults}
          setSearchActive={setIsSearchActive}
        />

        {/* Category Carousel - shown when not searching, only on mobile */}
        {!isSearchActive && (
          <div className="my-6 category-carousel-container md:hidden">
            <Slider ref={sliderRef} {...sliderSettings}>
              {categories.map((category) => {
                const isActive = category === selectedCategory;
                const categoryIcon = {
                  'הכל': '🛒',
                  'ירקות': '🥬',
                  'פירות': '🍎',
                  'ירוקים': '🌿',
                  'אחר': '🏷️'
                };
                
                return (
                  <div key={category}>
                    <div
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const categoryIndex = categories.indexOf(category);
                        if (sliderRef.current && categoryIndex !== -1) {
                          const targetIndex = getAdjustedSlideIndex(categoryIndex);
                          sliderRef.current.slickGoTo(targetIndex);
                          // Update category after slide animation
                          setTimeout(() => {
                            handleCategoryChange(category);
                          }, 300);
                        }
                      }}
                      className={`category-card cursor-pointer ${
                        isActive
                          ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-xl'
                          : 'bg-white text-gray-700 shadow-md hover:shadow-lg'
                      }`}
                    >
                      <div className="category-icon">{categoryIcon[category]}</div>
                      <h3 className={`category-title ${isActive ? 'text-white' : 'text-gray-800'}`}>
                        {category}
                      </h3>
                      {categoryCounts[category] > 0 && (
                        <p className={`category-count ${isActive ? 'text-blue-100' : 'text-gray-500'}`}>
                          {/* {categoryCounts[category]} מוצרים */}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </Slider>
          </div>
        )}

        {/* Loading state below the carousel, above the grid */}
        {loading && (
          <div className="text-center py-6">
            <LoadingSpinner />
            <p className="mt-2 text-gray-600 text-sm">טוען מוצרים...</p>
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
        
        {!loading && (
          <ProductGrid 
            products={displayProducts} 
            calculateTimeRemaining={calculateTimeRemaining}
          />
        )}
      </div>
    </div>
  );
};

export default CategoryStore;

