import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/authContext';
import { collection, query, where, getDocs, doc, deleteDoc, getDoc, orderBy, limit } from 'firebase/firestore';
import { db, storage } from '../../firebase/firebase';
import { ref, deleteObject } from 'firebase/storage';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import './BusinessProducts.css';
import { fetchMeshekDahanItems, getPreviousSnapshot, saveSnapshot, diffItems } from '../../services/meshekDahanService';

// Import Slider and CSS
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";


const BusinessProducts = () => {
  const { currentUser } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProducts, setSelectedProducts] = useState([]); // Track selected products
  const [isIndependent, setIsIndependent] = useState(false);
  const [loadingPreviousOrder, setLoadingPreviousOrder] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [priceRange, setPriceRange] = useState({ min: '', max: '' });
  const [sortOption, setSortOption] = useState('newest');
  const [quickFilter, setQuickFilter] = useState('all');
  const [productSales, setProductSales] = useState({});
  const [checkingSupplier, setCheckingSupplier] = useState(false);
  const [supplierDiff, setSupplierDiff] = useState(null);
  const [supplierCheckedAt, setSupplierCheckedAt] = useState(null);
  const navigate = useNavigate();

  // Helper to determine selectability and status
  const getProductStatus = (p) => {
    const hasVerified = Object.prototype.hasOwnProperty.call(p || {}, 'verified');
    const hasRejected = Object.prototype.hasOwnProperty.call(p || {}, 'rejected');
    // Explicit states first
    if (hasRejected && p.rejected === true) return 'rejected';
    if (hasVerified && p.verified === true) return 'verified';
    // Pending if explicitly false on either field
    if ((hasVerified && p.verified === false) || (hasRejected && p.rejected === false)) return 'pending';
    // Legacy products (no fields): treat as verified/selectable
    return 'verified';
  };
  const isProductSelectable = (p) => getProductStatus(p) === 'verified';

  const toDate = (value) => {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate();
    return new Date(value);
  };

  const handleSelectPreviousOrder = async () => {
    if (!currentUser) return;
    setLoadingPreviousOrder(true);
    try {
      const ordersRef = collection(db, 'Orders');
      const previousOrderQuery = query(
        ordersRef,
        where('businessId', '==', currentUser.uid),
        orderBy('Order_Time', 'desc'),
        limit(1)
      );

      const snapshot = await getDocs(previousOrderQuery);
      if (snapshot.empty) {
        Swal.fire({
          icon: 'info',
          title: 'אין הזמנות קודמות',
          text: 'לא נמצאה הזמנה קודמת לבחירת מוצרים.',
        });
        return;
      }

      const lastOrder = snapshot.docs[0].data();
      const lastOrderDate = toDate(lastOrder?.Order_Time || lastOrder?.createdAt || lastOrder?.updatedAt);
      const previousIds = Array.isArray(lastOrder.selectedProducts) ? [...new Set(lastOrder.selectedProducts)] : [];

      if (previousIds.length === 0) {
        Swal.fire({
          icon: 'info',
          title: 'אין מוצרים להזמנה',
          text: 'ההזמנה הקודמת לא הכילה מוצרים שניתן להעתיק.',
        });
        return;
      }

      const validIds = previousIds.filter((id) => products.some((product) => product.id === id));
      setSelectedProducts(validIds);

      const missingCount = previousIds.length - validIds.length;
      const baseMessage = `${validIds.length} מוצרים נבחרו אוטומטית מההזמנה הקודמת`;
      const missingMessage = missingCount > 0 ? ` (${missingCount} מוצרים כבר לא קיימים בחנות).` : '.';
      const dateMessage = lastOrderDate ? ` תאריך ההזמנה: ${lastOrderDate.toLocaleDateString('he-IL')}` : '';

      Swal.fire({
        icon: 'success',
        title: 'הפריטים שוחזרו',
        text: `${baseMessage}${missingMessage}${dateMessage}`,
        timer: 2500,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error('Error selecting previous order:', error);
      Swal.fire({
        icon: 'error',
        title: 'שגיאה',
        text: 'לא הצלחנו לטעון את ההזמנה הקודמת. נסו שוב מאוחר יותר.',
      });
    } finally {
      setLoadingPreviousOrder(false);
    }
  };

  const buildListHtml = (items = [], title) => {
    if (!items.length) return '';
    const subset = items.slice(0, 6);
    const listItems = subset.map((item) => `<li>${item}</li>`).join('');
    const moreText = items.length > subset.length ? `<li>...ועוד ${items.length - subset.length} פריטים</li>` : '';
    return `<p style="margin:6px 0 2px;font-weight:600;">${title}</p><ul style="margin:4px 0 8px; padding-right:16px;">${listItems}${moreText}</ul>`;
  };

  const handleCheckSupplierInventory = async () => {
    if (!currentUser || isIndependent) return;
    setCheckingSupplier(true);
    try {
      const prev = await getPreviousSnapshot(currentUser.uid);
      const currentItems = await fetchMeshekDahanItems();

      if (!currentItems || currentItems.length === 0) {
        throw new Error('No items returned from supplier site');
      }

      const diffs = diffItems(prev.items || [], currentItems);
      await saveSnapshot(currentUser.uid, currentItems);
      setSupplierDiff(diffs);
      const now = new Date();
      setSupplierCheckedAt(now.toISOString());

      const htmlParts = [
        `<p style="margin:0 0 4px;">סה"כ ${currentItems.length} מוצרים זמינים כעת.</p>`,
        `<p style="margin:0 0 8px;">${diffs.added.length} חדשים ו-${diffs.removed.length} ירדו${prev.checkedAt ? ` מאז ${new Date(prev.checkedAt).toLocaleDateString('he-IL')}` : ''}.</p>`,
        buildListHtml(diffs.added, 'פריטים חדשים'),
        buildListHtml(diffs.removed, 'פריטים שנעלמו'),
        diffs.added.length === 0 && diffs.removed.length === 0
          ? '<p style="margin:6px 0 0;">לא נמצאו שינויים לעומת השבוע שעבר.</p>'
          : '',
      ].join('');

      Swal.fire({
        icon: 'info',
        title: 'בדיקת מלאי משק דהן',
        html: `<div style="text-align:right;direction:rtl;font-size:14px;">${htmlParts}</div>`,
        width: 620,
      });
    } catch (error) {
      console.error('Error checking supplier inventory:', error);
      const permissionDenied =
        error?.code === 'permission-denied' ||
        /Missing or insufficient permissions/i.test(error?.message || '');
      Swal.fire({
        icon: 'error',
        title: 'שגיאה בבדיקת משק דהן',
        text: permissionDenied
          ? 'אין הרשאה לקרוא/לעדכן supplierSnapshots. אנא עדכנו את חוקי Firestore שיאפשרו לבעל העסק לגשת למסמך שלו.'
          : 'לא הצלחנו למשוך את רשימת המוצרים. נסו שוב מאוחר יותר.',
      });
    } finally {
      setCheckingSupplier(false);
    }
  };

  useEffect(() => {
    const fetchSalesStats = async () => {
      if (!currentUser) return;
      try {
        const ordersRef = collection(db, 'Orders');
        const statsQuery = query(
          ordersRef,
          where('businessId', '==', currentUser.uid),
          orderBy('Order_Time', 'desc'),
          limit(25)
        );
        const snapshot = await getDocs(statsQuery);
        const counts = {};
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const selected = Array.isArray(data.selectedProducts) ? data.selectedProducts : [];
          selected.forEach((id) => {
            counts[id] = (counts[id] || 0) + 1;
          });
        });
        setProductSales(counts);
      } catch (error) {
        console.error('Error fetching product sales stats:', error);
      }
    };

    fetchSalesStats();
  }, [currentUser]);

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

  useEffect(() => {
    const fetchIsIndependent = async () => {
      if (!currentUser) return;
      try {
        const businessRef = doc(db, 'businesses', currentUser.uid);
        const snap = await getDoc(businessRef);
        if (snap.exists()) {
          setIsIndependent(Boolean(snap.data().isIndependent));
        }
      } catch (e) {
        console.error('Error fetching isIndependent:', e);
      }
    };
    fetchIsIndependent();
  }, [currentUser]);

  useEffect(() => {
    const loadPreviousSupplierCheck = async () => {
      if (!currentUser || isIndependent) return;
      try {
        const prev = await getPreviousSnapshot(currentUser.uid);
        if (prev.checkedAt) {
          setSupplierCheckedAt(prev.checkedAt);
        }
      } catch (error) {
        console.error('Error loading previous supplier snapshot:', error);
      }
    };

    loadPreviousSupplierCheck();
  }, [currentUser, isIndependent]);

  const categories = useMemo(() => {
    const set = new Set();
    products.forEach((product) => {
      if (product.category && product.category.trim() !== '') {
        set.add(product.category.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'he'));
  }, [products]);

  const getProductSalesCount = (productId) => productSales[productId] || 0;
  const getProductPrice = (product) => Number(product.price) || 0;
  const getProductCreatedAt = (product) => toDate(product.createdAt || product.updatedAt);

  const filteredProducts = useMemo(() => {
    const searchLower = searchTerm.trim().toLowerCase();
    const minPrice = priceRange.min !== '' ? Number(priceRange.min) : null;
    const maxPrice = priceRange.max !== '' ? Number(priceRange.max) : null;
    const now = new Date();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    let list = [...products];

    list = list.filter((product) => {
      const price = getProductPrice(product);
      const status = getProductStatus(product);
      const createdAt = getProductCreatedAt(product);
      const matchesSearch =
        !searchLower ||
        product.name?.toLowerCase().includes(searchLower) ||
        product.description?.toLowerCase().includes(searchLower);
      const matchesCategory =
        selectedCategory === 'all' ||
        (product.category?.trim() || 'other') === selectedCategory;
      const matchesStatus = statusFilter === 'all' || status === statusFilter;
      const matchesStock = !inStockOnly || (product.stockAmount || 0) > 0;
      const matchesMin = minPrice === null || price >= minPrice;
      const matchesMax = maxPrice === null || price <= maxPrice;

      let matchesQuickFilter = true;
      if (quickFilter === 'recent') {
        matchesQuickFilter = createdAt ? createdAt >= fourteenDaysAgo : false;
      } else if (quickFilter === 'top') {
        matchesQuickFilter = getProductSalesCount(product.id) > 0;
      } else if (quickFilter === 'never') {
        matchesQuickFilter = getProductSalesCount(product.id) === 0;
      }

      return (
        matchesSearch &&
        matchesCategory &&
        matchesStatus &&
        matchesStock &&
        matchesMin &&
        matchesMax &&
        matchesQuickFilter
      );
    });

    const sorters = {
      newest: (a, b) => (getProductCreatedAt(b)?.getTime() || 0) - (getProductCreatedAt(a)?.getTime() || 0),
      oldest: (a, b) => (getProductCreatedAt(a)?.getTime() || 0) - (getProductCreatedAt(b)?.getTime() || 0),
      price_asc: (a, b) => getProductPrice(a) - getProductPrice(b),
      price_desc: (a, b) => getProductPrice(b) - getProductPrice(a),
      most_selling: (a, b) => getProductSalesCount(b.id) - getProductSalesCount(a.id),
      name_asc: (a, b) => (a.name || '').localeCompare(b.name || '', 'he'),
    };

    list.sort(sorters[sortOption] || sorters.newest);

    return list;
  }, [
    products,
    searchTerm,
    selectedCategory,
    statusFilter,
    inStockOnly,
    priceRange,
    sortOption,
    quickFilter,
    productSales,
  ]);

  const handlePriceRangeChange = (e) => {
    const { name, value } = e.target;
    setPriceRange((prev) => ({ ...prev, [name]: value }));
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedCategory('all');
    setStatusFilter('all');
    setInStockOnly(false);
    setPriceRange({ min: '', max: '' });
    setSortOption('newest');
    setQuickFilter('all');
  };

  const handleAddProduct = () => {
    navigate('/add-product');
  };

  const handleEditProduct = (productId) => {
    navigate(`/edit-product/${productId}`);
  };

  const handleToggleProduct = (productId) => {
    // Toggle the selection of a product
    const product = products.find(p => p.id === productId);
    if (product && !isProductSelectable(product)) {
      Swal.fire({
        icon: 'info',
        title: product?.rejected ? 'המוצר נדחה' : 'מוצר ממתין לאישור',
        text: product?.rejected ? 'לא ניתן להוסיף מוצר שנדחה למודעת מכירה.' : 'לא ניתן להוסיף למודעת מכירה עד לאישור מנהל.',
      });
      return;
    }
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
    if (isIndependent) {
      navigate(`/independent/create`, { state: { selectedProducts } });
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
        <div className="flex gap-2 flex-wrap justify-center">
          <button
            onClick={handleAddProduct}
            className="w-40 bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors text-sm"
          >
            + הוסף מוצר
          </button>
          <button
            onClick={() => navigate('/bulk-edit-products')}
            className="w-40 bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors text-sm"
          >
            עריכה מרובה
          </button>
          <button
            onClick={handleSelectPreviousOrder}
            disabled={loadingPreviousOrder || products.length === 0}
            className={`w-48 px-3 py-1.5 rounded-lg font-medium transition-colors text-sm ${
              loadingPreviousOrder || products.length === 0
                ? 'bg-purple-100 text-purple-400 cursor-not-allowed'
                : 'bg-purple-600 hover:bg-purple-700 text-white shadow-sm'
            }`}
          >
            {loadingPreviousOrder ? 'טוען הזמנה...' : 'בחר את הזמנת השבוע שעבר'}
          </button>
          {!isIndependent && (
            <button
              onClick={handleCheckSupplierInventory}
              disabled={checkingSupplier}
              className={`w-48 px-3 py-1.5 rounded-lg font-medium transition-colors text-sm ${
                checkingSupplier
                  ? 'bg-orange-100 text-orange-400 cursor-not-allowed'
                  : 'bg-orange-500 hover:bg-orange-600 text-white shadow-sm'
              }`}
            >
              {checkingSupplier ? 'בודק מלאי משק דהן...' : 'בדוק מלאי משק דהן'}
            </button>
          )}
        </div>
        {!isIndependent && (
          <div className="mt-2 text-sm text-gray-600">
            {supplierCheckedAt
              ? `בדיקה אחרונה: ${new Date(supplierCheckedAt).toLocaleString('he-IL')}`
              : 'עוד לא בוצעה בדיקה מול משק דהן'}
            {supplierDiff && (
              <span className="ml-2 text-gray-500">
                | חדשים: {supplierDiff.added.length} | ירדו: {supplierDiff.removed.length}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">חיפוש</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="חיפוש לפי שם או תיאור"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">קטגוריה</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="all">כל הקטגוריות</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">סטטוס</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="all">כל הסטטוסים</option>
              <option value="verified">מאושרים</option>
              <option value="pending">ממתינים לאישור</option>
              <option value="rejected">נדחו</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">סידור</label>
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="newest">הכי חדשים</option>
              <option value="oldest">הכי ישנים</option>
              <option value="price_asc">מחיר - מהנמוך לגבוה</option>
              <option value="price_desc">מחיר - מהגבוה לנמוך</option>
              <option value="most_selling">הכי נמכרים</option>
              <option value="name_asc">שם (א'-ת')</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-500 mb-1 block">מחיר מינימלי</label>
            <input
              type="number"
              name="min"
              value={priceRange.min}
              onChange={handlePriceRangeChange}
              placeholder="₪"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-500 mb-1 block">מחיר מקסימלי</label>
            <input
              type="number"
              name="max"
              value={priceRange.max}
              onChange={handlePriceRangeChange}
              placeholder="₪"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(e) => setInStockOnly(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            הצג מוצרים עם מלאי בלבד
          </label>
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={handleResetFilters}
              className="w-full border border-gray-300 text-gray-600 rounded-md px-3 py-2 text-sm hover:bg-gray-50"
            >
              אפס מסננים
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          {[
            { value: 'all', label: 'הכל' },
            { value: 'recent', label: 'חדשים (14 ימים)' },
            { value: 'top', label: 'להיטים אחרונים' },
            { value: 'never', label: 'עדיין לא נמכר' },
          ].map((filter) => (
            <button
              key={filter.value}
              onClick={() => setQuickFilter(filter.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                quickFilter === filter.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
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
          <div className="flex justify-between text-xs text-gray-500 mb-2">
            <span>סה"כ {products.length} מוצרים בחנות</span>
            <span>{filteredProducts.length} תואמים למסננים</span>
          </div>
          {filteredProducts.length === 0 ? (
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg shadow-sm text-sm">
              לא נמצאו מוצרים התואמים למסננים הנוכחיים. נסו לשנות את החיפוש או לאפס את המסננים.
            </div>
          ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredProducts.map((product) => {
              const salesCount = getProductSalesCount(product.id);
              const createdAt = getProductCreatedAt(product);
              return (
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
                 {/* Status Badge */}
                 {(() => {
                   const status = getProductStatus(product);
                   if (status === 'verified') return null;
                   const badgeClass = status === 'rejected' ? 'bg-red-100 text-red-800 border-red-200' : 'bg-yellow-100 text-yellow-800 border-yellow-200';
                   const text = status === 'rejected' ? 'נדחה על ידי מנהל' : 'ממתין לאישור מנהל';
                   return (
                     <div className={`absolute top-2 right-2 text-xs font-medium px-2 py-0.5 rounded border ${badgeClass}`}>
                       {text}
                     </div>
                   );
                 })()}
                </div>

                {/* Product Info - More Compact */}
                <div className="p-3">
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="text-base font-semibold">{product.name}</h3>
                    <span className="text-base font-bold text-green-600">₪{product.price}</span>
                  </div>

                  <div className="flex flex-wrap gap-2 text-[11px] text-gray-500 mb-1">
                    {createdAt && (
                      <span className="bg-gray-100 px-2 py-0.5 rounded-full">
                        נוסף {createdAt.toLocaleDateString('he-IL')}
                      </span>
                    )}
                    <span className="bg-gray-100 px-2 py-0.5 rounded-full">
                      מלאי: {product.stockAmount ?? 0}
                    </span>
                    {salesCount > 0 ? (
                      <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">
                        נמכר {salesCount}× בהזמנות האחרונות
                      </span>
                    ) : (
                      <span className="bg-gray-100 px-2 py-0.5 rounded-full">עדיין לא נמכר</span>
                    )}
                  </div>
                  
                  <p className="text-xs text-gray-600 mb-1 line-clamp-2">{product.description}</p>
                  
                  {product.options && product.options.length > 0 && (
                    <p className="text-xs text-gray-600 mb-2 line-clamp-1">
                      <span className="font-medium">אופציות:</span> {product.options.join(', ')}
                    </p>
                  )}

                  {/* Actions - More Compact */}
                  <div className="mt-2 flex flex-col gap-2">
                    {(() => {
                      const selectable = isProductSelectable(product);
                      const isSelected = selectedProducts.includes(product.id);
                      const baseEnabled = `${isSelected ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`;
                      const baseDisabled = 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-60';
                      return (
                        <button
                          onClick={() => handleToggleProduct(product.id)}
                          disabled={!selectable}
                          className={`w-full py-1.5 px-3 rounded transition-colors text-xs font-medium ${selectable ? baseEnabled : baseDisabled}`}
                        >
                          {selectable ? (isSelected ? '✓ נבחר להזמנה' : 'בחר להזמנה') : (product?.rejected ? 'נדחה' : 'ממתין לאישור')}
                        </button>
                      );
                    })()}
                    
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
            );
            })}
          </div>
          )}

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
