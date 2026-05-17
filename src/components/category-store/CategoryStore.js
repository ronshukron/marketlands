import React, { useState, useEffect, useRef, useMemo } from 'react';
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
import { generateAvailableDeliveryDates, getEffectiveOrderCutoffAt, getWeekKey, isAlwaysOnGroceryOrder, isAlwaysOnGroceryOrderEnabled } from '../../utils/deliveryScheduleUtils';

const PRODUCT_QUERY_CHUNK_SIZE = 10;
const STORE_CATEGORIES = ['הכל', 'ירקות', 'פירות', 'ירוקים ופטריות', 'אחר'];

const getCategoryStoreSortRank = (product) => {
  if (product.businessName === 'הבסקט של בסטה') return 2;
  if (product.isFarmerOrder === true) return 0;
  return 1;
};

const sortCategoryStoreProducts = (a, b) => {
  const rankDiff = getCategoryStoreSortRank(a) - getCategoryStoreSortRank(b);
  if (rankDiff !== 0) return rankDiff;
  return (a.sortIndex ?? 0) - (b.sortIndex ?? 0);
};

const calculateCategoryCounts = (products) => {
  const counts = {};
  products.forEach(product => {
    const cat = product.category || 'אחר';
    counts[cat] = (counts[cat] || 0) + 1;
  });
  counts['הכל'] = products.length;
  return counts;
};

const getAdjustedSlideIndex = (index) => {
  const maxIndex = STORE_CATEGORIES.length - 1;
  if (index >= maxIndex) return Math.max(maxIndex - 1, 0);
  return index;
};

