import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, updateDoc, writeBatch, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import Swal from 'sweetalert2';
import LoadingSpinner from '../LoadingSpinner';

// Predefined unit size options (in kg)
const UNIT_SIZE_OPTIONS = [
  { value: '0.1', label: '0.1 ק"ג' },
  { value: '0.25', label: '0.25 ק"ג' },
  { value: '0.5', label: '0.5 ק"ג' },
  { value: '1', label: '1 ק"ג' },
  { value: '1.5', label: '1.5 ק"ג' },
  { value: '2', label: '2 ק"ג' },
  { value: '2.5', label: '2.5 ק"ג' },
  { value: '3', label: '3 ק"ג' },
  { value: '5', label: '5 ק"ג' },
  { value: '10', label: '10 ק"ג' },
];

const BulkEditProducts = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editedProducts, setEditedProducts] = useState({});
  const [isIndependent, setIsIndependent] = useState(false);

  useEffect(() => {
    const fetchProducts = async () => {
      if (!currentUser) return;
      setLoading(true);
      try {
        // Fetch isIndependent status
        const businessRef = doc(db, 'businesses', currentUser.uid);
        const snap = await getDoc(businessRef);
        if (snap.exists()) {
          setIsIndependent(Boolean(snap.data().isIndependent));
        }

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
        
        // Initialize edited products with current values
        const initialEdits = {};
        fetchedProducts.forEach(product => {
          initialEdits[product.id] = {
            price: product.price || '',
            stockAmount: product.stockAmount || 0,
            merchantPrice: product.merchantPrice || '',
            category: product.category || '',
            thaiName: product.thaiName || '',
            measurementType: product.measurementType || 'kg', // default to kg
            unitSize: product.unitSize != null ? String(product.unitSize) : '1' // default to 1 kg
          };
        });
        setEditedProducts(initialEdits);
      } catch (error) {
        console.error('Error fetching products:', error);
        Swal.fire({
          icon: 'error',
          title: 'שגיאה',
          text: 'לא ניתן לטעון את המוצרים'
        });
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [currentUser]);

  const handleFieldChange = (productId, field, value) => {
    setEditedProducts(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [field]: value
      }
    }));
  };

  const hasChanges = () => {
    return products.some(product => {
      const edited = editedProducts[product.id];
      if (!edited) return false;
      
      return (
        Number(edited.price) !== Number(product.price || 0) ||
        Number(edited.stockAmount) !== Number(product.stockAmount || 0) ||
        (edited.merchantPrice !== '' ? Number(edited.merchantPrice) : null) !== (product.merchantPrice != null ? Number(product.merchantPrice) : null) ||
        edited.category !== (product.category || '') ||
        edited.thaiName !== (product.thaiName || '') ||
        edited.measurementType !== (product.measurementType || 'kg') ||
        Number(edited.unitSize || 1) !== Number(product.unitSize || 1)
      );
    });
  };

  const handleSaveAll = async () => {
    if (!hasChanges()) {
      Swal.fire({
        icon: 'info',
        title: 'אין שינויים',
        text: 'לא בוצעו שינויים למוצרים'
      });
      return;
    }

    const result = await Swal.fire({
      icon: 'question',
      title: 'שמירת שינויים',
      text: 'האם לשמור את כל השינויים?',
      showCancelButton: true,
      confirmButtonText: 'שמור',
      cancelButtonText: 'ביטול',
      confirmButtonColor: '#3b82f6'
    });

    if (!result.isConfirmed) return;

    setSaving(true);
    try {
      const batch = writeBatch(db);
      let changesCount = 0;

      products.forEach(product => {
        const edited = editedProducts[product.id];
        if (!edited) return;

        const hasProductChanges = (
          Number(edited.price) !== Number(product.price || 0) ||
          Number(edited.stockAmount) !== Number(product.stockAmount || 0) ||
          (edited.merchantPrice !== '' ? Number(edited.merchantPrice) : null) !== (product.merchantPrice != null ? Number(product.merchantPrice) : null) ||
          edited.category !== (product.category || '') ||
          edited.thaiName !== (product.thaiName || '') ||
          edited.measurementType !== (product.measurementType || 'kg') ||
          Number(edited.unitSize || 1) !== Number(product.unitSize || 1)
        );

        if (hasProductChanges) {
          const productRef = doc(db, 'Products', product.id);
          const updates = {
            price: Number(edited.price),
            stockAmount: Number(edited.stockAmount),
            measurementType: edited.measurementType || 'kg',
            // unitSize: kg per cart click. Only meaningful for kg items, stored as number (default 1).
            unitSize: edited.measurementType === 'kg' ? Number(edited.unitSize || 1) : 1
          };
          
          if (edited.merchantPrice !== '') {
            updates.merchantPrice = Number(edited.merchantPrice);
          } else {
            updates.merchantPrice = null;
          }

          if (edited.category !== '') {
            updates.category = edited.category;
          } else {
            updates.category = '';
          }

          if (edited.thaiName !== '') {
            updates.thaiName = edited.thaiName;
          } else {
            updates.thaiName = '';
          }

          batch.update(productRef, updates);
          changesCount++;
        }
      });

      if (changesCount > 0) {
        await batch.commit();
        
        Swal.fire({
          icon: 'success',
          title: 'נשמר בהצלחה!',
          text: `${changesCount} מוצרים עודכנו`,
          timer: 2000,
          showConfirmButton: false
        });

        // Refresh products
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
      }
    } catch (error) {
      console.error('Error saving products:', error);
      Swal.fire({
        icon: 'error',
        title: 'שגיאה',
        text: 'אירעה שגיאה בשמירת השינויים'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    const initialEdits = {};
    products.forEach(product => {
      initialEdits[product.id] = {
        price: product.price || '',
        stockAmount: product.stockAmount || 0,
        merchantPrice: product.merchantPrice || '',
        category: product.category || '',
        thaiName: product.thaiName || '',
        measurementType: product.measurementType || 'kg',
        unitSize: product.unitSize != null ? String(product.unitSize) : '1'
      };
    });
    setEditedProducts(initialEdits);
    Swal.fire({
      icon: 'info',
      title: 'אופס!',
      text: 'כל השינויים בוטלו',
      timer: 1500,
      showConfirmButton: false
    });
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div dir="rtl" className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">עריכה מרובה של מוצרים</h1>
            <p className="text-gray-600 mt-1">ערוך מחיר וכמות במלאי עבור כל המוצרים שלך במקום אחד</p>
          </div>
          <button
            onClick={() => navigate('/Business-Products')}
            className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-md transition-colors"
          >
            חזרה
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleSaveAll}
            disabled={saving || !hasChanges()}
            className={`flex-1 py-3 px-6 rounded-lg font-medium transition-colors ${
              saving || !hasChanges()
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {saving ? 'שומר...' : `שמור את כל השינויים${hasChanges() ? ' ✓' : ''}`}
          </button>
          <button
            onClick={handleReset}
            disabled={saving || !hasChanges()}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              saving || !hasChanges()
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-red-50 hover:bg-red-100 text-red-700'
            }`}
          >
            בטל שינויים
          </button>
        </div>
      </div>

      {/* Products Table */}
      {products.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <p className="text-gray-600">אין מוצרים לעריכה</p>
          <button
            onClick={() => navigate('/add-product')}
            className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md"
          >
            הוסף מוצר חדש
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    תמונה
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    שם המוצר
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    מחיר (₪)
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    מחיר סוחר (₪)
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    כמות במלאי
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    קטגוריה
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    נמדד לפי
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    כמות לעגלה
                  </th>
                  {!isIndependent && (
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ชื่อภาษาไทย
                    </th>
                  )}
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    סוג מע"מ
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    סטטוס
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {products.map((product) => {
                  const edited = editedProducts[product.id] || {};
                  const hasProductChanges = (
                    Number(edited.price) !== Number(product.price || 0) ||
                    Number(edited.stockAmount) !== Number(product.stockAmount || 0) ||
                    (edited.merchantPrice !== '' ? Number(edited.merchantPrice) : null) !== (product.merchantPrice != null ? Number(product.merchantPrice) : null) ||
                    edited.category !== (product.category || '') ||
                    edited.thaiName !== (product.thaiName || '') ||
                    edited.measurementType !== (product.measurementType || 'kg') ||
                    Number(edited.unitSize || 1) !== Number(product.unitSize || 1)
                  );

                  return (
                    <tr key={product.id} className={hasProductChanges ? 'bg-blue-50' : ''}>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {product.images && product.images.length > 0 ? (
                          <img
                            src={product.images[0]}
                            alt={product.name}
                            className="h-12 w-12 object-cover rounded"
                          />
                        ) : (
                          <div className="h-12 w-12 bg-gray-200 rounded flex items-center justify-center">
                            <span className="text-gray-400 text-xs">אין</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-sm font-medium text-gray-900">{product.name}</div>
                        {product.options && product.options.length > 0 && (
                          <div className="text-xs text-gray-500 mt-1">
                            {product.options.join(', ')}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={edited.price}
                          onChange={(e) => handleFieldChange(product.id, 'price', e.target.value)}
                          className="w-24 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={edited.merchantPrice}
                          onChange={(e) => handleFieldChange(product.id, 'merchantPrice', e.target.value)}
                          placeholder="אופציונלי"
                          className="w-24 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <input
                          type="number"
                          min="0"
                          value={edited.stockAmount}
                          onChange={(e) => handleFieldChange(product.id, 'stockAmount', e.target.value)}
                          className="w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <select
                          value={edited.category}
                          onChange={(e) => handleFieldChange(product.id, 'category', e.target.value)}
                          className="w-28 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        >
                          <option value="">ללא קטגוריה</option>
                          <option value="ירקות">ירקות</option>
                          <option value="פירות">פירות</option>
                          <option value="ירוקים">ירוקים</option>
                          <option value="אחר">אחר</option>
                        </select>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <select
                          value={edited.measurementType}
                          onChange={(e) => {
                            handleFieldChange(product.id, 'measurementType', e.target.value);
                            // Reset unitSize to 1 when switching to unit
                            if (e.target.value === 'unit') {
                              handleFieldChange(product.id, 'unitSize', '1');
                            }
                          }}
                          className="w-24 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        >
                          <option value="kg">ק"ג</option>
                          <option value="unit">יחידה</option>
                        </select>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {edited.measurementType === 'kg' ? (
                          <select
                            value={edited.unitSize || '1'}
                            onChange={(e) => handleFieldChange(product.id, 'unitSize', e.target.value)}
                            className="w-24 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          >
                            {UNIT_SIZE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      {!isIndependent && (
                        <td className="px-4 py-4 whitespace-nowrap">
                          <input
                            type="text"
                            value={edited.thaiName}
                            onChange={(e) => handleFieldChange(product.id, 'thaiName', e.target.value)}
                            placeholder="ชื่อภาษาไทย"
                            className="w-32 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          />
                        </td>
                      )}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-700">
                          {product.vatType === 1 ? 'מע"מ רגיל' : 
                          //  product.vatType === 2 ? 'מע"מ רגיל0%' : 
                           product.vatType === 3 ? 'פטור ממע"מ' : 
                           `סוג ${product.vatType ?? 3}`}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {hasProductChanges ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            <svg className="w-3 h-3 ml-1" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
                            </svg>
                            שונה
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            ללא שינוי
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Summary Footer */}
      {products.length > 0 && (
        <div className="mt-4 bg-gray-50 rounded-lg p-4 border border-gray-200">
          <div className="flex items-center justify-between text-sm">
            <div className="text-gray-600">
              סה"כ מוצרים: <span className="font-semibold text-gray-900">{products.length}</span>
            </div>
            {hasChanges() && (
              <div className="text-blue-600 font-medium">
                יש שינויים שטרם נשמרו
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default BulkEditProducts;
