import React, { useState, useEffect, useRef } from 'react';
import { collection, query, getDocs, doc, getDoc, where } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import LoadingSpinner from '../LoadingSpinner';
import ProductGrid from './ProductGrid';
import SearchBar from './SearchBar';
import './CategoryStore.css';
import { useLocation, useNavigate } from 'react-router-dom';
import Slider from 'react-slick';
import { pickupSpots } from '../../data/pickupSpots';
import { getEndingTimeForSpot, isOrderActiveNow } from '../../utils/orderUtils';

const CategoryStore = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('הכל');
  const [categoryCounts, setCategoryCounts] = useState({});
  const [searchResults, setSearchResults] = useState([]);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [selectedCommunity, setSelectedCommunity] = useState('');
  const location = useLocation();
  const navigate = useNavigate();
  const sliderRef = useRef(null);
  const storeTopRef = useRef(null);
  const communityDropdownRef = useRef(null);
  const [isCommunityOpen, setIsCommunityOpen] = useState(false);
  const [communityQuery, setCommunityQuery] = useState('');
  
  const categories = ['הכל', 'ירקות', 'פירות', 'ירוקים ופטריות', 'אחר'];

  useEffect(() => {
    fetchCategorizedProducts();
  }, []);

  // Sync selected category and community with URL query params (?category=, ?community=)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const cat = params.get('category') || 'הכל';
    const comm = params.get('community');
    setSelectedCategory(cat);
    setIsSearchActive(false); // leave search mode when category changes
    if (comm && comm.trim()) {
      setSelectedCommunity(comm);
      try {
        localStorage.setItem('selectedPickupSpot', comm);
      } catch {}
    } else {
      const saved = localStorage.getItem('selectedPickupSpot');
      if (saved && saved !== 'הכל') setSelectedCommunity(saved);
    }
    
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

  // Close community dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (communityDropdownRef.current && !communityDropdownRef.current.contains(e.target)) {
        setIsCommunityOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  
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
    const params = new URLSearchParams(location.search);
    const currentCommunity = params.get('community') || selectedCommunity || '';
    const nextParams = new URLSearchParams();
    nextParams.set('category', category);
    if (currentCommunity && currentCommunity !== 'הכל') nextParams.set('community', currentCommunity);
    navigate({ pathname: '/', search: `?${nextParams.toString()}` });
  };

  const handleCommunityChange = (community) => {
    // Save to localStorage immediately when user selects a community
    if (community && community !== 'הכל') {
      localStorage.setItem('selectedPickupSpot', community);
    } else {
      localStorage.removeItem('selectedPickupSpot');
    }
    
    const params = new URLSearchParams(location.search);
    const currentCategory = params.get('category') || selectedCategory || 'הכל';
    const nextParams = new URLSearchParams();
    if (currentCategory) nextParams.set('category', currentCategory);
    if (community && community !== 'הכל') nextParams.set('community', community);
    navigate({ pathname: '/', search: `?${nextParams.toString()}` });
  };

  // Persist selected community
  useEffect(() => {
    if (selectedCommunity) {
      localStorage.setItem('selectedPickupSpot', selectedCommunity);
    } else {
      localStorage.removeItem('selectedPickupSpot');
    }
  }, [selectedCommunity]);

  const fetchCategorizedProducts = async () => {
    setLoading(true);
    try {
      const currentTime = new Date();
      const adjustedCurrentTime = new Date(currentTime.getTime() + 60 * 60 * 1000); // Add 1 hour

      // Fetch all orders
      const ordersQuery = query(collection(db, 'Orders'));
      const ordersSnapshot = await getDocs(ordersQuery);

      // Filter active orders first
      // For per-pickup-spot ending times, we keep orders that have at least one active pickup spot
      const activeOrders = [];
      ordersSnapshot.docs.forEach(orderDoc => {
        const orderData = orderDoc.data();
        const endingTime = orderData.Ending_Time || orderData.endingTime;
        const endingTimeByPickupSpot = orderData.endingTimeByPickupSpot || {};
        
        let orderType = orderData.orderType;
        if (!orderType) {
          if (orderData.schedule) {
            orderType = 'recurring';
          } else if (endingTime || Object.keys(endingTimeByPickupSpot).length > 0) {
            orderType = 'one_time';
          } else {
            return; // Skip unknown
          }
        }

        let isActive = false;
        if (orderType === 'one_time') {
          // Check if ANY pickup spot is still active (has ending time in the future)
          const orderPickupSpots = Array.isArray(orderData.pickupSpots) ? orderData.pickupSpots : [];
          
          if (Object.keys(endingTimeByPickupSpot).length > 0) {
            // New structure: check each pickup spot's ending time
            for (const spot of orderPickupSpots) {
              const spotEndingTime = getEndingTimeForSpot(orderData, spot);
              if (spotEndingTime && spotEndingTime > adjustedCurrentTime) {
                isActive = true;
                break;
              }
            }
          } else if (endingTime) {
            // Legacy: single ending time
            const legacyEnd = endingTime.toDate ? endingTime.toDate() : new Date(endingTime);
            if (legacyEnd > adjustedCurrentTime) {
              isActive = true;
            }
          }
        } else if (orderType === 'recurring') {
          if (orderData.schedule && isOrderActiveNow(orderData.schedule)) {
            isActive = true;
          }
        }

        if (isActive && orderData.businessId && orderData.selectedProducts) {
          activeOrders.push({
            id: orderDoc.id,
            data: orderData,
            orderType,
            endingTime,
            endingTimeByPickupSpot
          });
        }
      });

      // (UI list uses pickupSpots dataset; no need to collect communities here)

      // Fetch all business docs in parallel
      const businessPromises = activeOrders.map(order => 
        getDoc(doc(db, 'businesses', order.data.businessId))
      );
      const businessDocs = await Promise.all(businessPromises);
      
      // Create business map for quick lookup
      const businessMap = {};
      businessDocs.forEach((businessDoc, index) => {
        if (businessDoc.exists()) {
          businessMap[activeOrders[index].data.businessId] = businessDoc.data();
        }
      });

      // Fetch all products in parallel
      const productPromises = [];
      const productMetadata = []; // Track which order each promise belongs to
      
      activeOrders.forEach(order => {
        if (businessMap[order.data.businessId]) {
          const selectedProductIds = order.data.selectedProducts || [];
          if (selectedProductIds.length > 0) {
            const chunkSize = 10;
            for (let i = 0; i < selectedProductIds.length; i += chunkSize) {
              const chunk = selectedProductIds.slice(i, i + chunkSize);
              
              const productsQuery = query(
                collection(db, 'Products'),
                where('Owner_ID', '==', order.data.businessId),
                where('__name__', 'in', chunk)
              );
              
              productPromises.push(getDocs(productsQuery));
              productMetadata.push({
                orderId: order.id,
                orderData: order.data,
                orderType: order.orderType,
                endingTime: order.endingTime,
                endingTimeByPickupSpot: order.endingTimeByPickupSpot || {},
                businessData: businessMap[order.data.businessId],
                pickupSpots: Array.isArray(order.data.pickupSpots) ? order.data.pickupSpots : []
              });
            }
          }
        }
      });

      // Wait for all product queries to complete
      const productSnapshots = await Promise.all(productPromises);
      
      // Process all products
      const allProducts = [];
      productSnapshots.forEach((productsSnapshot, index) => {
        const metadata = productMetadata[index];
        
        productsSnapshot.docs.forEach(productDoc => {
          const productData = productDoc.data();
          
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
              
              // Order-related fields
              orderId: metadata.orderId,
              businessId: metadata.orderData.businessId,
              businessName: metadata.businessData.businessName,
              businessKind: metadata.businessData.businessKind || 'חקלאי',
              Owner_ID: productData.Owner_ID,
              isFarmerOrder: metadata.orderData.isFarmerOrder || false,
              pickupSpots: metadata.pickupSpots,
              
              // Order timing fields
              orderType: metadata.orderType,
              endingTime: metadata.endingTime,
              endingTimeByPickupSpot: metadata.endingTimeByPickupSpot,
              schedule: metadata.orderData.schedule,
              
              // For cart compatibility
              selectedOption: productData.options && productData.options.length > 0 ? productData.options[0] : "",
              quantity: 0,
              uid: `${productDoc.id}_${Math.random().toString(36).substr(2, 9)}`
            });
          }
        });
      });

      // Sort products: Farmers first, then other businesses, "הבסקט של בסטה" last
      allProducts.sort((a, b) => {
        const isBastaA = a.businessName === 'הבסקט של בסטה';
        const isBastaB = b.businessName === 'הבסקט של בסטה';
        const isFarmerA = a.isFarmerOrder === true;
        const isFarmerB = b.isFarmerOrder === true;
        
        // If one is Basta and the other is not, non-Basta comes first
        if (isBastaA && !isBastaB) return 1;
        if (!isBastaA && isBastaB) return -1;
        
        // If both are not Basta, prioritize farmers
        if (!isBastaA && !isBastaB) {
          if (isFarmerA && !isFarmerB) return -1;
          if (!isFarmerA && isFarmerB) return 1;
        }
        
        // Otherwise maintain original order
        return 0;
      });

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

  // Calculate time remaining for a product, optionally for a specific pickup spot
  // Shows time until the 1-hour buffer (when products stop showing), not the actual end time
  const calculateTimeRemaining = (product, pickupSpot) => {
    const orderType = product.orderType;
    const now = new Date();

    if (orderType === 'one_time' || !orderType) {
      // Build a pseudo-orderData object for getEndingTimeForSpot
      const orderData = {
        endingTime: product.endingTime,
        endingTimeByPickupSpot: product.endingTimeByPickupSpot || {},
        Ending_Time: product.endingTime
      };
      
      const endingTime = getEndingTimeForSpot(orderData, pickupSpot);
      if (endingTime) {
        // Apply 1-hour buffer: countdown shows time until buffer (1 hour before actual end)
        const bufferEndTime = new Date(endingTime.getTime() - 60 * 60 * 1000);
        const diff = bufferEndTime - now;
        
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

  // Determine which products to display with community filter
  const baseProducts = isSearchActive 
    ? searchResults 
    : selectedCategory === 'הכל' 
      ? products 
      : products.filter(product => {
          const productCategory = product.category || 'אחר';
          // Special handling for "ירוקים ופטריות" - match both "ירוקים" and "ירוקים ופטריות"
          if (selectedCategory === 'ירוקים ופטריות') {
            return productCategory === 'ירוקים' || productCategory === 'ירוקים ופטריות';
          }
          return productCategory === selectedCategory;
        });
  
  // Filter by community and per-community ending time
  // Apply 1-hour buffer: products stop showing 1 hour before they actually end
  const displayProducts = (selectedCommunity)
    ? baseProducts.filter(p => {
        // Must include this pickup spot
        if (!Array.isArray(p.pickupSpots) || !p.pickupSpots.includes(selectedCommunity)) {
          return false;
        }
        
        // For recurring orders, check schedule
        if (p.orderType === 'recurring' && p.schedule) {
          return isOrderActiveNow(p.schedule);
        }
        
        // For one-time orders, check ending time with 1-hour buffer
        const orderData = {
          endingTime: p.endingTime,
          endingTimeByPickupSpot: p.endingTimeByPickupSpot || {},
          Ending_Time: p.endingTime
        };
        
        // If per-spot ending times exist, the spot MUST have an ending time to be valid
        const hasPerSpotTimes = p.endingTimeByPickupSpot && Object.keys(p.endingTimeByPickupSpot).length > 0;
        const endingTime = getEndingTimeForSpot(orderData, selectedCommunity);
        
        if (hasPerSpotTimes && !endingTime) {
          // Per-spot times exist but this spot doesn't have one - treat as inactive
          return false;
        }
        
        if (endingTime) {
          // Apply 1-hour buffer: stop showing 1 hour before actual end time
          const now = new Date();
          const bufferTime = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now
          return endingTime > bufferTime;
        }
        
        // Legacy orders without per-spot times: allow if no ending time (shouldn't happen for one_time)
        return p.orderType !== 'one_time';
      })
    : baseProducts;

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
        {/* Community Selector - small list above search */}
        <div className="mt-2 mb-3 px-1 max-w-xs" ref={communityDropdownRef}>
          <label className="block text-gray-700 text-sm font-medium mb-2 text-right">אזור איסוף:</label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsCommunityOpen(o => !o)}
              className="block w-full p-3 pr-10 text-right text-sm text-gray-900 bg-white rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 shadow-md border border-gray-200"
            >
              {selectedCommunity || 'בחר נקודת איסוף'}
            </button>
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center px-3 text-gray-700">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
            {isCommunityOpen && (
              <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg p-2" dir="rtl">
                {/** <div className="px-2 py-1.5 text-xs text-gray-600 cursor-pointer hover:bg-gray-50 rounded" onClick={() => { handleCommunityChange(''); setIsCommunityOpen(false); setCommunityQuery(''); }}>כל הקהילות</div> */}
                <input
                  type="text"
                  value={communityQuery}
                  onChange={(e) => setCommunityQuery(e.target.value)}
                  placeholder="חיפוש קהילה..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 text-right"
                />
                <div className="max-h-56 overflow-auto mt-2">
                  {pickupSpots.filter(s => s.toLowerCase().includes(communityQuery.trim().toLowerCase())).map((spot) => {
                    const isActive = spot === selectedCommunity;
                    return (
                      <div
                        key={spot}
                        onClick={() => { handleCommunityChange(spot); setIsCommunityOpen(false); setCommunityQuery(''); }}
                        className={`px-3 py-2 text-sm cursor-pointer rounded ${isActive ? 'bg-green-100 text-green-800' : 'hover:bg-gray-50 text-gray-800'}`}
                      >
                        {spot}
                      </div>
                    );
                  })}
                  {pickupSpots.filter(s => s.toLowerCase().includes(communityQuery.trim().toLowerCase())).length === 0 && (
                    <div className="px-3 py-2 text-sm text-gray-500 text-center">לא נמצאו תוצאות</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Search Bar */}
        <SearchBar 
          products={selectedCommunity ? products.filter(p => Array.isArray(p.pickupSpots) && p.pickupSpots.includes(selectedCommunity)) : products}
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
                  'ירוקים ופטריות': '🌿',
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
            selectedCommunity={selectedCommunity}
          />
        )}
      </div>
    </div>
  );
};

export default CategoryStore;

