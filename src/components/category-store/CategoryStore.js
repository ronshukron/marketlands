import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Swal from 'sweetalert2';
import { useCart } from '../../contexts/CartContext';
import { searchProducts as searchProductsByTerm } from '../../utils/productSearchUtils';
import { collection, query, getDocs, doc, getDoc, where } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import LoadingSpinner from '../LoadingSpinner';
import ProductGrid from './ProductGrid';
import IntroductionBasketCard from './IntroductionBasketCard';
import SearchBar from './SearchBar';
import './CategoryStore.css';
import { useLocation, useNavigate } from 'react-router-dom';
import Slider from 'react-slick';
import usePickupSpots from '../../hooks/usePickupSpots';
import { getEndingTimeForSpot, isOrderActiveNow } from '../../utils/orderUtils';
import { generateAvailableDeliveryDates, getEffectiveOrderCutoffAt, getWeekKey, isAlwaysOnGroceryOrder, isAlwaysOnGroceryOrderEnabled, isShowingNextDeliveryWeek } from '../../utils/deliveryScheduleUtils';
import { enrichProductsWithFarmerBadge } from '../../utils/farmerBadgeUtils';
import { getEstimatedLineTotal } from '../../utils/pricing';
import { communityListIncludes } from '../../constants/marketplaceFulfillment';
import { resolveCommunityName } from '../../services/pickupSpotsService';
import {
  INTRODUCTION_BASKET_ADJUSTMENT_PREFIX,
  listActiveIntroductionBasketsForCommunity,
} from '../../services/introductionBasketService';
import CommunityDiscountWidget from '../communityHub/widgets/CommunityDiscountWidget';

const PRODUCT_QUERY_CHUNK_SIZE = 10;
const PRODUCT_QUERY_CONCURRENCY = 6;
const STORE_CATEGORIES = ['הכל', 'ירקות', 'פירות', 'ירוקים ופטריות', 'משתלה', 'אחר'];
const hebrewPickupSpotCollator = new Intl.Collator('he');

const sortPickupSpotsByHebrewAlphabet = (spots) =>
  [...spots].sort((a, b) => hebrewPickupSpotCollator.compare(a, b));

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

const buildCandidateOrderQueries = (adjustedCurrentTime) => {
  const ordersRef = collection(db, 'Orders');
  return [
    query(ordersRef, where('endingTime', '>', adjustedCurrentTime)),
    query(ordersRef, where('Ending_Time', '>', adjustedCurrentTime)),
    query(ordersRef, where('orderType', '==', 'recurring')),
    query(ordersRef, where('orderType', '==', 'always_on_grocery')),
    query(ordersRef, where('orderMode', '==', 'always_on_grocery')),
    query(ordersRef, where('alwaysOn', '==', true)),
    query(ordersRef, where('groceryStore', '==', true)),
  ];
};

