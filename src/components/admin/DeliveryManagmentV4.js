import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { collection, getDocs, doc, getDoc, setDoc, onSnapshot, writeBatch, query, where, limit, runTransaction } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import LoadingSpinner from '../LoadingSpinner';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { pickupSpots } from '../../data/pickupSpots';
import { format } from 'date-fns';

// Modal animation styles
const modalStyles = `
  @keyframes scaleIn {
    from {
      transform: scale(0.8);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
  .animate-scale {
    animation: scaleIn 0.2s ease-out;
  }
`;

const ADMIN_UIDS = ['rfHOLhNoJOW8ByNypCtm3hlSNKs2'];

const DeliveryManagementV4 = () => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pickupSpotItems, setPickupSpotItems] = useState({});
  const [cratesByPickupSpot, setCratesByPickupSpot] = useState({});
  const [cratesContentByPickupSpot, setCratesContentByPickupSpot] = useState({});
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [productDetails, setProductDetails] = useState({}); // Store product details (images, thaiName)
  const [completedItems, setCompletedItems] = useState(new Set()); // Track completed items
  const [showUnmarkModal, setShowUnmarkModal] = useState(false);
  const [pendingUnmark, setPendingUnmark] = useState(null);
  const [showQuantityWarning, setShowQuantityWarning] = useState(null); // {productName, quantity}
  
  // New state for week selection
  const [availableWeeks, setAvailableWeeks] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState('');
  
  // New state for community selection
  const [selectedCommunities, setSelectedCommunities] = useState(new Set());
  const [showCommunityDropdown, setShowCommunityDropdown] = useState(false);
  const communityDropdownRef = useRef(null);
  // Persistent customer numbering GLOBALLY across all pickup spots (stored in localStorage per week)
  const [customerNumbersGlobal, setCustomerNumbersGlobal] = useState({});
  const [permanentNumbersMap, setPermanentNumbersMap] = useState({});
  const [showHebrewSummary, setShowHebrewSummary] = useState(false);
  const [customerDemands, setCustomerDemands] = useState({});
  const [customersByPickupSpot, setCustomersByPickupSpot] = useState({});
  
  // New: Community Order State
  const [communityOrder, setCommunityOrder] = useState([]);
  const [isReordering, setIsReordering] = useState(false);

  // New: Scroll to next incomplete
  const scrollToNextIncomplete = () => {
    // Find all incomplete item containers
    // We'll use a data attribute 'data-status="incomplete"' on the crate/item divs
    const incomplete = document.querySelectorAll('[data-status="incomplete"]');
    if (incomplete.length === 0) {
      alert("כל הפריטים הושלמו!");
      return;
    }
    
    // Find the first one that is "below" the current viewport or just the next one in DOM order
    // For simplicity, let's find the first one that is not fully visible or just the first one in the list
    // Better: find the first one currently below the window top + offset
    const currentScroll = window.scrollY + 100; // + header offset
    let nextTarget = null;
    
    for (let i = 0; i < incomplete.length; i++) {
      const el = incomplete[i];
      const rect = el.getBoundingClientRect();
      const absTop = rect.top + window.scrollY;
      
      if (absTop > currentScroll) {
        nextTarget = el;
        break;
      }
    }
    
    // If no target found below, wrap around to the first one
    if (!nextTarget && incomplete.length > 0) {
      nextTarget = incomplete[0];
    }
    
    if (nextTarget) {
      nextTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Add a temporary highlight flash
      nextTarget.classList.add('ring-4', 'ring-yellow-400');
      setTimeout(() => nextTarget.classList.remove('ring-4', 'ring-yellow-400'), 1000);
    }
  };

  // New: Permanent Customer Numbers Logic
  const fetchPermanentCustomerNumbers = async (customersList) => {
    // customersList: array of { id: string (phone/email), name: string }
    if (!customersList.length) return {};

    const mapping = {};
    const missing = [];

    // 1. Check existing
    // Optimization: Fetch all numbers or batch query. For now, let's fetch all numbers (assuming < a few thousands is fine for cache)
    // Or chunk query by ID.
    // Better: Create 'customerNumbers' collection where ID is the phone number.
    
    // We'll query by IDs in chunks of 10
    const chunks = [];
    for (let i = 0; i < customersList.length; i += 10) {
      chunks.push(customersList.slice(i, i + 10));
    }

    for (const chunk of chunks) {
      await Promise.all(chunk.map(async (c) => {
        const docRef = doc(db, 'customerNumbers', c.id);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          mapping[c.id] = snap.data().number;
        } else {
          missing.push(c);
        }
      }));
    }

    // 2. Allocate new numbers
    if (missing.length > 0) {
      // Get current max number. Store it in a config doc 'customerNumbers/_config'
      const configRef = doc(db, 'customerNumbers', '_config');
      
      await runTransaction(db, async (transaction) => {
        const configSnap = await transaction.get(configRef);
        let currentMax = 0;
        if (configSnap.exists()) {
          currentMax = configSnap.data().maxNumber || 0;
        }

        let next = currentMax;
        for (const m of missing) {
          next++;
          const newRef = doc(db, 'customerNumbers', m.id);
          transaction.set(newRef, { number: next, name: m.name, assignedAt: new Date() });
          mapping[m.id] = next;
        }
        
        transaction.set(configRef, { maxNumber: next }, { merge: true });
      });
    }

    return mapping;
  };

  const fetchCustomDemandsForUsers = async (userIds) => {
    if (!userIds || userIds.length === 0) return {};
    const demandsMap = {};
    await Promise.all(
      userIds.map(async (uid) => {
        if (!uid) return;
        try {
          const userRef = doc(db, 'users', uid);
          const snap = await getDoc(userRef);
          if (snap.exists()) {
            const data = snap.data();
            if (data.customDemandsHebrew || data.customDemandsThai) {
              demandsMap[uid] = {
                hebrew: data.customDemandsHebrew || '',
                thai: data.customDemandsThai || '',
              };
            }
          }
        } catch (err) {
          console.error(`Error fetching custom demands for user ${uid}:`, err);
        }
      })
    );
    return demandsMap;
  };

  // Box threshold with localStorage persistence
  const [boxThreshold, setBoxThreshold] = useState(() => {
    const stored = localStorage.getItem('delivery_box_threshold_v3');
    return stored ? Number(stored) : 60;
  });
  
  // Temporary filter states (before submit)
  const [tempSelectedWeek, setTempSelectedWeek] = useState('');
  const [tempSelectedCommunities, setTempSelectedCommunities] = useState(new Set());
  const [tempBoxThreshold, setTempBoxThreshold] = useState(boxThreshold);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (communityDropdownRef.current && !communityDropdownRef.current.contains(e.target)) {
        setShowCommunityDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!currentUser || !ADMIN_UIDS.includes(currentUser.uid)) {
      setError("אין לך הרשאות לצפות בדף זה");
      setLoading(false);
      return;
    }
    fetchAvailableWeeks();
  }, [currentUser]);
  
  useEffect(() => {
    if (selectedWeek) {
      fetchDeliveryData();
    }
  }, [selectedWeek, selectedCommunities, boxThreshold]);
  
  // Save boxThreshold to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('delivery_box_threshold_v3', boxThreshold.toString());
  }, [boxThreshold]);

  // Sync completed items with Firestore (Real-time & Offline)
  useEffect(() => {
    if (!selectedWeek) return;
    const syncDocRef = doc(db, 'deliverySync', selectedWeek);
    
    const unsubscribe = onSnapshot(syncDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.completedItems) {
          setCompletedItems(new Set(data.completedItems));
        }
      } else {
        // Initialize if not exists
        setCompletedItems(new Set());
      }
    });
    
    return () => unsubscribe();
  }, [selectedWeek]);

  const updateFirestoreCompleted = async (newSet) => {
    if (!selectedWeek) return;
    const syncDocRef = doc(db, 'deliverySync', selectedWeek);
    const itemsArray = Array.from(newSet);
    try {
      await setDoc(syncDocRef, { completedItems: itemsArray }, { merge: true });
    } catch (e) {
      console.error("Failed to sync completion status", e);
    }
  };

  /* Removed LocalStorage Sync logic */
  
  const fetchAvailableWeeks = async () => {
    setLoading(true);
    try {
      // Fetch all orders and group by week
      const ordersRef = collection(db, 'Orders');
      const ordersSnapshot = await getDocs(ordersRef);
      
      const weeksSet = new Set();
      
      ordersSnapshot.docs.forEach(doc => {
        const orderData = doc.data();
        const endingTime = orderData.Ending_Time || orderData.endingTime;
        
        if (endingTime) {
          let endDate;
          if (endingTime.toDate) {
            endDate = endingTime.toDate();
          } else {
            endDate = new Date(endingTime);
          }
          
          // Get the Sunday of that week
          const sunday = new Date(endDate);
          sunday.setDate(endDate.getDate() - endDate.getDay());
          sunday.setHours(0, 0, 0, 0);
          
          const weekKey = sunday.toISOString().split('T')[0];
          weeksSet.add(weekKey);
        }
      });
      
      // Sort weeks (newest first)
      const sortedWeeks = Array.from(weeksSet).sort((a, b) => new Date(b) - new Date(a));
      setAvailableWeeks(sortedWeeks);
      
      // Auto-select most recent week for temp state
      if (sortedWeeks.length > 0) {
        setTempSelectedWeek(sortedWeeks[0]);
      }
    } catch (err) {
      console.error("Error fetching available weeks:", err);
      setError("Failed to load weeks data");
    } finally {
      setLoading(false);
    }
  };

  const fetchDeliveryData = async () => {
    setLoading(true);
    try {
      // Parse selected week to get date range (Sunday to Friday)
      const sunday = new Date(selectedWeek);
      const friday = new Date(sunday);
      friday.setDate(sunday.getDate() + 5);
      friday.setHours(23, 59, 59, 999);

      setDateRange({
        start: sunday.toLocaleDateString('he-IL'),
        end: friday.toLocaleDateString('he-IL')
      });

      const startDateISO = sunday.toISOString();
      const endDateISO = friday.toISOString();

      // Fetch Orders to identify only customerOrderIds relevant for this week
      const ordersCollectionRef = collection(db, 'Orders');
      const ordersSnapshot = await getDocs(ordersCollectionRef);
      const customerOrderIds = new Set();

      ordersSnapshot.forEach(docSnap => {
        const orderData = docSnap.data();
        const endingTime = orderData.Ending_Time || orderData.endingTime;
        if (!endingTime) return;
        let endDate;
        if (endingTime.toDate) {
          endDate = endingTime.toDate();
        } else {
          endDate = new Date(endingTime);
        }
        if (endDate >= sunday && endDate <= friday) {
          (orderData.customerOrderIds || []).forEach(id => customerOrderIds.add(id));
        }
      });

      let customerOrderDocs = [];
      if (customerOrderIds.size > 0) {
        const customerOrderFetches = Array.from(customerOrderIds).map(orderId => getDoc(doc(db, 'customerOrders', orderId)));
        const snapshots = await Promise.all(customerOrderFetches);
        customerOrderDocs = snapshots.filter(snap => snap.exists());
      } else {
        console.warn('No customerOrderIds found for selected week. Falling back to full customerOrders fetch (slower).');
        const fallbackSnapshot = await getDocs(collection(db, 'customerOrders'));
        customerOrderDocs = fallbackSnapshot.docs;
      }

      const productIds = new Set();
      const validOrders = [];
      const uniqueUserIds = new Set();

      customerOrderDocs.forEach(docSnap => {
        const order = docSnap.data();
        if (!order || order.paymentStatus !== 'completed') return;
        
        const createdAt = order.createdAt;
        let createdDate;
        if (typeof createdAt === 'string') {
          createdDate = new Date(createdAt);
        } else if (createdAt && createdAt.toDate) {
          createdDate = createdAt.toDate();
        } else {
          createdDate = null;
        }
        
        if (!createdDate) return;
        const createdDateISO = createdDate.toISOString();
        if (createdDateISO < startDateISO || createdDateISO > endDateISO) return;
        
        const pickupSpot = order.customerDetails?.pickupSpot || 'לא צוין';
        if (selectedCommunities.size > 0 && !selectedCommunities.has(pickupSpot)) return;
        
        validOrders.push(order);
        if (order.userId) {
          uniqueUserIds.add(order.userId);
        }

        if (order.orderBreakdown) {
          Object.values(order.orderBreakdown).forEach(businessOrder => {
            (businessOrder.items || []).forEach(item => {
              if (item.productId) {
                productIds.add(item.productId);
              }
            });
          });
        }
      });

      const productDetailsMap = {};
      const productFetches = Array.from(productIds).map(async (productId) => {
        try {
          const productRef = doc(db, 'Products', productId);
          const productSnap = await getDoc(productRef);
          if (productSnap.exists()) {
            const productData = productSnap.data();
            productDetailsMap[productId] = {
              images: productData.images || [],
              thaiName: productData.thaiName || '',
              name: productData.name || ''
            };
          }
        } catch (err) {
          console.error(`Error fetching product ${productId}:`, err);
        }
      });
      await Promise.all(productFetches);
      setProductDetails(productDetailsMap);

      if (validOrders.length === 0) {
        setPickupSpotItems({});
        setCratesByPickupSpot({});
        setCratesContentByPickupSpot({});
        setCustomersByPickupSpot({});
        setCustomerDemands({});
        return;
      }

      // Compute totals per pickup spot per customer
      const totalsBySpotCustomer = {};
      validOrders.forEach(order => {
        const pickupSpot = order.customerDetails?.pickupSpot || 'לא צוין';
        const rawCustomerName = order.customerDetails?.name || 'לקוח לא ידוע';
        const normalizedCustomerName = rawCustomerName.trim();
        if (!totalsBySpotCustomer[pickupSpot]) totalsBySpotCustomer[pickupSpot] = {};
        if (!totalsBySpotCustomer[pickupSpot][normalizedCustomerName]) {
          totalsBySpotCustomer[pickupSpot][normalizedCustomerName] = {
            displayName: rawCustomerName,
            totalQty: 0,
            totalPrice: 0,
            userId: order.userId || null,
            contactId: order.customerDetails?.phone || order.customerDetails?.email || null
          };
        }
        if (order.orderBreakdown) {
          Object.values(order.orderBreakdown).forEach(businessOrder => {
            (businessOrder.items || []).forEach(item => {
              const qty = Number(item.quantity) || 0;
              const price = Number(item.price) || 0;
              totalsBySpotCustomer[pickupSpot][normalizedCustomerName].totalQty += qty;
              totalsBySpotCustomer[pickupSpot][normalizedCustomerName].totalPrice += price * qty;
            });
          });
        }
      });

      // Eligibility: totalPrice >= boxThreshold
      const eligibleCustomersBySpot = {};
      const cratesMap = {};
      Object.entries(totalsBySpotCustomer).forEach(([spot, byCustomer]) => {
        eligibleCustomersBySpot[spot] = new Set();
        cratesMap[spot] = [];
        Object.entries(byCustomer).forEach(([normalizedName, totals]) => {
          if (totals.totalPrice >= boxThreshold) {
            eligibleCustomersBySpot[spot].add(normalizedName);
            cratesMap[spot].push({ name: totals.displayName, totalQty: totals.totalQty, totalPrice: totals.totalPrice });
          }
        });
      });

      // Aggregate items by pickup spot
      const spotMap = {};
      const cratesContentMap = {};
      validOrders.forEach(order => {
        const pickupSpot = order.customerDetails?.pickupSpot || 'לא צוין';
        const rawCustomerName = order.customerDetails?.name || 'לקוח לא ידוע';
        const normalizedCustomerName = rawCustomerName.trim();
        if (!spotMap[pickupSpot]) spotMap[pickupSpot] = {};
        const isEligible = eligibleCustomersBySpot[pickupSpot]?.has(normalizedCustomerName);
        if (order.orderBreakdown) {
          Object.values(order.orderBreakdown).forEach(businessOrder => {
            (businessOrder.items || []).forEach(item => {
              const key = `${item.productId}_${item.selectedOption || ''}`;
              if (isEligible) {
                if (!cratesContentMap[pickupSpot]) cratesContentMap[pickupSpot] = {};
                if (!cratesContentMap[pickupSpot][normalizedCustomerName]) {
                  cratesContentMap[pickupSpot][normalizedCustomerName] = {
                    displayName: rawCustomerName,
                    customerId: order.customerDetails?.phone || order.customerDetails?.email,
                    userId: order.userId || null,
                    itemsMap: {}
                  };
                }
                if (!cratesContentMap[pickupSpot][normalizedCustomerName].itemsMap[key]) {
                  const productInfo = productDetailsMap[item.productId] || {};
                  cratesContentMap[pickupSpot][normalizedCustomerName].itemsMap[key] = {
                    productName: item.productName,
                    thaiName: productInfo.thaiName || item.productName,
                    images: productInfo.images || [],
                    selectedOption: item.selectedOption,
                    quantity: 0,
                    businessName: businessOrder.businessName || 'לא צוין',
                    productId: item.productId
                  };
                }
                cratesContentMap[pickupSpot][normalizedCustomerName].itemsMap[key].quantity += Number(item.quantity) || 0;
                return;
              }
              // not eligible: goes to general list
              if (!spotMap[pickupSpot][key]) {
                const productInfo = productDetailsMap[item.productId] || {};
                spotMap[pickupSpot][key] = {
                  productName: item.productName,
                  thaiName: productInfo.thaiName || item.productName,
                  images: productInfo.images || [],
                  selectedOption: item.selectedOption,
                  quantity: 0,
                  businessName: businessOrder.businessName || 'לא צוין',
                  productId: item.productId
                };
              }
              spotMap[pickupSpot][key].quantity += Number(item.quantity) || 0;
            });
          });
        }
      });

      // Convert crates content to arrays
      const cratesContentObj = {};
      Object.entries(cratesContentMap).forEach(([spot, byCustomer]) => {
        cratesContentObj[spot] = Object.values(byCustomer).map(c => ({
          name: c.displayName,
          customerId: c.customerId,
          userId: c.userId || null,
          items: Object.values(c.itemsMap)
        }));
      });

      const customersBySpot = {};
      Object.entries(totalsBySpotCustomer).forEach(([spot, byCustomer]) => {
        customersBySpot[spot] = Object.values(byCustomer).map((customer) => ({
          name: customer.displayName,
          userId: customer.userId || null,
          contactId: customer.contactId || null
        }));
      });

      // Collect customers for permanent numbering
      const uniqueCustomers = [];
      const seenCustomers = new Set();
      validOrders.forEach(o => {
        const details = o.customerDetails || {};
        const id = details.phone || details.email; // Use phone preferred
        const name = details.name || 'Unknown';
        if (id && !seenCustomers.has(id)) {
          seenCustomers.add(id);
          uniqueCustomers.push({ id, name });
        }
      });

      // Fetch permanent numbers
      const [permMap, demandsMap] = await Promise.all([
        fetchPermanentCustomerNumbers(uniqueCustomers),
        fetchCustomDemandsForUsers(Array.from(uniqueUserIds))
      ]);
      setPermanentNumbersMap(permMap);
      setCustomerDemands(demandsMap);

      setPickupSpotItems(spotMap);
      setCratesByPickupSpot(cratesMap);
      setCratesContentByPickupSpot(cratesContentObj);
      setCustomersByPickupSpot(customersBySpot);
    } catch (err) {
      setError("אירעה שגיאה בטעינת נתוני המשלוחים");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Initialize/update numbering using permanent numbers (GLOBAL across all spots)
  useEffect(() => {
    if (!selectedWeek) return;
    if (!cratesContentByPickupSpot || Object.keys(cratesContentByPickupSpot).length === 0) {
      setCustomerNumbersGlobal({});
      return;
    }

    const mapping = {};
    Object.entries(cratesContentByPickupSpot).forEach(([spot, crates]) => {
      const nameCounts = {};
      (crates || []).forEach(c => {
        const name = (c?.name || '').trim();
        if (!name) return;
        nameCounts[name] = (nameCounts[name] || 0) + 1;
        const crateKey = `${spot}::${name}#${nameCounts[name]}`;
        
        // Assign permanent number if available
        if (c.customerId && permanentNumbersMap[c.customerId]) {
          mapping[crateKey] = permanentNumbersMap[c.customerId];
        } else {
          mapping[crateKey] = '-'; // Pending or missing
        }
      });
    });

    setCustomerNumbersGlobal(mapping);
  }, [cratesContentByPickupSpot, selectedWeek, permanentNumbersMap]);

  // Initialize/Sync Community Order
  useEffect(() => {
    const currentSpots = Object.keys(pickupSpotItems);
    if (currentSpots.length > 0) {
      setCommunityOrder(prev => {
        const prevSet = new Set(prev);
        const newSpots = currentSpots.filter(s => !prevSet.has(s));
        // Keep existing order, remove deleted spots, append new ones
        const nextOrder = [...prev.filter(s => currentSpots.includes(s)), ...newSpots];
        // If strictly equal, return prev to avoid render loop (though React handles this)
        if (nextOrder.length === prev.length && nextOrder.every((v, i) => v === prev[i])) return prev;
        return nextOrder;
      });
    }
  }, [pickupSpotItems]);

  const toggleCommunity = (community) => {
    setTempSelectedCommunities(prev => {
      const newSet = new Set(prev);
      if (newSet.has(community)) {
        newSet.delete(community);
      } else {
        newSet.add(community);
      }
      return newSet;
    });
  };
  
  const selectAllCommunities = () => {
    setTempSelectedCommunities(new Set(pickupSpots));
  };
  
  const clearAllCommunities = () => {
    setTempSelectedCommunities(new Set());
  };
  
  const handleSubmitFilters = () => {
    setSelectedWeek(tempSelectedWeek);
    setSelectedCommunities(tempSelectedCommunities);
    setBoxThreshold(tempBoxThreshold);
  };

  const toggleItemComplete = (pickupSpot, itemType, itemKey, customerName = null) => {
    // Create unique identifier for the item
    const uniqueId = customerName 
      ? `${pickupSpot}_crate_${customerName}_${itemKey}`
      : `${pickupSpot}_general_${itemKey}`;
    
    if (completedItems.has(uniqueId)) {
      // Item is already completed, show modal to confirm unmark
      setPendingUnmark(uniqueId);
      setShowUnmarkModal(true);
    } else {
      // Mark as completed
      const newCompleted = new Set(completedItems);
      newCompleted.add(uniqueId);
      // Optimistic update handled by Firestore listener, but we pass the new set to write
      updateFirestoreCompleted(newCompleted);
    }
  };

  const confirmUnmark = () => {
    if (pendingUnmark) {
      const newCompleted = new Set(completedItems);
      newCompleted.delete(pendingUnmark);
      updateFirestoreCompleted(newCompleted);
    }
    setShowUnmarkModal(false);
    setPendingUnmark(null);
  };

  const cancelUnmark = () => {
    setShowUnmarkModal(false);
    setPendingUnmark(null);
  };

  const isItemCompleted = (pickupSpot, itemType, itemKey, customerName = null) => {
    const uniqueId = customerName 
      ? `${pickupSpot}_crate_${customerName}_${itemKey}`
      : `${pickupSpot}_general_${itemKey}`;
    return completedItems.has(uniqueId);
  };

  const getCompletionStats = (pickupSpot, customerName = null) => {
    if (customerName) {
      // Stats for a specific crate
      const crate = cratesContentByPickupSpot[pickupSpot]?.find(c => c.name === customerName);
      if (!crate) return { completed: 0, total: 0 };
      
      const items = crate.items || [];
      const completed = items.filter(it => {
        const key = `${it.productId}_${it.selectedOption || ''}`;
        return isItemCompleted(pickupSpot, 'crate', key, customerName);
      }).length;
      
      return { completed, total: items.length };
    } else {
      // Stats for general items
      const items = Object.keys(pickupSpotItems[pickupSpot] || {});
      const completed = items.filter(key => 
        isItemCompleted(pickupSpot, 'general', key)
      ).length;
      
      return { completed, total: items.length };
    }
  };

  // Build global family summary (Thai-based with Hebrew fallback)
  const getFamilyMatchThai = (thaiName, hebrewName) => {
    const thai = (thaiName || '').trim();
    const heb = (hebrewName || '').trim();
    
    // Thai patterns (first word or prefix)
    if (thai) {
      const tokens = thai.split(/\s+/);
      const head = tokens[0] || thai;
      const variant = tokens.slice(1).join(' ').trim();
      return { 
        key: head, 
        labelThai: head, 
        labelHebrew: heb, 
        variantThai: variant || thai,
        variantHebrew: heb
      };
    }
    
    // Fallback to Hebrew patterns if no Thai name
    const patterns = [
      { key: 'apple', labelThai: 'แอปเปิ้ล', labelHebrew: 'תפוחים', regex: /^(תפוח(?:\s+עץ)?)/ },
      { key: 'tomato', labelThai: 'มะเขือเทศ', labelHebrew: 'עגבניות', regex: /^עגבנ(?:יה|יות)/ },
      { key: 'pepper', labelThai: 'พริก', labelHebrew: 'פלפל', regex: /^פלפל/ },
      { key: 'potato', labelThai: 'มันฝรั่ง', labelHebrew: 'תפוחי אדמה', regex: /^תפוח(?:י)?\s+אדמה/ },
      { key: 'cucumber', labelThai: 'แตงกวา', labelHebrew: 'מלפפונים', regex: /^מלפפון/ },
      { key: 'onion', labelThai: 'หัวหอม', labelHebrew: 'בצלים', regex: /^בצל/ },
      { key: 'cabbage', labelThai: 'กะหล่ำ', labelHebrew: 'כרוב', regex: /^כרוב/ },
      { key: 'grape', labelThai: 'องุ่น', labelHebrew: 'ענבים', regex: /^ענב/ },
      { key: 'mushroom', labelThai: 'เห็ด', labelHebrew: 'פטריות', regex: /^פטריות?/ },
    ];
    for (const p of patterns) {
      const m = heb.match(p.regex);
      if (m) {
        const familyText = m[0];
        const variant = heb.replace(familyText, '').trim().replace(/^[-–—,:]/, '').trim();
        return { 
          key: p.key, 
          labelThai: p.labelThai, 
          labelHebrew: p.labelHebrew, 
          variantThai: p.labelThai,
          variantHebrew: variant || heb 
        };
      }
    }
    return null;
  };

  const buildGlobalFamilySummary = () => {
    const families = {};
    const addName = (thaiName, hebrewName) => {
      const match = getFamilyMatchThai(thaiName, hebrewName);
      if (!match) return;
      if (!families[match.key]) {
        families[match.key] = { 
          labelThai: match.labelThai, 
          labelHebrew: match.labelHebrew,
          variantsThai: new Set(),
          variantsHebrew: new Set()
        };
      }
      families[match.key].variantsThai.add(match.variantThai);
      families[match.key].variantsHebrew.add(match.variantHebrew);
    };

    // Collect from all pickup spots
    Object.entries(pickupSpotItems).forEach(([spot, items]) => {
      Object.values(items).forEach(it => addName(it.thaiName, it.productName));
    });
    Object.entries(cratesContentByPickupSpot).forEach(([spot, crates]) => {
      crates.forEach(c => (c.items || []).forEach(it => addName(it.thaiName, it.productName)));
    });

    // Return only families with more than one variant
    return Object.values(families)
      .map(f => ({ 
        labelThai: f.labelThai,
        labelHebrew: f.labelHebrew,
        count: Math.max(f.variantsThai.size, f.variantsHebrew.size),
        variantsThai: Array.from(f.variantsThai).slice(0, 4),
        variantsHebrew: Array.from(f.variantsHebrew).slice(0, 4)
      }))
      .filter(f => f.count > 1);
  };

  const generatePickupSpotPDF = async (pickupSpot) => {
    try {
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', putOnlyUsedFonts: true });

      const crates = cratesContentByPickupSpot[pickupSpot] || [];
      const items = Object.values(pickupSpotItems[pickupSpot] || {});

      const renderToPdf = async (pageElement, addNewPage) => {
        document.body.appendChild(pageElement);
        const canvas = await html2canvas(pageElement, { scale: 1.5, useCORS: true, logging: false, windowWidth: 595 });
        if (addNewPage) pdf.addPage();
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const imgWidth = 210;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
        document.body.removeChild(pageElement);
      };

      const CRATES_PER_PAGE = 1;
      const ITEM_ROWS_PER_PAGE = 20;

      const crateChunks = [];
      for (let i = 0; i < crates.length; i += CRATES_PER_PAGE) {
        crateChunks.push(crates.slice(i, i + CRATES_PER_PAGE));
      }

      const itemChunks = [];
      for (let i = 0; i < items.length; i += ITEM_ROWS_PER_PAGE) {
        itemChunks.push(items.slice(i, i + ITEM_ROWS_PER_PAGE));
      }

      let pageIndex = 0;
      const nameCountsForPdf = {};

      // Render crate pages
      for (let ci = 0; ci < Math.max(1, crateChunks.length); ci++) {
        const chunk = crateChunks[ci] || [];
        const el = document.createElement('div');
        el.style.width = '595px';
        el.style.fontFamily = 'Arial, sans-serif';
        el.style.direction = 'rtl';
        el.style.textAlign = 'right';
        el.style.padding = '16px 20px 24px 20px';
        el.style.boxSizing = 'border-box';
        let html = `
          <div style="text-align:center; margin-bottom:6px;">
            <h1 style="font-size:16px; color:#111827; margin:0;">นקודת איסוף: ${pickupSpot}</h1>
            <p style="font-size:11px; margin:2px 0 0 0; color:#6B7280;">ארגזים להכנה (${crates.length})</p>
          </div>
        `;
        if (chunk.length === 0) {
          html += `<div style="font-size:12px; color:#6B7280;">אין צורך בארגזים לנקודה זו.</div>`;
        } else {
          chunk.forEach((crate) => {
            const trimmed = (crate.name || '').trim();
            nameCountsForPdf[trimmed] = (nameCountsForPdf[trimmed] || 0) + 1;
            const crateKey = `${pickupSpot}::${trimmed}#${nameCountsForPdf[trimmed]}`;
            const crateNumber = customerNumbersGlobal[crateKey] || null;
            const namePrefix = crateNumber ? ('#' + crateNumber + ' — ') : '';
            html += `
              <div style="margin-top:10px;">
                <div style="font-weight:bold; font-size:14px; margin-bottom:4px;">${namePrefix}${crate.name}</div>
                <table style="width:100%; border-collapse:collapse; border:1px solid #E5E7EB;">
                  <tbody>
            `;
            const items = crate.items || [];
            for (let i = 0; i < items.length; i += 2) {
              const item1 = items[i];
              const item2 = items[i + 1];
              const formatItem = (it) => {
                if (!it) return '';
                const option = it.selectedOption && it.selectedOption !== 'ללא' ? ` (${it.selectedOption})` : '';
                return `${it.productName}${option} - ${it.quantity}`;
              };
              html += `
                <tr style="border-bottom:1px solid #E5E7EB;">
                  <td style="padding:6px 8px; font-size:12px; width:50%; border-left:1px solid #E5E7EB;">${formatItem(item1)}</td>
                  <td style="padding:6px 8px; font-size:12px; width:50%;">${formatItem(item2)}</td>
                </tr>
              `;
            }
            html += `</tbody></table></div>`;
          });
        }
        el.innerHTML = html;
        await renderToPdf(el, pageIndex++ > 0);
      }

      // Render items pages
      for (let ii = 0; ii < Math.max(1, itemChunks.length); ii++) {
        const chunk = itemChunks[ii] || [];
        const el = document.createElement('div');
        el.style.width = '595px';
        el.style.fontFamily = 'Arial, sans-serif';
        el.style.direction = 'rtl';
        el.style.textAlign = 'right';
        el.style.padding = '16px 20px 24px 20px';
        el.style.boxSizing = 'border-box';
        let html = `
          <div style="text-align:center; margin-bottom:6px;">
            <h1 style="font-size:16px; color:#111827; margin:0;">נקודת איסוף: ${pickupSpot}</h1>
            <p style="font-size:11px; margin:2px 0 0 0; color:#6B7280;">รายการทั่วไป (ไม่มีกล่อง) — ${items.length}</p>
          </div>
          <table style="width:100%; border-collapse:collapse; border:1px solid #E5E7EB;">
            <tbody>
        `;
        for (let i = 0; i < chunk.length; i += 2) {
          const item1 = chunk[i];
          const item2 = chunk[i + 1];
          const formatItem = (it) => {
            if (!it) return '';
            const option = it.selectedOption && it.selectedOption !== 'ללא' ? ` (${it.selectedOption})` : '';
            return `${it.productName}${option} - ${it.quantity}`;
          };
          html += `
            <tr style="border-bottom:1px solid #E5E7EB;">
              <td style="padding:6px 8px; font-size:12px; width:50%; border-left:1px solid #E5E7EB;">${formatItem(item1)}</td>
              <td style="padding:6px 8px; font-size:12px; width:50%;">${formatItem(item2)}</td>
            </tr>
          `;
        }
        html += `</tbody></table>`;
        el.innerHTML = html;
        await renderToPdf(el, pageIndex++ > 0);
      }

      pdf.save(`משלוחים_V2_${pickupSpot.replace(/\s+/g, '_')}.pdf`);
    } catch (e) {
      console.error('Error generating delivery PDF', e);
      alert('שגיאה ביצוא ה-PDF');
    }
  };

  if (loading) return <LoadingSpinner />;
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <p className="font-bold">שגיאה</p>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <style>{modalStyles}</style>
      <h1 className="text-3xl font-bold text-center mb-8">การจัดการการจัดส่ง (เวอร์ชัน 3 - สำหรับคนงานไทย)</h1>
      
      {/* Unmark Confirmation Modal */}
      {showUnmarkModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-60"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              cancelUnmark();
            }
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-scale">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-yellow-400 to-orange-500 p-6 text-center">
              <div className="mx-auto w-20 h-20 bg-white rounded-full flex items-center justify-center mb-4 shadow-lg">
                <svg className="w-12 h-12 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white">คำเตือน!</h2>
            </div>
            
            {/* Modal Body */}
            <div className="p-8 text-center">
              <p className="text-xl font-semibold text-gray-800 mb-2">
                ต้องการยกเลิกเครื่องหมายใช่หรือไม่?
              </p>
              <p className="text-base text-gray-600 mb-6">
                รายการนี้จะกลับเป็นสถานะยังไม่เสร็จ
              </p>
              
              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={cancelUnmark}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-4 px-6 rounded-xl transition-all transform hover:scale-105 text-lg"
                >
                  ยกเลิก
                  <div className="text-sm font-normal text-gray-600">Cancel</div>
                </button>
                <button
                  onClick={confirmUnmark}
                  className="flex-1 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-bold py-4 px-6 rounded-xl transition-all transform hover:scale-105 shadow-lg text-lg"
                >
                  ยืนยัน
                  <div className="text-sm font-normal">Confirm</div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quantity Warning Modal */}
      {showQuantityWarning && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-60"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowQuantityWarning(null);
            }
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-scale">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-red-400 to-red-500 p-6 text-center">
              <div className="mx-auto w-20 h-20 bg-white rounded-full flex items-center justify-center mb-4 shadow-lg">
                <svg className="w-12 h-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white">ระวัง! จำนวนมาก</h2>
            </div>
            
            {/* Modal Body */}
            <div className="p-8 text-center">
              <p className="text-xl font-semibold text-gray-800 mb-2">
                {showQuantityWarning?.productName}
              </p>
              <p className="text-3xl font-bold text-red-600 mb-4">
                จำนวน: {showQuantityWarning?.quantity}
              </p>
              <p className="text-base text-gray-600 mb-6">
                โปรดตรวจสอบให้แน่ใจว่าคุณนับถูกต้อง
              </p>
              
              {/* Action Button */}
              <button
                onClick={() => {
                  // Mark as complete after acknowledging the warning
                  if (showQuantityWarning?.pickupSpot && showQuantityWarning?.itemKey) {
                    toggleItemComplete(
                      showQuantityWarning.pickupSpot, 
                      showQuantityWarning.itemType, 
                      showQuantityWarning.itemKey, 
                      showQuantityWarning.customerName
                    );
                  }
                  setShowQuantityWarning(null);
                }}
                className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold py-4 px-6 rounded-xl transition-all transform hover:scale-105 shadow-lg text-lg"
              >
                เข้าใจแล้ว ✓
                <div className="text-sm font-normal">Got it & Mark Complete</div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Week and Community Selection */}
      <div className="mb-6 bg-white p-6 rounded-lg shadow" dir="rtl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Week Selection */}
          <div>
            <label className="block text-gray-700 text-sm font-medium mb-2">เลือกสัปดาห์:</label>
            <select
              value={tempSelectedWeek}
              onChange={(e) => setTempSelectedWeek(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {availableWeeks.map(week => {
                const sunday = new Date(week);
                const friday = new Date(sunday);
                friday.setDate(sunday.getDate() + 5);
                return (
                  <option key={week} value={week}>
                    {format(sunday, 'dd/MM/yyyy')} - {format(friday, 'dd/MM/yyyy')}
                  </option>
                );
              })}
            </select>
          </div>
          
          {/* Community Selection */}
          <div ref={communityDropdownRef}>
            <label className="block text-gray-700 text-sm font-medium mb-2">เลือกชุมชน:</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowCommunityDropdown(o => !o)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-right focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {tempSelectedCommunities.size === 0 ? 'ทุกชุมชน' : `เลือก ${tempSelectedCommunities.size} ชุมชน`}
              </button>
              {showCommunityDropdown && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg p-2 max-h-80 overflow-auto">
                  <div className="flex gap-2 mb-2 pb-2 border-b">
                    <button onClick={selectAllCommunities} className="text-xs px-2 py-1 bg-blue-500 text-white rounded">เลือกทั้งหมด</button>
                    <button onClick={clearAllCommunities} className="text-xs px-2 py-1 bg-gray-300 text-gray-700 rounded">ล้าง</button>
                  </div>
                  {pickupSpots.map(spot => (
                    <div key={spot} className="flex items-center px-2 py-1 hover:bg-gray-50 rounded">
                      <input
                        type="checkbox"
                        id={`delivery-community-${spot}`}
                        checked={tempSelectedCommunities.has(spot)}
                        onChange={() => toggleCommunity(spot)}
                        className="ml-2"
                      />
                      <label htmlFor={`delivery-community-${spot}`} className="text-sm cursor-pointer flex-1">{spot}</label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {/* Box Threshold Selection */}
          <div>
            <label className="block text-gray-700 text-sm font-medium mb-2">סף ארגז (₪):</label>
            <input
              type="number"
              value={tempBoxThreshold}
              onChange={(e) => setTempBoxThreshold(Number(e.target.value) || 5)}
              min="0"
              step="10"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="60"
            />
            <p className="text-xs text-gray-500 mt-1">לקוחות מעל סכום זה יקבלו ארגז</p>
          </div>
        </div>
        
        {/* Submit Button */}
        <div className="mt-6 text-center flex justify-center gap-4">
          <button
            onClick={handleSubmitFilters}
            className="px-8 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold rounded-lg transition-all transform hover:scale-105 shadow-lg"
          >
            โหลดข้อมูล (Load Data)
          </button>
          <button
            onClick={() => setIsReordering(true)}
            className="px-4 py-3 bg-gray-600 hover:bg-gray-700 text-white font-bold rounded-lg transition-all shadow-lg"
          >
            סידור קהילות (Reorder)
          </button>
        </div>
        
        {selectedWeek && (
          <p className="text-center text-gray-600 mt-4">
            แสดงคำสั่งซื้อตั้งแต่ <span className="font-semibold">{dateRange.start}</span> ถึง <span className="font-semibold">{dateRange.end}</span>
            {selectedCommunities.size > 0 && ` สำหรับ ${selectedCommunities.size} ชุมชน`}
            {' — '}סף ארגז: ₪{boxThreshold}
          </p>
        )}
      </div>

      {/* Global Family Summary - Thai-based with collapsible Hebrew */}
      {Object.keys(pickupSpotItems).length > 0 && (() => {
        const fam = buildGlobalFamilySummary();
        if (!fam || fam.length === 0) return null;
        return (
          <div className="mb-6 bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-400 rounded-lg p-4 shadow-md">
            <div className="flex items-center justify-between mb-2">
              <div className="font-bold text-lg text-yellow-900">⚠️ หมายเหตุสำคัญ: วันนี้มีหลายชนิดที่ชื่อคล้ายกัน</div>
              <button
                onClick={() => setShowHebrewSummary(s => !s)}
                className="text-xs px-3 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700 transition-colors"
              >
                {showHebrewSummary ? 'ซ่อนภาษาฮีบรู' : 'แสดงภาษาฮีบรู'}
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
              {fam.map((f, i) => (
                <div key={i} className="bg-white p-2 rounded border border-yellow-300">
                  <div className="font-semibold text-yellow-900">{f.labelThai}</div>
                  <div className="text-xs text-yellow-700">{f.count} ชนิด</div>
                  {showHebrewSummary && (
                    <div className="mt-1 pt-1 border-t border-yellow-200 text-xs text-gray-600" dir="rtl">
                      {f.labelHebrew} — {f.variantsHebrew.join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })()}
      
      {Object.keys(pickupSpotItems).length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 p-4 rounded text-center">
          ไม่พบสินค้าสำหรับการจัดส่งในสัปดาห์และชุมชนที่เลือก
        </div>
      ) : (
        communityOrder.map(pickupSpot => {
          const items = pickupSpotItems[pickupSpot];
          if (!items) return null;
          const crateEntries = cratesContentByPickupSpot[pickupSpot] || [];
          const crateUserIds = new Set(crateEntries.map((c) => c.userId).filter(Boolean));
          const generalDemandEntries = [];
          const seenDemandUsers = new Set();
          (customersByPickupSpot[pickupSpot] || []).forEach((customer) => {
            if (!customer.userId) return;
            if (crateUserIds.has(customer.userId)) return;
            if (seenDemandUsers.has(customer.userId)) return;
            const demand = customerDemands[customer.userId];
            if (!demand || (!demand.hebrew?.trim() && !demand.thai?.trim())) return;
            seenDemandUsers.add(customer.userId);
            generalDemandEntries.push({
              name: customer.name,
              userId: customer.userId,
              demand
            });
          });
          return (
          <div key={pickupSpot} className="mb-10 bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-semibold text-blue-800">
                จุดรับสินค้า: {pickupSpot}
              </h2>
              <button
                onClick={() => generatePickupSpotPDF(pickupSpot)}
                className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm"
              >
                ดาวน์โหลด PDF
              </button>
            </div>

            {/* Crates section with contents */}
            <div className="mb-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-800">กล่องที่ต้องเตรียม</h3>
                <span className="text-sm text-gray-600">รวม: {cratesByPickupSpot[pickupSpot]?.length || 0}</span>
              </div>
              {(crateEntries && crateEntries.length > 0) ? (
                <div className="mt-2 space-y-4">
                  {crateEntries.map((crate, idx) => {
                    const trimmedName = (crate.name || '').trim();
                    const occ = crateEntries.slice(0, idx).filter(c => (c.name || '').trim() === trimmedName).length + 1;
                    const crateKey = `${pickupSpot}::${trimmedName}#${occ}`;
                    const stats = getCompletionStats(pickupSpot, crate.name);
                    const isComplete = stats.completed === stats.total && stats.total > 0;
                    const demand = crate.userId ? customerDemands[crate.userId] : null;
                    const hasHebrewDemand = demand?.hebrew && demand.hebrew.trim();
                    const hasThaiDemand = demand?.thai && demand.thai.trim();
                    const showDemandBanner = hasHebrewDemand || hasThaiDemand;
                    return (
                      <div 
                        key={idx} 
                        data-status={isComplete ? 'complete' : 'incomplete'}
                        className={`border-2 rounded-lg ${isComplete ? 'border-green-500 bg-green-50' : 'border-blue-300'}`}
                      >
                        <div className={`px-4 py-3 font-bold text-lg flex items-center justify-between ${isComplete ? 'bg-green-200' : 'bg-blue-100'}`}>
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-yellow-500 text-white">
                              {customerNumbersGlobal[crateKey] ?? '-'}
                            </span>
                            <span>{crate.name}</span>
                          </div>
                          <span className="text-sm font-normal">
                            {stats.completed}/{stats.total} ✓
                          </span>
                        </div>
                        {showDemandBanner && (
                          <div className="mx-4 mt-3 mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900" dir="rtl">
                            <p className="font-semibold text-amber-900 mb-1">בקשות מיוחדות:</p>
                            {hasHebrewDemand && (
                              <p className="text-gray-900 mb-1">{demand.hebrew}</p>
                            )}
                            {hasThaiDemand && (
                              <p className="text-gray-700" dir="ltr">{demand.thai}</p>
                            )}
                          </div>
                        )}
                        <div className="p-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {(crate.items || []).map((it, iidx) => {
                              const itemKey = `${it.productId}_${it.selectedOption || ''}`;
                              const isCompleted = isItemCompleted(pickupSpot, 'crate', itemKey, crate.name);
                              return (
                                <div 
                                  key={iidx} 
                                  onClick={() => {
                                    // Only show quantity warning if item is NOT already completed
                                    if (!isCompleted && it.quantity >= 2) {
                                      setShowQuantityWarning({ 
                                        productName: it.thaiName || it.productName, 
                                        quantity: it.quantity,
                                        pickupSpot,
                                        itemType: 'crate',
                                        itemKey,
                                        customerName: crate.name
                                      });
                                    } else {
                                      // Item is completed (unmark) or quantity is 1 (mark directly)
                                      toggleItemComplete(pickupSpot, 'crate', itemKey, crate.name);
                                    }
                                  }}
                                  className={`border rounded-lg p-3 shadow-sm cursor-pointer transition-all hover:shadow-md ${
                                    isCompleted 
                                      ? 'bg-green-100 border-green-400' 
                                      : 'bg-white border-gray-200 hover:border-blue-300'
                                  }`}
                                >
                                  <div className="flex items-center gap-3">
                                    {/* Checkmark indicator */}
                                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                                      isCompleted ? 'bg-green-500' : 'bg-gray-200'
                                    }`}>
                                      {isCompleted ? (
                                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                        </svg>
                                      ) : (
                                        <span className="text-gray-400 text-xs">✓</span>
                                      )}
                                    </div>
                                    {/* Product Image */}
                                    {it.images && it.images.length > 0 && (
                                      <img 
                                        src={it.images[0]} 
                                        alt={it.thaiName || it.productName}
                                        className={`w-20 h-20 object-cover rounded-md flex-shrink-0 ${isCompleted ? 'opacity-60' : ''}`}
                                      />
                                    )}
                                    {/* Product Info */}
                                    <div className="flex-1">
                                      <div className={`font-bold text-base ${isCompleted ? 'text-gray-600 line-through' : 'text-gray-900'}`}>
                                        {it.thaiName || it.productName}
                                      </div>
                                      {it.selectedOption && it.selectedOption !== 'ללא' && (
                                        <div className="text-sm text-gray-600">
                                          ({it.selectedOption})
                                        </div>
                                      )}
                                      <div 
                                        className={`mt-1 text-xl font-bold ${
                                          isCompleted 
                                            ? 'text-green-700' 
                                            : it.quantity >= 2 
                                              ? 'text-red-600 animate-pulse' 
                                              : 'text-blue-600'
                                        }`}
                                      >
                                        จำนวน: {it.quantity}
                                        {it.quantity >= 2 && (
                                          <span className="ml-2 text-base">⚠️</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-2 text-sm text-gray-500">ไม่ต้องเตรียมกล่องสำหรับจุดนี้</p>
              )}
            </div>

            {generalDemandEntries.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-amber-900">בקשות מיוחדות ללקוחות ללא ארגז</h3>
                  <span className="text-xs text-amber-600">{generalDemandEntries.length}</span>
                </div>
                <div className="mt-2 space-y-2">
                  {generalDemandEntries.map((entry) => (
                    <div
                      key={`${pickupSpot}-${entry.userId}`}
                      className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm"
                    >
                      <div className="font-semibold text-amber-900">{entry.name}</div>
                      {entry.demand?.hebrew && (
                        <p className="text-gray-900 mt-1" dir="rtl">{entry.demand.hebrew}</p>
                      )}
                      {entry.demand?.thai && (
                        <p className="text-gray-700 mt-1" dir="ltr">{entry.demand.thai}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* General Items */}
            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-800">รายการทั่วไป (ไม่มีกล่อง)</h3>
                {(() => {
                  const stats = getCompletionStats(pickupSpot);
                  return (
                    <span className="text-sm text-gray-600">
                      {stats.completed}/{stats.total} ✓
                    </span>
                  );
                })()}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(items).map(([key, item], idx) => {
                  const isCompleted = isItemCompleted(pickupSpot, 'general', key);
                  return (
                    <div 
                      key={idx} 
                      onClick={() => {
                        // Only show quantity warning if item is NOT already completed
                        if (!isCompleted && item.quantity >= 2) {
                          setShowQuantityWarning({ 
                            productName: item.thaiName || item.productName, 
                            quantity: item.quantity,
                            pickupSpot,
                            itemType: 'general',
                            itemKey: key,
                            customerName: null
                          });
                        } else {
                          // Item is completed (unmark) or quantity is 1 (mark directly)
                          toggleItemComplete(pickupSpot, 'general', key);
                        }
                      }}
                      className={`border rounded-lg p-3 shadow-sm cursor-pointer transition-all hover:shadow-md ${
                        isCompleted 
                          ? 'bg-green-100 border-green-400' 
                          : 'bg-gray-50 border-gray-200 hover:border-blue-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {/* Checkmark indicator */}
                        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                          isCompleted ? 'bg-green-500' : 'bg-gray-200'
                        }`}>
                          {isCompleted ? (
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <span className="text-gray-400 text-xs">✓</span>
                          )}
                        </div>
                        {/* Product Image */}
                        {item.images && item.images.length > 0 && (
                          <img 
                            src={item.images[0]} 
                            alt={item.thaiName || item.productName}
                            className={`w-20 h-20 object-cover rounded-md flex-shrink-0 ${isCompleted ? 'opacity-60' : ''}`}
                          />
                        )}
                        {/* Product Info */}
                        <div className="flex-1">
                          <div className={`font-bold text-base ${isCompleted ? 'text-gray-600 line-through' : 'text-gray-900'}`}>
                            {item.thaiName || item.productName}
                          </div>
                          {item.selectedOption && item.selectedOption !== 'ללא' && (
                            <div className="text-sm text-gray-600">
                              ({item.selectedOption})
                            </div>
                          )}
                          <div className="text-xs text-gray-500 mt-1">
                            {item.businessName}
                          </div>
                          <div 
                            className={`mt-1 text-xl font-bold ${
                              isCompleted 
                                ? 'text-green-700' 
                                : item.quantity >= 2 
                                  ? 'text-red-600 animate-pulse' 
                                  : 'text-green-600'
                            }`}
                          >
                            จำนวน: {item.quantity}
                            {item.quantity >= 2 && (
                              <span className="ml-2 text-base">⚠️</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          );
        })
      )}
      {/* Reorder Modal */}
      {isReordering && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-60">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-scale p-6">
            <h2 className="text-xl font-bold mb-4 text-right">סידור קהילות</h2>
            <div className="max-h-96 overflow-y-auto space-y-2">
              {communityOrder.map((spot, idx) => (
                <div key={spot} className="flex justify-between items-center p-2 border rounded bg-gray-50">
                  <div className="flex gap-1">
                    <button onClick={() => {
                        const newOrder = [...communityOrder];
                        if (idx < communityOrder.length - 1) {
                          [newOrder[idx], newOrder[idx+1]] = [newOrder[idx+1], newOrder[idx]];
                          setCommunityOrder(newOrder);
                        }
                    }} disabled={idx === communityOrder.length - 1} className="px-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50">↓</button>
                    <button onClick={() => {
                        const newOrder = [...communityOrder];
                        if (idx > 0) {
                          [newOrder[idx], newOrder[idx-1]] = [newOrder[idx-1], newOrder[idx]];
                          setCommunityOrder(newOrder);
                        }
                    }} disabled={idx === 0} className="px-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50">↑</button>
                  </div>
                  <span>{spot}</span>
                </div>
              ))}
            </div>
            <button onClick={() => setIsReordering(false)} className="mt-4 w-full bg-blue-600 text-white py-2 rounded font-bold">סיום</button>
          </div>
        </div>
      )}

      {/* Floating Next Button */}
      <button
        onClick={scrollToNextIncomplete}
        className="fixed bottom-6 right-6 w-14 h-14 bg-yellow-500 hover:bg-yellow-600 text-white rounded-full shadow-2xl flex items-center justify-center z-40 transition-transform transform hover:scale-110 border-4 border-white"
        title="Go to next incomplete"
      >
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </button>
    </div>
  );
};

export default DeliveryManagementV4;



