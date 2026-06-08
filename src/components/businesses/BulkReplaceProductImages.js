import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import Swal from 'sweetalert2';
import { useAuth } from '../../contexts/authContext';
import { db, storage } from '../../firebase/firebase';
import LoadingSpinner from '../LoadingSpinner';
import { isIndependentBusinessAccount } from '../../utils/accountRoles';
import {
  buildInitialImageMatches,
  getMatchConfidence,
  revokeObjectUrls,
  scoreNameMatch,
} from '../../utils/productImageMatching';

const ADMIN_UIDS = ['rfHOLhNoJOW8ByNypCtm3hlSNKs2'];
const ACCEPTED_IMAGE_TYPES = /^image\//;

const getBusinessLabel = (businessId, data = {}) => (
  data.businessName || data.name || data.email || businessId
);

const confidenceLabels = {
  high: 'התאמה גבוהה',
  medium: 'התאמה בינונית',
  low: 'התאמה חלשה',
  none: 'ללא התאמה',
};

const confidenceClasses = {
  high: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-orange-100 text-orange-800',
  none: 'bg-red-100 text-red-800',
};

const uploadProductImage = (businessId, file) =>
  new Promise((resolve, reject) => {
    const storageRef = ref(storage, `products/${businessId}/${Date.now()}_${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file);
    uploadTask.on(
      'state_changed',
      null,
      reject,
      async () => {
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(downloadURL);
        } catch (error) {
          reject(error);
        }
      }
    );
  });

const BulkReplaceProductImages = () => {
  const { currentUser, userRole } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  const [loadingBusinesses, setLoadingBusinesses] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [businesses, setBusinesses] = useState([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState('');
  const [businessSearchTerm, setBusinessSearchTerm] = useState('');
  const [products, setProducts] = useState([]);
  const [matches, setMatches] = useState([]);
  const [minScore, setMinScore] = useState(40);
  const [deleteOldImages, setDeleteOldImages] = useState(true);
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: '' });

  const isAdmin = Boolean(
    currentUser && (userRole === 'admin' || ADMIN_UIDS.includes(currentUser.uid))
  );

  const selectedBusiness = useMemo(
    () => businesses.find((entry) => entry.id === selectedBusinessId) || null,
    [businesses, selectedBusinessId]
  );

  const visibleBusinesses = useMemo(() => {
    const normalizedSearch = businessSearchTerm.trim().toLowerCase();
    return businesses
      .filter((entry) => {
        if (!normalizedSearch) return true;
        return getBusinessLabel(entry.id, entry).toLowerCase().includes(normalizedSearch);
      })
      .sort((a, b) => getBusinessLabel(a.id, a).localeCompare(getBusinessLabel(b.id, b), 'he'));
  }, [businesses, businessSearchTerm]);

  useEffect(() => {
    const loadBusinesses = async () => {
      if (!currentUser) return;
      setLoadingBusinesses(true);
      try {
        if (isAdmin) {
          const snapshot = await getDocs(collection(db, 'businesses'));
          const weeklyBusinesses = snapshot.docs
            .map((businessDoc) => ({ id: businessDoc.id, ...businessDoc.data() }))
            .filter((entry) => !isIndependentBusinessAccount(entry));
          setBusinesses(weeklyBusinesses);
        } else {
          const snap = await getDoc(doc(db, 'businesses', currentUser.uid));
          if (snap.exists() && !isIndependentBusinessAccount(snap.data())) {
            setBusinesses([{ id: snap.id, ...snap.data() }]);
          } else {
            setBusinesses([]);
          }
        }
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
      setSelectedBusinessId('');
      return;
    }
    if (!visibleBusinesses.some((entry) => entry.id === selectedBusinessId)) {
      setSelectedBusinessId(visibleBusinesses[0].id);
    }
  }, [visibleBusinesses, selectedBusinessId]);

  useEffect(() => {
    const loadProducts = async () => {
      setMatches((current) => {
        revokeObjectUrls(current);
        return [];
      });

      if (!selectedBusinessId) {
        setProducts([]);
        return;
      }

      setLoadingProducts(true);
      try {
        const q = query(
          collection(db, 'Products'),
          where('Owner_ID', '==', selectedBusinessId)
        );
        const snapshot = await getDocs(q);
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
  }, [selectedBusinessId]);

  const handleBusinessChange = (businessId) => {
    revokeObjectUrls(matches);
    setMatches([]);
    setFilter('all');
    setSearchTerm('');
    setSelectedBusinessId(businessId);
  };

  useEffect(() => () => revokeObjectUrls(matches), [matches]);

  const productById = useMemo(() => {
    const map = new Map();
    products.forEach((product) => map.set(product.id, product));
    return map;
  }, [products]);

  const enabledMatches = useMemo(
    () => matches.filter((match) => match.enabled && match.productId),
    [matches]
  );

  const duplicateProductIds = useMemo(() => {
    const counts = new Map();
    enabledMatches.forEach((match) => {
      counts.set(match.productId, (counts.get(match.productId) || 0) + 1);
    });
    return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id));
  }, [enabledMatches]);

  const applyCount = useMemo(
    () => matches.filter(
      (match) => match.enabled && match.productId && !duplicateProductIds.has(match.productId)
    ).length,
    [matches, duplicateProductIds]
  );

  const filteredMatches = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return matches.filter((match) => {
      const product = productById.get(match.productId);
      const matchesSearch =
        !search
        || match.fileName.toLowerCase().includes(search)
        || (product?.name || '').toLowerCase().includes(search);

      if (!matchesSearch) return false;
      if (filter === 'review') return match.needsReview || match.conflict;
      if (filter === 'ready') return match.enabled && match.productId && !match.conflict;
      if (filter === 'unmatched') return !match.productId;
      return true;
    });
  }, [matches, filter, searchTerm, productById]);

  const stats = useMemo(() => ({
    total: matches.length,
    ready: matches.filter((m) => m.enabled && m.productId && !duplicateProductIds.has(m.productId)).length,
    review: matches.filter((m) => m.needsReview || m.conflict || !m.productId).length,
    unmatched: matches.filter((m) => !m.productId).length,
  }), [matches, duplicateProductIds]);

  const handleFilesSelected = (fileList) => {
    const files = Array.from(fileList || []).filter((file) => ACCEPTED_IMAGE_TYPES.test(file.type));
    if (files.length === 0) {
      Swal.fire({
        icon: 'info',
        title: 'לא נמצאו תמונות',
        text: 'בחרו קבצי תמונה (JPG, PNG, WEBP וכו׳).',
      });
      return;
    }

    revokeObjectUrls(matches);
    setMatches(buildInitialImageMatches(files, products, minScore));
  };

  const handleRematch = () => {
    if (matches.length === 0) return;
    const files = matches.map((match) => match.file);
    revokeObjectUrls(matches);
    setMatches(buildInitialImageMatches(files, products, minScore));
  };

  const updateMatch = (matchId, updates) => {
    setMatches((current) => {
      const next = current.map((match) => {
        if (match.id !== matchId) return match;
        const merged = { ...match, ...updates };
        if (updates.productId !== undefined) {
          const product = products.find((item) => item.id === updates.productId);
          const score = product ? scoreNameMatch(match.fileName, product.name) : 0;
          merged.score = score;
          merged.confidence = getMatchConfidence(score);
          merged.needsReview = !updates.productId || score < 75;
          merged.enabled = Boolean(updates.productId);
          merged.conflict = false;
        }
        return merged;
      });

      const winnerByProduct = new Map();
      next.forEach((match) => {
        if (!match.enabled || !match.productId) return;
        const current = winnerByProduct.get(match.productId);
        if (!current || match.score > current.score) {
          winnerByProduct.set(match.productId, match);
        }
      });

      return next.map((match) => {
        if (!match.enabled || !match.productId) return match;
        const winner = winnerByProduct.get(match.productId);
        const isWinner = winner?.id === match.id;
        return {
          ...match,
          conflict: !isWinner,
          needsReview: !isWinner || match.score < 75,
        };
      });
    });
  };

  const handleApply = async () => {
    if (!currentUser || !selectedBusinessId) return;

    const toApply = matches.filter(
      (match) => match.enabled && match.productId && !duplicateProductIds.has(match.productId)
    );

    if (toApply.length === 0) {
      Swal.fire({
        icon: 'info',
        title: 'אין תמונות להחלפה',
        text: 'סמנו לפחות התאמה אחת תקינה ללא כפילויות.',
      });
      return;
    }

    const duplicateCount = enabledMatches.length - toApply.length;
    const businessLabel = getBusinessLabel(selectedBusinessId, selectedBusiness);
    const confirm = await Swal.fire({
      icon: 'question',
      title: 'להחליף תמונות?',
      html: `
        <div style="text-align:right; direction:rtl; font-size:14px;">
          <p>עסק: <strong>${businessLabel}</strong></p>
          <p>יוחלפו תמונות עבור <strong>${toApply.length}</strong> מוצרים.</p>
          ${duplicateCount > 0 ? `<p>${duplicateCount} קבצים לא יועלו בגלל כפילויות — בחרו מוצר אחר או בטלו אותם.</p>` : ''}
          <p>${deleteOldImages ? 'התמונות הישנות יימחקו מהאחסון.' : 'התמונה החדשה תהיה הראשונה, והישנות יישארו.'}</p>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'החלף תמונות',
      cancelButtonText: 'ביטול',
    });

    if (!confirm.isConfirmed) return;

    setApplying(true);
    setProgress({ done: 0, total: toApply.length, current: '' });

    let successCount = 0;
    const failures = [];

    for (let index = 0; index < toApply.length; index += 1) {
      const match = toApply[index];
      const product = productById.get(match.productId);
      setProgress({
        done: index,
        total: toApply.length,
        current: product?.name || match.fileName,
      });

      try {
        const newUrl = await uploadProductImage(selectedBusinessId, match.file);
        const oldImages = Array.isArray(product?.images) ? product.images : [];

        if (deleteOldImages) {
          await Promise.allSettled(
            oldImages.map(async (imageUrl) => {
              try {
                await deleteObject(ref(storage, imageUrl));
              } catch (error) {
                console.warn('Failed to delete old image', imageUrl, error);
              }
            })
          );
        }

        const nextImages = deleteOldImages ? [newUrl] : [newUrl, ...oldImages];
        await updateDoc(doc(db, 'Products', match.productId), { images: nextImages });
        successCount += 1;
      } catch (error) {
        console.error('Failed to replace image', match, error);
        failures.push(product?.name || match.fileName);
      }
    }

    setProgress({ done: toApply.length, total: toApply.length, current: '' });
    setApplying(false);

    if (failures.length === 0) {
      Swal.fire({
        icon: 'success',
        title: 'התמונות הוחלפו',
        text: `${successCount} מוצרים עודכנו בהצלחה.`,
      }).then(() => navigate('/Business-Products'));
      return;
    }

    Swal.fire({
      icon: 'warning',
      title: 'הושלם חלקית',
      html: `
        <div style="text-align:right; direction:rtl; font-size:14px;">
          <p>${successCount} מוצרים עודכנו.</p>
          <p>${failures.length} נכשלו:</p>
          <ul style="padding-right:18px; margin:8px 0 0;">
            ${failures.slice(0, 8).map((name) => `<li>${name}</li>`).join('')}
            ${failures.length > 8 ? `<li>...ועוד ${failures.length - 8}</li>` : ''}
          </ul>
        </div>
      `,
    });
  };

  if (loadingBusinesses) {
    return <LoadingSpinner />;
  }

  const canPickFiles = Boolean(selectedBusinessId) && !loadingProducts && products.length > 0;

  return (
    <div dir="rtl" className="max-w-6xl mx-auto px-4 py-4 pb-28">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold">החלפת תמונות מרובה</h1>
          <p className="text-sm text-gray-600 mt-1">
            בחרו עסק, העלו תיקייה של תמונות מהמחשב, ואז התאימו לפי שם הקובץ לפני ההעלאה.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/Business-Products')}
          className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          חזרה למוצרים
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {isAdmin && businesses.length > 1 && (
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">חיפוש עסק</label>
              <input
                type="text"
                value={businessSearchTerm}
                onChange={(e) => setBusinessSearchTerm(e.target.value)}
                placeholder="חיפוש לפי שם עסק"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
          )}
          <div className={isAdmin && businesses.length > 1 ? '' : 'md:col-span-2'}>
            <label className="text-xs font-medium text-gray-500 mb-1 block">עסק</label>
            <select
              value={selectedBusinessId}
              onChange={(e) => handleBusinessChange(e.target.value)}
              disabled={businesses.length === 0}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              {visibleBusinesses.length === 0 ? (
                <option value="">אין עסקים זמינים</option>
              ) : (
                visibleBusinesses.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {getBusinessLabel(entry.id, entry)}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        {loadingProducts ? (
          <p className="text-sm text-gray-500 mt-3">טוען מוצרים...</p>
        ) : selectedBusiness ? (
          <p className="text-sm text-gray-600 mt-3">
            {products.length} מוצרים של <span className="font-medium">{getBusinessLabel(selectedBusinessId, selectedBusiness)}</span>
          </p>
        ) : (
          <p className="text-sm text-red-600 mt-3">לא נמצא עסק לבחירה</p>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 mb-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => folderInputRef.current?.click()}
            disabled={!canPickFiles}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              canPickFiles
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-blue-100 text-blue-400 cursor-not-allowed'
            }`}
          >
            בחר תיקייה
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!canPickFiles}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              canPickFiles
                ? 'bg-blue-100 hover:bg-blue-200 text-blue-800'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            בחר קבצים
          </button>
          {matches.length > 0 && (
            <button
              type="button"
              onClick={handleRematch}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-sm font-medium"
            >
              התאם מחדש
            </button>
          )}
        </div>

        <input
          ref={folderInputRef}
          type="file"
          accept="image/*"
          multiple
          webkitdirectory=""
          directory=""
          className="hidden"
          onChange={(e) => {
            handleFilesSelected(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFilesSelected(e.target.files);
            e.target.value = '';
          }}
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          <label className="text-sm text-gray-700">
            <span className="block mb-1">רגישות התאמה מינימלית: {minScore}</span>
            <input
              type="range"
              min="20"
              max="80"
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="w-full"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 mt-5">
            <input
              type="checkbox"
              checked={deleteOldImages}
              onChange={(e) => setDeleteOldImages(e.target.checked)}
              className="rounded border-gray-300 text-blue-600"
            />
            מחק תמונות ישנות מהאחסון
          </label>
          <div className="text-sm text-gray-600 mt-5">
            {matches.length > 0 && (
              <span>
                {stats.ready} מוכנים | {stats.review} לבדיקה | {stats.unmatched} ללא התאמה
              </span>
            )}
          </div>
        </div>

        {!canPickFiles && selectedBusinessId && !loadingProducts && products.length === 0 && (
          <p className="text-sm text-amber-700 mt-3">לעסק זה אין מוצרים. הוסיפו מוצרים לפני החלפת תמונות.</p>
        )}
      </div>

      {matches.length > 0 && (
        <>
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 mb-4">
            <div className="flex flex-wrap gap-2 mb-3">
              {[
                { value: 'all', label: `הכל (${stats.total})` },
                { value: 'ready', label: `מוכנים (${stats.ready})` },
                { value: 'review', label: `לבדיקה (${stats.review})` },
                { value: 'unmatched', label: `ללא התאמה (${stats.unmatched})` },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setFilter(item.value)}
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    filter === item.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="חיפוש לפי שם קובץ או מוצר"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>

          {duplicateProductIds.size > 0 && (
            <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 mb-4 text-sm">
              יש כפילויות: שני קבצים שונים מסומנים לאותו מוצר. השאירו רק אחד פעיל או שייכו מחדש.
            </div>
          )}

          <div className="space-y-3">
            {filteredMatches.map((match) => {
              const product = productById.get(match.productId);
              const hasDuplicate = match.enabled && duplicateProductIds.has(match.productId);
              return (
                <div
                  key={match.id}
                  className={`bg-white border rounded-lg p-3 flex flex-col sm:flex-row gap-3 ${
                    hasDuplicate ? 'border-red-300' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-start gap-3 sm:w-72">
                    <img
                      src={match.previewUrl}
                      alt={match.fileName}
                      className="w-20 h-20 rounded object-cover border border-gray-200 flex-shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium break-all">{match.fileName}</p>
                      <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${confidenceClasses[match.confidence]}`}>
                        {confidenceLabels[match.confidence]}
                        {match.score > 0 ? ` (${match.score})` : ''}
                      </span>
                      {match.conflict && (
                        <p className="text-xs text-red-600 mt-1">כפילות — יש קובץ עם התאמה טובה יותר</p>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-center">
                    <select
                      value={match.productId}
                      onChange={(e) => updateMatch(match.id, { productId: e.target.value })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    >
                      <option value="">ללא מוצר (דלג)</option>
                      {products.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>

                    <label className="flex items-center gap-2 text-sm text-gray-700 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={match.enabled && Boolean(match.productId)}
                        disabled={!match.productId}
                        onChange={(e) => updateMatch(match.id, { enabled: e.target.checked })}
                        className="rounded border-gray-300 text-blue-600"
                      />
                      להעלות
                    </label>
                  </div>

                  <div className="sm:w-40 text-xs text-gray-500">
                    {product ? (
                      <>
                        <p className="font-medium text-gray-700">{product.name}</p>
                        <p className="mt-1">
                          {product.images?.length ? `${product.images.length} תמונות קיימות` : 'אין תמונה'}
                        </p>
                      </>
                    ) : (
                      <p>לא שויך מוצר</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {matches.length === 0 && (
        <div className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-8 text-center text-gray-600">
          <p className="font-medium mb-2">עדיין לא נבחרו תמונות</p>
          <p className="text-sm">
            {canPickFiles
              ? 'לחצו על "בחר תיקייה" כדי להעלות את כל התמונות שהורדתם מהמחשב.'
              : 'בחרו עסק עם מוצרים, ואז העלו את התמונות.'}
          </p>
        </div>
      )}

      {matches.length > 0 && (
        <div className="fixed bottom-4 left-0 right-0 flex justify-center z-20 px-4">
          <button
            type="button"
            onClick={handleApply}
            disabled={applying || applyCount === 0 || duplicateProductIds.size > 0}
            className={`py-3 px-6 rounded-full shadow-lg font-medium transition-all ${
              applying || applyCount === 0 || duplicateProductIds.size > 0
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:shadow-xl'
            }`}
          >
            {applying
              ? `מעלה ${progress.done}/${progress.total}${progress.current ? ` — ${progress.current}` : ''}`
              : `החלף ${applyCount} תמונות`}
          </button>
        </div>
      )}
    </div>
  );
};

export default BulkReplaceProductImages;