const fetchCandidateOrderDocs = async (adjustedCurrentTime) => {
  try {
    const snapshots = await Promise.all(
      buildCandidateOrderQueries(adjustedCurrentTime).map((orderQuery) => getDocs(orderQuery))
    );
    const docsById = new Map();
    snapshots.forEach((snapshot) => {
      snapshot.docs.forEach((orderDoc) => docsById.set(orderDoc.id, orderDoc));
    });
    return Array.from(docsById.values());
  } catch (error) {
    console.warn('Optimized order queries failed; falling back to full Orders scan:', error);
    const ordersSnapshot = await getDocs(query(collection(db, 'Orders')));
    return ordersSnapshot.docs;
  }
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

const buildCartItemFromProduct = (product) => {
  const measurementType = product.measurementType || 'kg';
  const isKgItem = measurementType === 'kg';
  const unitSize = product.unitSize || 1;
  const selectedOption = product.selectedOption || (product.options?.length > 0 ? product.options[0] : '');
  return {
    id: product.id,
    name: product.name,
    price: product.price,
    basePrice: product.price,
    quantityDiscountThreshold: product.quantityDiscountThreshold ?? null,
    quantityDiscountPrice: product.quantityDiscountPrice ?? null,
    quantityDiscountLabel: product.quantityDiscountLabel ?? null,
    selectedOption,
    quantity: isKgItem ? unitSize : 1,
    images: product.images || [],
    businessId: product.businessId,
    businessName: product.businessName,
    stockAmount: product.stockAmount,
    catalogNumber: product.catalogNumber,
    vatType: product.vatType ?? 3,
    measurementType,
    unitSize,
    averageWeightKg: product.averageWeightKg || 1,
  };
};

const CategoryStore = () => {
  const { addItem } = useCart();
  const { pickupSpots } = usePickupSpots();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('הכל');
  const [categoryCounts, setCategoryCounts] = useState({});
  const [searchResults, setSearchResults] = useState([]);
  const [multiSearchSections, setMultiSearchSections] = useState(null);
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
  const [deliveryDatesLoading, setDeliveryDatesLoading] = useState(false);
  const [selectedDeliveryDate, setSelectedDeliveryDate] = useState('');
  const [introductionBaskets, setIntroductionBaskets] = useState([]);
  const [basketsLoading, setBasketsLoading] = useState(false);
  const [, setTimeTick] = useState(0);
  const farmerBadgeBusinessIds = deliverySchedule?.farmerBadgeBusinessIds;
  const productsWithFarmerBadges = useMemo(
    () => enrichProductsWithFarmerBadge(products, farmerBadgeBusinessIds),
    [farmerBadgeBusinessIds, products]
  );
  const searchResultsWithFarmerBadges = useMemo(
    () => enrichProductsWithFarmerBadge(searchResults, farmerBadgeBusinessIds),
    [farmerBadgeBusinessIds, searchResults]
  );
  const sortedPickupSpots = useMemo(() => sortPickupSpotsByHebrewAlphabet(pickupSpots), [pickupSpots]);
  const filteredPickupSpots = useMemo(() => {
    const query = communityQuery.trim().toLowerCase();
    if (!query) return sortedPickupSpots;
    return sortedPickupSpots.filter(s => s.toLowerCase().includes(query));
  }, [communityQuery, sortedPickupSpots]);
  
  // Sync selected category and community with URL query params (?category=, ?community=)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const cat = params.get('category') || 'הכל';
    const comm = params.get('community') || params.get('pickupSpot');
    setSelectedCategory(cat);
    setIsSearchActive(false); // leave search mode when category changes
    if (comm && comm.trim()) {
      const resolvedCommunity = resolveCommunityName(comm.trim()) || comm.trim();
      setSelectedCommunity(resolvedCommunity);
      try {
        localStorage.setItem('selectedPickupSpot', resolvedCommunity);
      } catch {}
    } else {
      const saved = localStorage.getItem('selectedPickupSpot');
      if (saved && saved !== 'הכל') {
        setSelectedCommunity(resolveCommunityName(saved) || saved);
      }
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
    let active = true;

    const loadDeliverySchedule = async () => {
      if (!selectedCommunity) {
        setDeliverySchedule(null);
        setAvailableDeliveryDates([]);
        setDeliveryDatesLoading(false);
        setSelectedDeliveryDate('');
        return;
      }
      const communityKey = resolveCommunityName(selectedCommunity) || selectedCommunity;
      setDeliverySchedule(null);
      setAvailableDeliveryDates([]);
      setDeliveryDatesLoading(true);
      try {
        const scheduleSnap = await getDoc(doc(db, 'deliverySchedules', communityKey));
        if (!active) return;
        const scheduleData = scheduleSnap.exists() ? scheduleSnap.data() : null;
        setDeliverySchedule(scheduleData);
        const dates = scheduleData ? generateAvailableDeliveryDates(scheduleData) : [];
        const currentWeekKey = getWeekKey(new Date());
        const currentWeekDates = dates.filter((dateKey) => getWeekKey(dateKey) === currentWeekKey);
        const visibleWeekKey = currentWeekDates.length > 0 ? currentWeekKey : getWeekKey(dates[0]);
        const visibleDates = dates.filter((dateKey) => getWeekKey(dateKey) === visibleWeekKey);
        setAvailableDeliveryDates(visibleDates);
        setSelectedDeliveryDate((current) => {
          const stored = localStorage.getItem(`selectedDeliveryDate:${communityKey}`);
          if (current && visibleDates.includes(current)) return current;
          if (stored && visibleDates.includes(stored)) return stored;
          return visibleDates[0] || '';
        });
      } catch (error) {
        if (!active) return;
        console.error('Error loading delivery schedule for category store:', error);
        setDeliverySchedule(null);
        setAvailableDeliveryDates([]);
        setSelectedDeliveryDate('');
      } finally {
        if (active) setDeliveryDatesLoading(false);
      }
    };

    loadDeliverySchedule();
    return () => {
      active = false;
    };
  }, [selectedCommunity]);

  useEffect(() => {
    if (selectedCommunity && selectedDeliveryDate) {
      localStorage.setItem(`selectedDeliveryDate:${selectedCommunity}`, selectedDeliveryDate);
    }
  }, [selectedCommunity, selectedDeliveryDate]);

  useEffect(() => {
    let active = true;

    const loadIntroductionBaskets = async () => {
      if (!selectedCommunity) {
        setIntroductionBaskets([]);
        return;
      }

      setBasketsLoading(true);
      try {
        const baskets = await listActiveIntroductionBasketsForCommunity(selectedCommunity);
        if (active) setIntroductionBaskets(baskets);
      } catch (error) {
        console.error('Error loading introduction baskets:', error);
        if (active) setIntroductionBaskets([]);
      } finally {
        if (active) setBasketsLoading(false);
      }
    };

    loadIntroductionBaskets();
    return () => {
      active = false;
    };
  }, [selectedCommunity]);

  useEffect(() => {
    const timer = setInterval(() => setTimeTick((tick) => tick + 1), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchCategorizedProducts = useCallback(async () => {
    const requestId = fetchProductsRequestIdRef.current + 1;
    fetchProductsRequestIdRef.current = requestId;
    const isCurrentRequest = () => fetchProductsRequestIdRef.current === requestId;

    setLoading(true);
    setLoadError('');
    setProducts([]);
    setCategoryCounts({});

    try {
      const currentTime = new Date();
      const adjustedCurrentTime = new Date(currentTime.getTime() + 60 * 60 * 1000); // Add 1 hour

      const orderDocs = await fetchCandidateOrderDocs(adjustedCurrentTime);

      // Filter active orders first
      // For per-pickup-spot ending times, we keep orders that have at least one active pickup spot
      const activeOrders = [];
      orderDocs.forEach(orderDoc => {
        const orderData = orderDoc.data();
        if (orderData.archived === true) {
          return;
        }

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

      // Fetch each business doc once, even when a business has multiple active orders.
      const businessIds = [...new Set(activeOrders.map((order) => order.data.businessId).filter(Boolean))];
      const businessDocs = await Promise.all(
        businessIds.map((businessId) => getDoc(doc(db, 'businesses', businessId)))
      );
      
      // Create business map for quick lookup
      const businessMap = {};
      businessDocs.forEach((businessDoc, index) => {
        if (businessDoc.exists()) {
          businessMap[businessIds[index]] = businessDoc.data();
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
          const selectedProductIds = Array.isArray(order.data.selectedProducts)
            ? [...new Set(order.data.selectedProducts.filter((id) => typeof id === 'string' && id.trim()))]
            : [];
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

      const publishProducts = () => {
        const sortedProducts = [...allProducts].sort(sortCategoryStoreProducts);
        setProducts(sortedProducts);
        setCategoryCounts(calculateCategoryCounts(sortedProducts));
      };

      let nextJobIndex = 0;
      const runProductWorker = async () => {
        while (nextJobIndex < productJobs.length) {
          const metadata = productJobs[nextJobIndex];
          nextJobIndex += 1;

          // eslint-disable-next-line no-await-in-loop
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
                quantityDiscountThreshold: productData.quantityDiscountThreshold ?? null,
                quantityDiscountPrice: productData.quantityDiscountPrice ?? null,
                quantityDiscountLabel: productData.quantityDiscountLabel ?? null,
                description: productData.description,
                images: productData.images || [],
                options: productData.options || [],
                stockAmount: productData.stockAmount,
                category: productData.category || 'אחר',
                showInAllCategory: productData.showInAllCategory,
                catalogNumber: productData.catalogNumber,
                vatType: productData.vatType ?? 3,
                isOrganic: Boolean(productData.isOrganic),
                isRecommended: Boolean(productData.isRecommended),
                isSample: Boolean(productData.isSample),
                createdAt: productData.createdAt || null,
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
            publishProducts();
          }
        }
      };

      const workerCount = Math.min(PRODUCT_QUERY_CONCURRENCY, productJobs.length);
      await Promise.all(Array.from({ length: workerCount }, () => runProductWorker()));

      if (isCurrentRequest()) {
        publishProducts();
      }
      
    } catch (error) {
      if (isCurrentRequest()) {
        console.error('Error fetching categorized products:', error);
        setLoadError(
          error?.code === 'permission-denied'
            ? 'אין הרשאה לטעון מוצרים. בדקו את חוקי Firestore עבור Orders / Products / businesses.'
            : 'לא הצלחנו לטעון את המוצרים. נסו לרענן את העמוד בעוד רגע.'
        );
      }
    } finally {
      if (isCurrentRequest()) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchCategorizedProducts();
  }, [fetchCategorizedProducts]);

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

  const filterProductsForCommunity = useCallback((productList) => {
    if (!selectedCommunity) return productList;
    return productList.filter((p) => {
      if (!communityListIncludes(p.pickupSpots, selectedCommunity)) {
        return false;
      }

      if (p.orderMode === 'always_on_grocery' || p.alwaysOn || p.groceryStore || p.orderType === 'always_on_grocery') {
        if (!deliverySchedule || !selectedDeliveryDate) return true;
        return generateAvailableDeliveryDates(deliverySchedule, {
          orderData: p.orderData || p,
          communityName: selectedCommunity,
        }).includes(selectedDeliveryDate);
      }

      if (p.orderType === 'recurring' && p.schedule) {
        return isOrderActiveNow(p.schedule);
      }

      const orderData = {
        endingTime: p.endingTime,
        endingTimeByPickupSpot: p.endingTimeByPickupSpot || {},
        Ending_Time: p.endingTime,
      };

      const hasPerSpotTimes = p.endingTimeByPickupSpot && Object.keys(p.endingTimeByPickupSpot).length > 0;
      const endingTime = getEndingTimeForSpot(orderData, selectedCommunity);

      if (hasPerSpotTimes && !endingTime) {
        return false;
      }

      if (endingTime) {
        const now = new Date();
        const bufferTime = new Date(now.getTime() + 60 * 60 * 1000);
        return endingTime > bufferTime;
      }

      return p.orderType !== 'one_time';
    });
  }, [selectedCommunity, deliverySchedule, selectedDeliveryDate]);

  const handleMultiSearch = useCallback((terms) => {
    const pool = selectedCommunity
      ? productsWithFarmerBadges.filter((p) => communityListIncludes(p.pickupSpots, selectedCommunity))
      : productsWithFarmerBadges;
    const sections = terms.map((term) => ({
      term,
      products: filterProductsForCommunity(searchProductsByTerm(pool, term)),
    }));
    setMultiSearchSections(sections);
    setIsSearchActive(true);
  }, [filterProductsForCommunity, productsWithFarmerBadges, selectedCommunity]);

  const handleBulkAddToCart = useCallback((matches) => {
    let added = 0;
    const notFound = [];

    matches.forEach(({ term, product }) => {
      if (!product) {
        notFound.push(term);
        return;
      }
      const item = buildCartItemFromProduct(product);
      addItem(item, product.orderId, product.businessId, 0);
      added += 1;
    });

    const notFoundText = notFound.length > 0 ? `\nלא נמצאו: ${notFound.join(', ')}` : '';
    Swal.fire({
      title: 'הוספה לסל',
      text: `נוספו ${added} פריטים${notFoundText}`,
      icon: added > 0 ? 'success' : 'warning',
      confirmButtonText: 'אישור',
    });
  }, [addItem]);

  const handleAddIntroductionBasket = useCallback((basket) => {
    if (!selectedCommunity) {
      Swal.fire('בחרו קהילה', 'יש לבחור נקודת איסוף לפני הוספת סל היכרות.', 'warning');
      return;
    }

    const componentLines = Array.isArray(basket.componentLines) ? basket.componentLines : [];
    if (componentLines.length === 0) {
      Swal.fire('סל לא זמין', 'לא נמצאו פריטים בסל הזה.', 'warning');
      return;
    }

    const basketInstanceId = `${basket.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const componentSubtotal = componentLines.reduce((sum, line) => sum + getEstimatedLineTotal(line), 0);
    const displayPrice = Number(basket.displayPrice) || 0;

    componentLines.forEach((line) => {
      addItem({
        id: line.productId,
        name: line.productName,
        price: Number(line.price ?? line.priceSnapshot) || 0,
        selectedOption: line.selectedOption || '',
        quantity: Number(line.quantity) || 1,
        images: line.images || [],
        businessId: line.businessId,
        businessName: line.businessName,
        stockAmount: line.stockAmount,
        catalogNumber: line.catalogNumber,
        vatType: line.vatType ?? 3,
        measurementType: line.measurementType || 'kg',
        unitSize: line.unitSize || 1,
        averageWeightKg: line.averageWeightKg || 1,
        basketId: basket.id,
        basketInstanceId,
        basketTitle: basket.title,
        basketPrice: displayPrice,
        basketComponentSubtotal: componentSubtotal,
        basketCommunity: selectedCommunity,
        isBasketComponent: true,
      }, line.orderId, line.businessId, line.minimumOrderAmount || 0);
    });

    const adjustment = Math.round((displayPrice - componentSubtotal) * 100) / 100;
    if (Math.abs(adjustment) >= 0.01) {
      const anchor = componentLines[0];
      addItem({
        id: `${INTRODUCTION_BASKET_ADJUSTMENT_PREFIX}:${basket.id}:${basketInstanceId}`,
        name: adjustment < 0
          ? `הנחת סל היכרות - ${basket.title}`
          : `התאמת מחיר סל היכרות - ${basket.title}`,
        price: adjustment,
        selectedOption: basket.title,
        quantity: 1,
        images: basket.image ? [basket.image] : [],
        businessId: anchor.businessId,
        businessName: anchor.businessName,
        stockAmount: 999999,
        catalogNumber: '',
        vatType: 3,
        measurementType: 'package',
        unitSize: 1,
        averageWeightKg: 1,
        isShipping: true,
        isBasketAdjustment: true,
        basketId: basket.id,
        basketInstanceId,
        basketTitle: basket.title,
        basketPrice: displayPrice,
        basketComponentSubtotal: componentSubtotal,
        basketCommunity: selectedCommunity,
      }, anchor.orderId, anchor.businessId, 0);
    }

    Swal.fire({
      title: 'סל היכרות נוסף!',
      text: `${basket.title} נוסף לסל עם ${componentLines.length} פריטים`,
      icon: 'success',
      timer: 1800,
      showConfirmButton: false,
    });
  }, [addItem, selectedCommunity]);

  const handleClearMultiSearch = useCallback(() => {
    setMultiSearchSections(null);
  }, []);

  const handleSearchResults = useCallback((results) => {
    setSearchResults(results);
    setMultiSearchSections(null);
  }, []);

  const isMultiSearchActive = Boolean(multiSearchSections && multiSearchSections.length > 0);

  const filteredMultiSections = useMemo(() => {
    if (!multiSearchSections) return null;
    return multiSearchSections.map(({ term, products: sectionProducts }) => ({
      term,
      products: filterProductsForCommunity(
        enrichProductsWithFarmerBadge(sectionProducts, farmerBadgeBusinessIds)
      ),
    }));
  }, [farmerBadgeBusinessIds, multiSearchSections, filterProductsForCommunity]);

  // Determine which products to display with community filter
  const baseProducts = isMultiSearchActive
    ? []
    : isSearchActive
    ? searchResultsWithFarmerBadges
    : selectedCategory === 'הכל'
      ? productsWithFarmerBadges.filter((product) => {
          const productCategory = product.category || 'אחר';
          if (productCategory === 'משתלה') {
            return Boolean(product.showInAllCategory);
          }
          return true;
        })
      : productsWithFarmerBadges.filter(product => {
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
        if (!communityListIncludes(p.pickupSpots, selectedCommunity)) {
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

  const searchableProducts = useMemo(() => {
    if (!selectedCommunity) return productsWithFarmerBadges;
    return productsWithFarmerBadges.filter(
      (product) => communityListIncludes(product.pickupSpots, selectedCommunity)
    );
  }, [productsWithFarmerBadges, selectedCommunity]);

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
                <div
                  className="px-2 py-1.5 text-xs text-gray-600 cursor-pointer hover:bg-gray-50 rounded"
                  onClick={() => { handleCommunityChange(''); setIsCommunityOpen(false); setCommunityQuery(''); }}
                >
                  כל נקודות האיסוף
                </div>
                <input
                  type="text"
                  value={communityQuery}
                  onChange={(e) => setCommunityQuery(e.target.value)}
                  placeholder="חיפוש קהילה..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 text-right"
                />
                <div className="max-h-56 overflow-auto mt-2">
                  {filteredPickupSpots.map((spot) => {
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
                  {filteredPickupSpots.length === 0 && (
                    <div className="px-3 py-2 text-sm text-gray-500 text-center">לא נמצאו תוצאות</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {selectedCommunity && !deliveryDatesLoading && availableDeliveryDates.length === 0 && (
          <div className="mb-3 px-1">
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 text-right">
              אין תאריכי משלוח זמינים לקהילה זו כרגע.
            </p>
          </div>
        )}

        {selectedCommunity && availableDeliveryDates.length > 0 && (
          <div className="mb-3 px-1">
            {isShowingNextDeliveryWeek(availableDeliveryDates) && (
              <p className="text-lg font-black text-amber-900 bg-amber-100 border-2 border-amber-400 rounded-lg p-3 mb-3 text-right">
                שימו לב: אין משלוח השבוע — ההזמנה תישלח בשבוע הבא!
              </p>
            )}
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

        {selectedCommunity && (
          <div className="mb-3 px-1">
            <CommunityDiscountWidget
              communityName={selectedCommunity}
              deliveryWeekKey={selectedDeliveryDate ? getWeekKey(selectedDeliveryDate) : undefined}
              variant="compact"
              showCommunityLink
            />
          </div>
        )}

        {/* Search Bar */}
        <SearchBar 
          products={searchableProducts}
          onSearchResults={handleSearchResults}
          setSearchActive={setIsSearchActive}
          onMultiSearch={handleMultiSearch}
          onBulkAddToCart={handleBulkAddToCart}
          onClearMultiSearch={handleClearMultiSearch}
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
                  'משתלה': '🪴',
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
        {isSearchActive && !isMultiSearchActive && (
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

        {isMultiSearchActive && filteredMultiSections && (
          <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h3 className="text-lg font-semibold text-blue-900">
              רשימת קניות
            </h3>
          </div>
        )}

        {!isSearchActive && selectedCommunity && !basketsLoading && introductionBaskets.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h3 className="text-xl font-black text-emerald-900">סלי היכרות לקהילה</h3>
                <p className="text-sm text-gray-600">
                  סל אחד במחיר קבוע, עם פריטים מחקלאים שונים שמתווספים להזמנה הרגילה.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {introductionBaskets.map((basket) => (
                <IntroductionBasketCard
                  key={basket.id}
                  basket={basket}
                  onAdd={handleAddIntroductionBasket}
                />
              ))}
            </div>
          </section>
        )}

        {loadError && !loading && (
          <div className="text-center py-10 px-4 bg-red-50 border border-red-200 rounded-xl">
            <h3 className="text-lg font-semibold text-red-800 mb-2">טעינת המוצרים נכשלה</h3>
            <p className="text-sm text-red-700 mb-4">{loadError}</p>
            <button
              type="button"
              onClick={fetchCategorizedProducts}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              נסו שוב
            </button>
          </div>
        )}

        {!loadError && (
          isMultiSearchActive && filteredMultiSections ? (
            filteredMultiSections.map(({ term, products: sectionProducts }) => (
              <section key={term} className="mb-8">
                <h3 className="text-lg font-semibold text-gray-800 mb-3 pr-1 border-r-4 border-green-500">
                  {term}
                  <span className="text-sm font-normal text-gray-500 mr-2">
                    ({sectionProducts.length} מוצרים)
                  </span>
                </h3>
                {sectionProducts.length > 0 ? (
                  <ProductGrid
                    products={sectionProducts}
                    calculateTimeRemaining={calculateTimeRemaining}
                    selectedCommunity={selectedCommunity}
                  />
                ) : (
                  <p className="text-sm text-gray-500 pr-1">לא נמצאו מוצרים עבור &quot;{term}&quot;</p>
                )}
              </section>
            ))
          ) : (
            (displayProducts.length > 0 || !loading) && (
              <ProductGrid
                products={displayProducts}
                calculateTimeRemaining={calculateTimeRemaining}
                selectedCommunity={selectedCommunity}
              />
            )
          )
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

