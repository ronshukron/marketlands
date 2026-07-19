import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/authContext';
import { db, storage } from '../../firebase/firebase'; // Correct storage import
import { collection, addDoc, doc, getDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'; // Import necessary storage methods
import { useNavigate } from 'react-router-dom';
import './AddProduct.css';
import Swal from 'sweetalert2';
import LoadingSpinner from '../LoadingSpinner';
import axios from 'axios'; // Add this import at the top


const AddProduct = () => {
  const { currentUser } = useAuth();
  const [productName, setProductName] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [options, setOptions] = useState([]);
  const [currentOption, setCurrentOption] = useState('');
  const [images, setImages] = useState([]); // Store image URLs here
  const [selectedFiles, setSelectedFiles] = useState([]); // Store selected files
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [stockAmount, setStockAmount] = useState(0);
  const [vatType, setVatType] = useState(3);
  const [merchantPrice, setMerchantPrice] = useState('');
  const [thaiName, setThaiName] = useState('');
  const [measurementType, setMeasurementType] = useState('kg'); // 'kg', 'unit', or 'package'
  const [unitSize, setUnitSize] = useState('1'); // kg per cart click (only for measurementType === 'kg')
  const [averageWeightKg, setAverageWeightKg] = useState('1'); // For 'unit' items: estimated kg per unit
  const [isIndependent, setIsIndependent] = useState(false);
  const [isSample, setIsSample] = useState(false);
  const [category, setCategory] = useState('');
  const [showInAllCategory, setShowInAllCategory] = useState(false);

  // Predefined unit size options (in kg)
  const UNIT_SIZE_OPTIONS = [
    { value: '0.1', label: '100 גרם (0.1 ק"ג)' },
    { value: '0.25', label: '250 גרם (0.25 ק"ג)' },
    { value: '0.5', label: 'חצי קילו (0.5 ק"ג)' },
    { value: '0.65', label: '0.65 ק"ג' },
    { value: '0.75', label: '750 גרם (0.75 ק"ג)' },
    { value: '1', label: '1 ק"ג' },
    { value: '1.2', label: '1.2 ק"ג' },
    { value: '1.5', label: '1.5 ק"ג' },
    { value: '2', label: '2 ק"ג' },
    { value: '2.5', label: '2.5 ק"ג' },
    { value: '3', label: '3 ק"ג' },
    { value: '5', label: '5 ק"ג' },
    { value: '10', label: '10 ק"ג' },
  ];

  // Whether the user is entering a custom (free-typed) kg value
  const [isCustomUnitSize, setIsCustomUnitSize] = useState(false);

  // Fetch isIndependent status
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

  const handleAddOption = () => {
    if (currentOption.trim() !== '') {
      setOptions([...options, currentOption]);
      setCurrentOption('');
    }
  };

  const handleRemoveOption = (index) => {
    const newOptions = [...options];
    newOptions.splice(index, 1);
    setOptions(newOptions);
  };

  const handleImageUpload = (files) => {
    const fileArray = Array.from(files);
    setSelectedFiles([...selectedFiles, ...fileArray]);
  };

  const handleRemoveImage = (index) => {
    const newFiles = [...selectedFiles];
    newFiles.splice(index, 1);
    setSelectedFiles(newFiles);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    setSelectedFiles([...selectedFiles, ...droppedFiles]);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    if (name === 'stockAmount') {
      const numValue = parseInt(value, 10);
      setStockAmount(isNaN(numValue) ? 0 : numValue);
    } else {
      if (name === 'productName') {
        setProductName(value);
      } else if (name === 'price') {
        setPrice(value);
      } else if (name === 'description') {
        setDescription(value);
      } else if (name === 'options') {
        setOptions(value.split(',').map(option => option.trim()));
      } else if (name === 'currentOption') {
        setCurrentOption(value);
      } else if (name === 'stockAmount') {
        setStockAmount(parseInt(value, 10));
      } else if (name === 'merchantPrice') {
        setMerchantPrice(value);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    // Validate inputs
    if (!productName || !price) {
      setLoading(false);
      Swal.fire({
        icon: 'error',
        title: 'מידע חסר',
        text: 'אנא מלא את כל השדות הנדרשים',
      });
      return;
    }

    try {
      // Upload images and get their URLs
      const imagePromises = selectedFiles.map(async (file) => {
        const storageRef = ref(storage, `products/${currentUser.uid}/${Date.now()}_${file.name}`);
        const uploadTask = uploadBytesResumable(storageRef, file);

        return new Promise((resolve, reject) => {
          uploadTask.on(
            'state_changed',
            (snapshot) => {
              // Progress monitoring if needed
            },
            (error) => {
              reject(error);
            },
            async () => {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              resolve(downloadURL);
            }
          );
        });
      });

      const imageUrls = await Promise.all(imagePromises);

      // If no options are provided, add a default option
      const productOptions = options.length > 0 ? options : ["ללא אופציות"];


            // Call the backend function to create the product with catalog number
      // Prod Environment
      const response = await axios.post('https://us-central1-auth-development-323c3.cloudfunctions.net/returnCatalogNumber', {
        // Test Environment  
        // const response = await axios.post('http://127.0.0.1:5001/auth-development-323c3/us-central1/returnCatalogNumber', {
          headers: {
            'Content-Type': 'application/json'
          }
        });
  
        if (response.data.success) {
          setLoading(false);}

      // Prepare the product data for the backend
      const productData = {
        name: productName,
        price: parseFloat(price),
        description: description,
        options: productOptions,
        images: imageUrls,
        stockAmount: stockAmount,
        Owner_ID: currentUser.uid,
        Owner_Email: currentUser.email,
        createdAt: new Date(),
        catalogNumber: response.data.catalogNumber,
        vatType: Number(vatType),
        measurementType: measurementType, // 'kg', 'unit', or 'package'
        // unitSize: kg per cart click. Only meaningful for kg items, but stored always (default 1).
        unitSize: measurementType === 'kg' ? parseFloat(unitSize) : 1,
        // averageWeightKg: estimated kg per unit for unit-based weighed products.
        averageWeightKg: measurementType === 'unit'
          ? (() => {
              const parsed = parseFloat(averageWeightKg);
              return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
            })()
          : 1,
        ...(merchantPrice !== '' ? { merchantPrice: parseFloat(merchantPrice) } : {}),
        ...(thaiName !== '' ? { thaiName: thaiName } : {}),
        ...(category !== '' ? { category } : {}),
        showInAllCategory: category === 'משתלה' ? showInAllCategory : false,
        verified: false,
        rejected: false,
        isSample: isSample || parseFloat(price) === 0,
      };

      await addDoc(collection(db, 'Products'), productData);
      
      setLoading(false);

      // Show success message
      Swal.fire({
        icon: 'success',
        title: 'המוצר נוסף בהצלחה',
        text: 'המוצר נוסף לחנות שלך בהצלחה!',
      }).then(() => {
        navigate('/Business-Products');
      });

    } catch (error) {
      setLoading(false);
      console.error('Error adding product:', error);
      Swal.fire({
        icon: 'error',
        title: 'שגיאה',
        text: 'אירעה שגיאה בעת הוספת המוצר.',
      });
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div dir="rtl" className="max-w-4xl mx-auto p-4 md:p-6 lg:p-8 bg-gray-50 min-h-screen">
      <div className="bg-white rounded-xl shadow-md p-6 md:p-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">הוסף מוצר חדש</h2>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Product Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">שם המוצר *</label>
            <input
              type="text"
              value={productName}
              onChange={handleInputChange}
              name="productName"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="הזן את שם המוצר"
            />
          </div>

          {/* Price and Stock Amount in the same row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Price field */}
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2" htmlFor="price">
                {measurementType === 'kg' ? 'מחיר לק"ג' : measurementType === 'unit' ? 'מחיר לק"ג' : 'מחיר למארז'} <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  id="price"
                  name="price"
                  className="block w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="הכנס מחיר"
                  value={price}
                  onChange={handleInputChange}
                  required
                  min="0"
                  step="0.01"
                />
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-gray-500">₪</span>
                </div>
              </div>
            </div>
            
            {/* Stock Amount field */}
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2" htmlFor="stockAmount">
                כמות במלאי
              </label>
              <input
                type="number"
                id="stockAmount"
                name="stockAmount"
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="כמות זמינה במלאי"
                value={stockAmount}
                onChange={handleInputChange}
                min="0"
                step="1"
              />
              </div>
            </div>

          <label className="flex items-center gap-2 mb-4">
            <input
              type="checkbox"
              checked={isSample}
              onChange={(e) => setIsSample(e.target.checked)}
            />
            <span className="text-sm text-gray-700">דגימה בחינם (מוצג כתגית באתר; מחיר 0 מאפשר הזמנה ללא תשלום)</span>
          </label>

          {/* Category */}
          <div className="mb-4">
            <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
              קטגוריה
            </label>
            <select
              id="category"
              name="category"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={category}
              onChange={(e) => {
                const nextCategory = e.target.value;
                setCategory(nextCategory);
                if (nextCategory !== 'משתלה') {
                  setShowInAllCategory(false);
                }
              }}
            >
              <option value="">בחר קטגוריה (אופציונלי)</option>
              <option value="ירקות">ירקות</option>
              <option value="פירות">פירות</option>
              <option value="ירוקים">ירוקים</option>
              <option value="משתלה">משתלה</option>
              <option value="אחר">אחר</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">בחירת קטגוריה תאפשר למוצר להופיע בתצוגת הקטגוריות בחנות</p>
          </div>

          {category === 'משתלה' && (
            <div className="mb-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showInAllCategory}
                  onChange={(e) => setShowInAllCategory(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">הצג גם בקטגוריית &quot;הכל&quot;</span>
              </label>
              <p className="mt-1 text-xs text-gray-500 mr-6">
                מוצרי משתלה מוצגים רק בקטגוריית משתלה, אלא אם מסומן כאן
              </p>
            </div>
          )}

          {/* Merchant Price (optional) */}
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-medium mb-2" htmlFor="merchantPrice">
              מחיר לסיטונאי/סוחר (אופציונלי)
            </label>
            <div className="relative max-w-md">
              <input
                type="number"
                id="merchantPrice"
                name="merchantPrice"
                className="block w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="הכנס מחיר סוחר"
                value={merchantPrice}
                onChange={(e) => setMerchantPrice(e.target.value)}
                min="0"
                step="0.01"
              />
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="text-gray-500">₪</span>
              </div>
            </div>
            <p className="mt-1 text-xs text-gray-500">אם יוגדר, יוצג לסוחרים בלבד.</p>
          </div>

          {/* VAT Type */}
          <div>
            <label className="block text-gray-700 text-sm font-medium mb-2" htmlFor="vatType">
              סוג מע"מ
            </label>
            <select
              id="vatType"
              name="vatType"
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              value={vatType}
              onChange={(e) => setVatType(parseInt(e.target.value, 10))}
            >
              <option value={3}>פטור ממע"מ (פירות/ירקות לא מעובדים)</option>
              <option value={1}>חייב במע"מ (למשל דבש/משלוח/מוצרים מעובדים)</option>
            </select>
          </div>

          {/* Measurement Type */}
          <div>
            <label className="block text-gray-700 text-sm font-medium mb-2" htmlFor="measurementType">
              נמדד לפי
            </label>
            <select
              id="measurementType"
              name="measurementType"
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              value={measurementType}
              onChange={(e) => {
                setMeasurementType(e.target.value);
                // Reset unitSize to 1 when switching away from kg
                if (e.target.value !== 'kg') {
                  setUnitSize('1');
                  setIsCustomUnitSize(false);
                }
                // Reset average weight when switching away from unit
                if (e.target.value !== 'unit') {
                  setAverageWeightKg('1');
                }
              }}
            >
              <option value="kg">ק"ג (משקל)</option>
              <option value="unit">יחידה (נשקל) - למשל אבטיח, מלון</option>
              <option value="package">מארז (מחיר קבוע) - למשל חסה, צרור</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              {measurementType === 'kg' 
                ? 'המוצר יישקל ביום המשלוח והחיוב יהיה לפי המשקל בפועל.'
                : measurementType === 'unit'
                ? 'הלקוח מזמין יחידות (1,2,3...) אבל החיוב לפי משקל בפועל - מתאים לפירות/ירקות שנמכרים ביחידה.'
                : 'המוצר נמכר במארזים/צרורות במחיר קבוע - לא יישקל, רק ייספר.'}
            </p>
          </div>

          {/* Unit Size - Only for kg items */}
          {measurementType === 'kg' && (
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2" htmlFor="unitSize">
                כמות לכל לחיצה בעגלה
              </label>
              <select
                id="unitSize"
                name="unitSize"
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                value={isCustomUnitSize ? 'custom' : unitSize}
                onChange={(e) => {
                  if (e.target.value === 'custom') {
                    setIsCustomUnitSize(true);
                  } else {
                    setIsCustomUnitSize(false);
                    setUnitSize(e.target.value);
                  }
                }}
              >
                {UNIT_SIZE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
                <option value="custom">מותאם אישית (הזן ק"ג)</option>
              </select>
              {isCustomUnitSize && (
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={unitSize}
                  onChange={(e) => setUnitSize(e.target.value)}
                  placeholder='הזן כמות בק"ג, למשל 0.65'
                  className="mt-2 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              )}
              <p className="mt-1 text-xs text-gray-500">
                כמה ק"ג יתווספו לעגלה בכל לחיצה. לדוגמה: אם הלקוח לוחץ "+" והגדרת 0.5 ק"ג, יתווסף חצי קילו.
              </p>
              {price && unitSize && (
                <p className="mt-2 text-sm text-blue-600 bg-blue-50 p-2 rounded">
                  💡 מחיר ללקוח לכל לחיצה: <strong>₪{(parseFloat(price) * parseFloat(unitSize)).toFixed(2)}</strong>
                  {' '}({unitSize} ק"ג × ₪{parseFloat(price).toFixed(2)}/ק"ג)
                </p>
              )}
            </div>
          )}

          {/* Average Weight - Only for unit items */}
          {measurementType === 'unit' && (
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2" htmlFor="averageWeightKg">
                משקל ממוצע ליחידה (ק"ג)
              </label>
              <input
                id="averageWeightKg"
                name="averageWeightKg"
                type="number"
                min="0.01"
                step="0.01"
                value={averageWeightKg}
                onChange={(e) => setAverageWeightKg(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                הערכה לחיוב צפוי ללקוח. לדוגמה: אם אבטיח ממוצע שוקל 2 ק"ג - הזן 2.
              </p>
              {price && averageWeightKg && (
                <p className="mt-2 text-sm text-blue-600 bg-blue-50 p-2 rounded">
                  מחיר משוער ליחידה ללקוח: <strong>₪{(parseFloat(price) * parseFloat(averageWeightKg)).toFixed(2)}</strong>
                  {' '}({averageWeightKg} ק"ג × ₪{parseFloat(price).toFixed(2)}/ק"ג)
                </p>
              )}
            </div>
          )}

          {/* Thai Name - Only for non-independent farmers */}
          {!isIndependent && (
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2" htmlFor="thaiName">
                ชื่อภาษาไทย (Thai Name)
              </label>
              <input
                type="text"
                id="thaiName"
                name="thaiName"
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="ใส่ชื่อผลิตภัณฑ์เป็นภาษาไทย"
                value={thaiName}
                onChange={(e) => setThaiName(e.target.value)}
              />
              <p className="mt-1 text-xs text-gray-500">שדה זה יעזור לעובדים התאילנדיים להכין את הארגזים</p>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">תיאור המוצר</label>
            <textarea
              value={description}
              onChange={handleInputChange}
              name="description"
              rows="4"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="הוסף תיאור מפורט של המוצר"
            />
          </div>

          {/* Options */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              אופציות
              <span className="text-xs text-gray-500 mr-1">(אם אין אופציות, יתווסף "ללא אופציות" אוטומטית)</span>
            </label>
            
            <div className="space-y-2 mb-2">
              {options.map((option, index) => (
                <div key={index} className="flex items-center p-2 bg-gray-50 rounded-md">
                  <span className="flex-grow">{option}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveOption(index)}
                    className="text-red-500 hover:text-red-700 transition-colors p-1 rounded-full hover:bg-red-50"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
            
            <div className="flex mt-2">
              <input
                type="text"
                value={currentOption}
                placeholder="הכנס אופציה חדשה"
                onChange={handleInputChange}
                name="currentOption"
                className="flex-grow px-3 py-2 border border-gray-300 rounded-r-none rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                type="button"
                onClick={handleAddOption}
                className="bg-blue-500 text-white px-4 py-2 rounded-l-md hover:bg-blue-600 transition-colors"
              >
                הוסף
              </button>
            </div>
          </div>

          {/* Image Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">תמונות המוצר</label>
            
            <div className="mb-3">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => handleImageUpload(e.target.files)}
                className="hidden"
                id="image-upload"
              />
              <label 
                htmlFor="image-upload" 
                className="inline-block bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded-md cursor-pointer transition-colors text-sm text-gray-700"
              >
                בחר תמונות
              </label>
            </div>
            
            <div 
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="mt-2 text-sm text-gray-600">גרור ושחרר תמונות כאן או לחץ לבחירה</p>
              <p className="mt-1 text-xs text-gray-500">PNG, JPG, GIF עד 10MB</p>
            </div>
            
            {/* Selected Files Preview */}
            {selectedFiles.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">תמונות שנבחרו ({selectedFiles.length})</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="relative group">
                      <div className="aspect-w-1 aspect-h-1 w-full overflow-hidden rounded-md bg-gray-200">
                        <img 
                          src={URL.createObjectURL(file)} 
                          alt={`Preview ${index}`} 
                          className="h-full w-full object-cover object-center"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(index)}
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                      <p className="mt-1 text-xs text-gray-500 truncate">{file.name}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Submit Button */}
          <div className="pt-4">
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md shadow-sm transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              הוסף מוצר
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddProduct;