const CategoryStore = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('הכל');
  const [categoryCounts, setCategoryCounts] = useState({});
  const [searchResults, setSearchResults] = useState([]);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [selectedCommunity, setSelectedCommunity] = useState(() => {
    const saved = localStorage.getItem('selectedPickupSpot');
    return saved && saved !== 'הכל' ? saved : '';
  });
  const location = useLocation();
  const navigate = useNavigate();
  const sliderRef = useRef(null);
  const storeTopRef = useRef(null);
  const communityDropdownRef = useRef(null);
  const fetchProductsRequestIdRef = useRef(0);
  const [isCommunityOpen, setIsCommunityOpen] = useState(false);
  const [communityQuery, setCommunityQuery] = useState('');
  const [deliverySchedule, setDeliverySchedule] = useState(null);
  const [availableDeliveryDates, setAvailableDeliveryDates] = useState([]);
  const [selectedDeliveryDate, setSelectedDeliveryDate] = useState('');
  const [, setTimeTick] = useState(0);
  
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
    const categoryIndex = STORE_CATEGORIES.indexOf(cat);
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
      const categoryIndex = STORE_CATEGORIES.indexOf(selectedCategory);
      if (categoryIndex !== -1) {
        setTimeout(() => {
          if (sliderRef.current) {
            const targetIndex = getAdjustedSlideIndex(categoryIndex);
            sliderRef.current.slickGoTo(targetIndex);
          }
        }, 200);
      }
    }
  }, [selectedCategory]);
  
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

  useEffect(() => {
    const loadDeliverySchedule = async () => {
      if (!selectedCommunity) {
        setDeliverySchedule(null);
        return;
      }
      try {
        const scheduleSnap = await getDoc(doc(db, 'deliverySchedules', selectedCommunity));
        const scheduleData = scheduleSnap.exists() ? scheduleSnap.data() : null;
        setDeliverySchedule(scheduleData);
        const dates = scheduleData ? generateAvailableDeliveryDates(scheduleData) : [];
        const currentWeekKey = getWeekKey(new Date());
        const currentWeekDates = dates.filter((dateKey) => getWeekKey(dateKey) === currentWeekKey);
        const visibleWeekKey = currentWeekDates.length > 0 ? currentWeekKey : getWeekKey(dates[0]);
        const visibleDates = dates.filter((dateKey) => getWeekKey(dateKey) === visibleWeekKey);
        setAvailableDeliveryDates(visibleDates);
        setSelectedDeliveryDate((current) => {
          const stored = localStorage.getItem(`selectedDeliveryDate:${selectedCommunity}`);
          if (current && visibleDates.includes(current)) return current;
          if (stored && visibleDates.includes(stored)) return stored;
          return visibleDates[0] || '';
        });
      } catch (error) {
        console.error('Error loading delivery schedule for category store:', error);
        setDeliverySchedule(null);
        setAvailableDeliveryDates([]);
        setSelectedDeliveryDate('');
      }
    };

    loadDeliverySchedule();
  }, [selectedCommunity]);

  useEffect(() => {
    if (selectedCommunity && selectedDeliveryDate) {
      localStorage.setItem(`selectedDeliveryDate:${selectedCommunity}`, selectedDeliveryDate);
    }
  }, [selectedCommunity, selectedDeliveryDate]);

  useEffect(() => {
    const timer = setInterval(() => setTimeTick((tick) => tick + 1), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchCategorizedProducts = async () => {
    const requestId = fetchProductsRequestIdRef.current + 1;
    fetchProductsRequestIdRef.current = requestId;
    const isCurrentRequest = () => fetchProductsRequestIdRef.current === requestId;

    setLoading(true);
    setProducts([]);
    setCategoryCounts({});

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
        const isAlwaysOnGrocery = isAlwaysOnGroceryOrder(orderData);
        
        let orderType = orderData.orderType;
        if (isAlwaysOnGrocery) {
          orderType = 'always_on_grocery';
        }
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
        if (isAlwaysOnGrocery) {
          isActive = isAlwaysOnGroceryOrderEnabled(orderData);
        } else if (orderType === 'one_time') {
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

      if (!isCurrentRequest()) return;

      // Fetch product chunks in the same order used by the UI sort, publishing each
      // completed chunk so the grid can render before every product query finishes.
      const productJobs = [];
      let nextSortIndex = 0;
      
      activeOrders.forEach(order => {
        const businessData = businessMap[order.data.businessId];
        if (businessData) {
          const selectedProductIds = order.data.selectedProducts || [];
          if (selectedProductIds.length > 0) {
            for (let i = 0; i < selectedProductIds.length; i += PRODUCT_QUERY_CHUNK_SIZE) {
              const chunk = selectedProductIds.slice(i, i + PRODUCT_QUERY_CHUNK_SIZE);
              
              const productsQuery = query(
                collection(db, 'Products'),
                where('Owner_ID', '==', order.data.businessId),
                where('__name__', 'in', chunk)
              );
              
              const sortIndex = nextSortIndex++;
              productJobs.push({
                productsQuery,
                sortRank: getCategoryStoreSortRank({
                  businessName: businessData.businessName,
                  isFarmerOrder: order.data.isFarmerOrder || false
                }),
                sortIndex,
                orderId: order.id,
                orderData: order.data,
                orderType: order.orderType,
                orderMode: order.data.orderMode || '',
                alwaysOn: order.data.alwaysOn === true,
                groceryStore: order.data.groceryStore === true,
                endingTime: order.endingTime,
                endingTimeByPickupSpot: order.endingTimeByPickupSpot || {},
                businessData,
                pickupSpots: Array.isArray(order.data.pickupSpots) ? order.data.pickupSpots : []
              });
            }
          }
        }
      });

      const allProducts = [];

      productJobs.sort((a, b) => {
        if (a.sortRank !== b.sortRank) return a.sortRank - b.sortRank;
        return a.sortIndex - b.sortIndex;
      });

      for (const metadata of productJobs) {
        const productsSnapshot = await getDocs(metadata.productsQuery);
        if (!isCurrentRequest()) return;
        
        const batchProducts = [];
        productsSnapshot.docs.forEach((productDoc, productIndex) => {
          const productData = productDoc.data();
          
          if (productData.stockAmount > 0) {
            batchProducts.push({
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
              // Measurement type and unit size for kg/unit items
              measurementType: productData.measurementType || 'kg',
              unitSize: productData.unitSize || 1,
              averageWeightKg: productData.averageWeightKg || 1,
              
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
              orderMode: metadata.orderMode,
              alwaysOn: metadata.alwaysOn,
              groceryStore: metadata.groceryStore,
              fulfillmentConfig: metadata.orderData.fulfillmentConfig || {},
              orderData: metadata.orderData,
              endingTime: metadata.endingTime,
              endingTimeByPickupSpot: metadata.endingTimeByPickupSpot,
              schedule: metadata.orderData.schedule,
              
              // For cart compatibility
              selectedOption: productData.options && productData.options.length > 0 ? productData.options[0] : "",
              quantity: 0,
              uid: `${productDoc.id}_${metadata.orderId}`,
              sortIndex: (metadata.sortIndex * PRODUCT_QUERY_CHUNK_SIZE) + productIndex
            });
          }
        });

        if (batchProducts.length > 0) {
          allProducts.push(...batchProducts);
          allProducts.sort(sortCategoryStoreProducts);
          setProducts([...allProducts]);
          setCategoryCounts(calculateCategoryCounts(allProducts));
        }
      }

      if (isCurrentRequest()) {
        setProducts([...allProducts]);
        setCategoryCounts(calculateCategoryCounts(allProducts));
      }
      
    } catch (error) {
      if (isCurrentRequest()) {
        console.error('Error fetching categorized products:', error);
      }
    } finally {
      if (isCurrentRequest()) {
        setLoading(false);
      }
    }
  };

  // Calculate time remaining for a product, optionally for a specific pickup spot
  // Shows time until the 1-hour buffer (when products stop showing), not the actual end time
  const calculateTimeRemaining = (product, pickupSpot) => {
    const orderType = product.orderType;
    const now = new Date();

    if (product.orderMode === 'always_on_grocery' || product.alwaysOn || product.groceryStore || orderType === 'always_on_grocery') {
      if (!deliverySchedule || !selectedDeliveryDate) {
        return 'זמין להזמנה - בחרו תאריך משלוח';
      }

      const cutoffAt = getEffectiveOrderCutoffAt(
        selectedDeliveryDate,
        deliverySchedule,
        product.orderData || product,
        pickupSpot
      );

      if (!cutoffAt) {
        return 'פתוח להזמנה לתאריך הנבחר';
      }

      const diff = cutoffAt - now;
      if (diff <= 0) {
        return 'זמן החיתוך עבר';
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      let timeString = '';
      if (days > 0) timeString += `${days} ימים `;
      if (hours > 0) timeString += `${hours} שעות `;
      if (minutes > 0) timeString += `${minutes} דקות`;

      return `נשאר להזמנה: ${timeString || 'פחות מדקה'}`;
    }

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

        if (p.orderMode === 'always_on_grocery' || p.alwaysOn || p.groceryStore || p.orderType === 'always_on_grocery') {
          if (!deliverySchedule || !selectedDeliveryDate) return true;
          return generateAvailableDeliveryDates(deliverySchedule, {
            orderData: p.orderData || p,
            communityName: selectedCommunity,
          }).includes(selectedDeliveryDate);
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

  const searchProducts = useMemo(() => {
    if (!selectedCommunity) return products;
    return products.filter(p => Array.isArray(p.pickupSpots) && p.pickupSpots.includes(selectedCommunity));
  }, [products, selectedCommunity]);

  // Do not early-return on loading; show search/carousel immediately and spinner below

  const currentCategoryIndex = STORE_CATEGORIES.indexOf(selectedCategory);

  // Adjust the slide index so edges behave nicely with 3 visible slides
  // - Index 0 can be centered when infinite=true
  // - Last index cannot be centered; use second-to-last so the last is visible on the right
  // - Second-to-last can be centered and shows the last on the right
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

        {selectedCommunity && availableDeliveryDates.length > 0 && (
          <div className="mb-3 px-1">
            <p className="text-sm font-medium text-gray-700 mb-2 text-right">
              תאריך משלוח:
            </p>
            <div className="flex flex-wrap gap-2">
              {availableDeliveryDates.map((dateKey) => {
                const date = new Date(`${dateKey}T00:00:00`);
                const label = date.toLocaleDateString('he-IL', {
                  weekday: 'short',
                  day: '2-digit',
                  month: '2-digit',
                });
                const selected = selectedDeliveryDate === dateKey;
                return (
                  <button
                    key={dateKey}
                    type="button"
                    onClick={() => setSelectedDeliveryDate(dateKey)}
                    className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                      selected
                        ? 'bg-green-600 border-green-700 text-white'
                        : 'bg-white border-green-200 text-green-900 hover:border-green-500'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Search Bar */}
        <SearchBar 
          products={searchProducts}
          onSearchResults={setSearchResults}
          setSearchActive={setIsSearchActive}
        />

        {/* Category Carousel - shown when not searching, only on mobile */}
        {!isSearchActive && (
          <div className="my-6 category-carousel-container md:hidden">
            <Slider ref={sliderRef} {...sliderSettings}>
              {STORE_CATEGORIES.map((category) => {
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
                        const categoryIndex = STORE_CATEGORIES.indexOf(category);
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
        
        {(displayProducts.length > 0 || !loading) && (
          <ProductGrid 
            products={displayProducts} 
            calculateTimeRemaining={calculateTimeRemaining}
            selectedCommunity={selectedCommunity}
          />
        )}

        {/* Keep loaded products visible while the remaining batches continue loading. */}
        {loading && (
          <div className="text-center py-6">
            <LoadingSpinner />
            <p className="mt-2 text-gray-600 text-sm">טוען מוצרים...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CategoryStore;

