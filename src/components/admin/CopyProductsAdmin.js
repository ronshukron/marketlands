import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import Swal from 'sweetalert2';
import { useAuth } from '../../contexts/authContext';
import { db } from '../../firebase/firebase';
import LoadingSpinner from '../LoadingSpinner';
import { isIndependentBusinessAccount } from '../../utils/accountRoles';
import {
  buildCopiedProductPayload,
  fetchNextCatalogNumber,
  getBusinessLabel,
} from '../../utils/copyProductUtils';

const ADMIN_UIDS = ['rfHOLhNoJOW8ByNypCtm3hlSNKs2'];

const formatPrice = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? `₪${amount.toFixed(2)}` : '—';
};

const CopyProductsAdmin = () => {
  const { currentUser, userRole } = useAuth();
  const isAdmin = Boolean(
    currentUser && (userRole === 'admin' || ADMIN_UIDS.includes(currentUser.uid))
  );

  const [loadingBusinesses, setLoadingBusinesses] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [copying, setCopying] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: '' });
  const [businesses, setBusinesses] = useState([]);
  const [sourceBusinessId, setSourceBusinessId] = useState('');
  const [destinationBusinessId, setDestinationBusinessId] = useState('');
  const [businessSearchTerm, setBusinessSearchTerm] = useState('');
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [products, setProducts] = useState([]);
  const [selectedProductIds, setSelectedProductIds] = useState(() => new Set());

  const visibleBusinesses = useMemo(() => {
    const normalizedSearch = businessSearchTerm.trim().toLowerCase();
    return businesses
      .filter((entry) => {
        if (!normalizedSearch) return true;
        return getBusinessLabel(entry).toLowerCase().includes(normalizedSearch);
      })
      .sort((a, b) => getBusinessLabel(a).localeCompare(getBusinessLabel(b), 'he'));
  }, [businesses, businessSearchTerm]);

  const sourceBusiness = useMemo(
    () => businesses.find((entry) => entry.id === sourceBusinessId) || null,
    [businesses, sourceBusinessId]
  );

  const destinationBusiness = useMemo(
    () => businesses.find((entry) => entry.id === destinationBusinessId) || null,
    [businesses, destinationBusinessId]
  );

  const destinationOptions = useMemo(
    () => visibleBusinesses.filter((entry) => entry.id !== sourceBusinessId),
    [visibleBusinesses, sourceBusinessId]
  );

  const visibleProducts = useMemo(() => {
    const normalizedSearch = productSearchTerm.trim().toLowerCase();
    return products.filter((product) => {
      if (!normalizedSearch) return true;
      const haystack = [
        product.name,
        product.thaiName,
        product.catalogNumber,
        product.category,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [products, productSearchTerm]);

  const selectedCount = selectedProductIds.size;
  const allVisibleSelected = visibleProducts.length > 0
    && visibleProducts.every((product) => selectedProductIds.has(product.id));

  useEffect(() => {
    const loadBusinesses = async () => {
      if (!currentUser || !isAdmin) return;
      setLoadingBusinesses(true);
      try {
        const snapshot = await getDocs(collection(db, 'businesses'));
        const weeklyBusinesses = snapshot.docs
          .map((businessDoc) => ({ id: businessDoc.id, ...businessDoc.data() }))
          .filter((entry) => !isIndependentBusinessAccount(entry))
          .sort((a, b) => getBusinessLabel(a).localeCompare(getBusinessLabel(b), 'he'));
        setBusinesses(weeklyBusinesses);
      } catch (error) {
        console.error('Failed to load businesses', error);
        Swal.fire({
          icon: 'error',
          title: 'שגיאה',
          text: 'לא ניתן לטעון את רשימת העסקים',
        });
      } finally {
        setLoadingBusinesses(false);
      }
    };

    loadBusinesses();
  }, [currentUser, isAdmin]);

  useEffect(() => {
    if (visibleBusinesses.length === 0) {
      setSourceBusinessId('');
      return;
    }
    if (!visibleBusinesses.some((entry) => entry.id === sourceBusinessId)) {
      setSourceBusinessId(visibleBusinesses[0].id);
    }
  }, [visibleBusinesses, sourceBusinessId]);

  useEffect(() => {
    if (destinationOptions.length === 0) {
      setDestinationBusinessId('');
      return;
    }
    if (!destinationOptions.some((entry) => entry.id === destinationBusinessId)) {
      setDestinationBusinessId(destinationOptions[0].id);
    }
  }, [destinationOptions, destinationBusinessId]);

  useEffect(() => {
    const loadProducts = async () => {
      setSelectedProductIds(new Set());
      setProductSearchTerm('');

      if (!sourceBusinessId) {
        setProducts([]);
        return;
      }

      setLoadingProducts(true);
      try {
        const productsQuery = query(
          collection(db, 'Products'),
          where('Owner_ID', '==', sourceBusinessId)
        );
        const snapshot = await getDocs(productsQuery);
        const items = snapshot.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
          .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'he'));
        setProducts(items);
      } catch (error) {
        console.error('Failed to load products', error);
        Swal.fire({
          icon: 'error',
          title: 'שגיאה',
          text: 'לא ניתן לטעון את מוצרי העסק',
        });
        setProducts([]);
      } finally {
        setLoadingProducts(false);
      }
    };

    loadProducts();
  }, [sourceBusinessId]);

  const toggleProduct = (productId) => {
    setSelectedProductIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedProductIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        visibleProducts.forEach((product) => next.delete(product.id));
      } else {
        visibleProducts.forEach((product) => next.add(product.id));
      }
      return next;
    });
  };

  const handleCopy = async () => {
    if (!sourceBusiness || !destinationBusiness) return;
    if (sourceBusiness.id === destinationBusiness.id) {
      Swal.fire({
        icon: 'warning',
        title: 'בחירה לא תקינה',
        text: 'יש לבחור עסק יעד שונה מעסק המקור',
      });
      return;
    }
    if (!destinationBusiness.email) {
      Swal.fire({
        icon: 'error',
        title: 'חסר אימייל לעסק היעד',
        text: 'לעסק היעד אין שדה email — לא ניתן ליצור מוצרים עם Owner_Email',
      });
      return;
    }

    const selectedProducts = products.filter((product) => selectedProductIds.has(product.id));
    if (selectedProducts.length === 0) {
      Swal.fire({
        icon: 'info',
        title: 'לא נבחרו מוצרים',
        text: 'סמנו לפחות מוצר אחד להעתקה',
      });
      return;
    }

    const confirm = await Swal.fire({
      icon: 'question',
      title: 'להעתיק מוצרים?',
      html: `
        <p class="text-sm text-right" dir="rtl">
          יועתקו <strong>${selectedProducts.length}</strong> מוצרים מ־
          <strong>${getBusinessLabel(sourceBusiness)}</strong>
          אל
          <strong>${getBusinessLabel(destinationBusiness)}</strong>
          כמסמכים חדשים (מספר קטלוג ו־ID חדשים).
        </p>
      `,
      showCancelButton: true,
      confirmButtonText: 'העתק',
      cancelButtonText: 'ביטול',
    });
    if (!confirm.isConfirmed) return;

    setCopying(true);
    setProgress({ done: 0, total: selectedProducts.length, current: '' });

    let successCount = 0;
    const failures = [];

    try {
      for (let index = 0; index < selectedProducts.length; index += 1) {
        const product = selectedProducts[index];
        setProgress({
          done: index,
          total: selectedProducts.length,
          current: product.name || product.id,
        });

        try {
          const catalogNumber = await fetchNextCatalogNumber();
          const payload = buildCopiedProductPayload(
            product,
            destinationBusiness,
            catalogNumber
          );
          await addDoc(collection(db, 'Products'), payload);
          successCount += 1;
        } catch (error) {
          console.error('Failed to copy product', product.id, error);
          failures.push(product.name || product.id);
        }
      }
    } finally {
      setCopying(false);
      setProgress({ done: 0, total: 0, current: '' });
    }

    if (failures.length === 0) {
      Swal.fire({
        icon: 'success',
        title: 'ההעתקה הושלמה',
        text: `${successCount} מוצרים נוצרו בעסק היעד`,
      });
      setSelectedProductIds(new Set());
      return;
    }

    Swal.fire({
      icon: successCount > 0 ? 'warning' : 'error',
      title: successCount > 0 ? 'העתקה חלקית' : 'ההעתקה נכשלה',
      html: `
        <p class="text-sm text-right" dir="rtl">
          הועתקו בהצלחה: <strong>${successCount}</strong><br/>
          נכשלו: <strong>${failures.length}</strong>
          ${failures.length ? `<br/><br/>${failures.slice(0, 8).join('<br/>')}` : ''}
        </p>
      `,
    });
  };

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  if (loadingBusinesses) {
    return <LoadingSpinner />;
  }

  const canCopy = Boolean(
    sourceBusiness
    && destinationBusiness
    && sourceBusiness.id !== destinationBusiness.id
    && selectedCount > 0
    && !copying
    && !loadingProducts
  );

  return (
    <main dir="rtl" className="mx-auto min-h-screen max-w-6xl px-4 py-6 pb-28">
      <Link to="/admin" className="inline-flex min-h-[44px] items-center text-sm text-blue-700 hover:underline">
        ← חזרה ללוח הניהול
      </Link>

      <div className="mt-2 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">העתקת מוצרים בין עסקים</h1>
        <p className="mt-1 text-sm text-gray-600">
          בחרו עסק מקור, סמנו מוצרים, והעתיקו אותם כמסמכים חדשים לעסק יעד (עסקים שבועיים בלבד).
        </p>
      </div>

      <section className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-gray-500" htmlFor="business-search">
            חיפוש עסק
          </label>
          <input
            id="business-search"
            type="search"
            value={businessSearchTerm}
            onChange={(e) => setBusinessSearchTerm(e.target.value)}
            placeholder="חיפוש לפי שם עסק"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500" htmlFor="source-business">
              עסק מקור
            </label>
            <select
              id="source-business"
              value={sourceBusinessId}
              onChange={(e) => setSourceBusinessId(e.target.value)}
              disabled={visibleBusinesses.length === 0 || copying}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {visibleBusinesses.length === 0 ? (
                <option value="">אין עסקים זמינים</option>
              ) : (
                visibleBusinesses.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {getBusinessLabel(entry)}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500" htmlFor="destination-business">
              עסק יעד
            </label>
            <select
              id="destination-business"
              value={destinationBusinessId}
              onChange={(e) => setDestinationBusinessId(e.target.value)}
              disabled={destinationOptions.length === 0 || copying}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {destinationOptions.length === 0 ? (
                <option value="">אין עסק יעד זמין</option>
              ) : (
                destinationOptions.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {getBusinessLabel(entry)}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        {sourceBusiness && destinationBusiness && (
          <p className="mt-3 text-sm text-gray-600">
            העתקה מ־
            <span className="font-medium">{getBusinessLabel(sourceBusiness)}</span>
            {' '}אל{' '}
            <span className="font-medium">{getBusinessLabel(destinationBusiness)}</span>
          </p>
        )}
      </section>

      <section className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-[220px] flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-500" htmlFor="product-search">
              חיפוש מוצר
            </label>
            <input
              id="product-search"
              type="search"
              value={productSearchTerm}
              onChange={(e) => setProductSearchTerm(e.target.value)}
              placeholder="שם, מספר קטלוג, קטגוריה..."
              disabled={loadingProducts || products.length === 0}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={toggleSelectAllVisible}
              disabled={loadingProducts || visibleProducts.length === 0 || copying}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {allVisibleSelected ? 'ביטול בחירה ברשימה' : 'בחר את כל המוצגים'}
            </button>
            <span className="text-sm text-gray-600">
              נבחרו {selectedCount} מתוך {products.length}
            </span>
          </div>
        </div>

        {loadingProducts ? (
          <p className="py-8 text-center text-sm text-gray-500">טוען מוצרים...</p>
        ) : products.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
            לעסק המקור אין מוצרים להצגה.
          </div>
        ) : visibleProducts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
            לא נמצאו מוצרים לפי החיפוש.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
            {visibleProducts.map((product) => {
              const checked = selectedProductIds.has(product.id);
              const imageUrl = Array.isArray(product.images) ? product.images[0] : null;
              return (
                <li key={product.id}>
                  <label
                    className={`flex cursor-pointer items-center gap-3 px-3 py-3 hover:bg-gray-50 ${
                      checked ? 'bg-green-50' : 'bg-white'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleProduct(product.id)}
                      disabled={copying}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt=""
                        className="h-12 w-12 rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded bg-gray-100 text-xs text-gray-400">
                        אין
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-gray-900">
                        {product.name || 'ללא שם'}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                        <span>{formatPrice(product.price)}</span>
                        {product.catalogNumber != null && (
                          <span>קטלוג #{product.catalogNumber}</span>
                        )}
                        {product.category && <span>{product.category}</span>}
                        {product.measurementType && <span>{product.measurementType}</span>}
                        {product.verified === false && (
                          <span className="text-amber-700">ממתין לאישור</span>
                        )}
                      </div>
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-gray-600">
            {copying ? (
              <span>
                מעתיק {progress.done + 1}/{progress.total}
                {progress.current ? ` — ${progress.current}` : ''}
              </span>
            ) : (
              <span>
                {selectedCount > 0
                  ? `${selectedCount} מוצרים ייווצרו מחדש בעסק היעד`
                  : 'בחרו מוצרים להעתקה'}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!canCopy}
            className={`min-h-[44px] rounded-lg px-5 py-2 text-sm font-medium ${
              canCopy
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'cursor-not-allowed bg-green-100 text-green-400'
            }`}
          >
            {copying ? 'מעתיק...' : 'העתק מוצרים נבחרים'}
          </button>
        </div>
      </div>
    </main>
  );
};

export default CopyProductsAdmin;
