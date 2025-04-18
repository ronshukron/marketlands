import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db, storage } from '../../firebase/firebase'; 
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage'; // Added deleteObject for image deletion
import { useAuth } from '../../contexts/authContext'; // Import useAuth to get currentUser
import Swal from 'sweetalert2';
import LoadingSpinner from '../LoadingSpinner';
import './AddProduct.css';

const EditProduct = () => {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth(); // Get currentUser from auth context
  const [productName, setProductName] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [options, setOptions] = useState([]);
  const [currentOption, setCurrentOption] = useState('');
  const [images, setImages] = useState([]); // Store existing images
  const [selectedFiles, setSelectedFiles] = useState([]); // Store new image files
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    category: '',
    options: [],
    tags: [],
    stockAmount: 0,
  });

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        setLoading(true);
        const docRef = doc(db, "Products", productId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          setProductName(data.name);
          setPrice(data.price);
          setDescription(data.description);
          setOptions(data.options || []);

          setFormData({
            name: data.name || '',
            description: data.description || '',
            price: data.price ? data.price.toString() : '',
            category: data.category || '',
            options: data.options || [],
            tags: data.tags || [],
            stockAmount: data.stockAmount || 0,
          });
          
          // Set existing images if available
          if (data.images) {
            setImages(data.images);
          }
        } else {
          console.log("No such document!");
          navigate('/dashboard');
        }
      } catch (error) {
        console.error("Error fetching product:", error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchProduct();
  }, [productId, navigate]);

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

  const createPreviewURL = (file) => {
    return URL.createObjectURL(file);
  };

  useEffect(() => {
    return () => {
      // Clean up any created object URLs
      selectedFiles.forEach(file => {
        if (file.preview) URL.revokeObjectURL(file.preview);
      });
    };
  }, [selectedFiles]);

  const handleImageUpload = (files) => {
    const fileArray = Array.from(files).map(file => {
      // Create a preview URL for each file
      file.preview = URL.createObjectURL(file);
      return file;
    });
    setSelectedFiles([...selectedFiles, ...fileArray]);
  };

  const handleRemoveNewImage = (index) => {
    const newFiles = [...selectedFiles];
    newFiles.splice(index, 1);
    setSelectedFiles(newFiles);
  };

  const handleRemoveExistingImage = async (index) => {
    const imageToRemove = images[index];
  
    // Remove the image from Firebase Storage
    const storageRef = ref(storage, imageToRemove); // imageToRemove is the full download URL
    try {
      await deleteObject(storageRef); // Delete the image from Firebase Storage
      const newImages = [...images];
      newImages.splice(index, 1); // Remove from local state
  
      // Update Firestore with the new images array
      await updateDoc(doc(db, 'Products', productId), {
        images: newImages,
      });
  
      setImages(newImages); // Update state after deletion
      Swal.fire({
        icon: 'success',
        title: 'התמונה הוסרה בהצלחה',
        showConfirmButton: false,
        timer: 1500,
      });
    } catch (error) {
      console.error('Error removing image:', error);
      Swal.fire({
        icon: 'error',
        title: 'שגיאה',
        text: 'אירעה שגיאה בעת הסרת התמונה. נסה שוב מאוחר יותר.',
      });
    }
  };

const handleSubmit = async (e) => {
  e.preventDefault();
  
  // Check if there's at least one option
  if (options.length === 0) {
    Swal.fire({
      icon: 'error',
      title: 'שגיאה',
      text: 'יש להוסיף לפחות אופציה אחת למוצר.',
    });
    return;
  }
  
  setLoading(true);

  if (!productName || !price || isNaN(price)) {
    Swal.fire({
      icon: 'error',
      title: 'שגיאה',
      text: 'אנא מלא את כל השדות הנדרשים עם ערכים תקינים.',
    });
    return;
  }

  // if (images.length + selectedFiles.length < 2) {
  //   Swal.fire({
  //     icon: 'error',
  //     title: 'שגיאה',
  //     text: 'אנא העלה לפחות שתי תמונות עבור המוצר.',
  //   });
  //   setLoading(false);
  //   return;
  // }

  try {
    // Upload new files to Firebase Storage if any
    const newImageUrls = await Promise.all(
      selectedFiles.map(async (file) => {
        const storageRef = ref(storage, `products/${currentUser.uid}/${Date.now()}_${file.name}`);
        const uploadTask = uploadBytesResumable(storageRef, file);

        await new Promise((resolve, reject) => {
          uploadTask.on(
            'state_changed',
            null,
            reject,
            () => resolve()
          );
        });

        const downloadURL = await getDownloadURL(storageRef);
        return downloadURL;
      })
    );

    // Combine old and new image URLs
    const updatedImages = [...images, ...newImageUrls];

    // Update the product document in Firestore
    await updateDoc(doc(db, 'Products', productId), {
      name: productName,
      price: parseFloat(price),
      description,
      options,
      images: updatedImages, // Update the Firestore with the new images array
      stockAmount: formData.stockAmount, // Include stock amount
    });

    Swal.fire({
      icon: 'success',
      title: 'המוצר עודכן בהצלחה',
      showConfirmButton: false,
      timer: 2000,
    });
    setLoading(false);
    navigate('/Business-Products');
  } catch (error) {
    console.error('Error updating product:', error);
    Swal.fire({
      icon: 'error',
      title: 'שגיאה',
      text: 'אירעה שגיאה בעת עדכון המוצר. נסה שוב מאוחר יותר.',
    });
  }
};

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div dir="rtl" className="max-w-3xl mx-auto px-4 py-8">
      <div className="bg-white rounded-xl shadow-md p-6 md:p-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-6 text-center">עריכת מוצר</h1>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Product Name */}
          <div>
            <label htmlFor="productName" className="block text-sm font-medium text-gray-700 mb-1">
              שם המוצר <span className="text-red-500">*</span>
            </label>
            <input
              id="productName"
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="שם המוצר"
            />
          </div>
          
          {/* Price */}
          <div>
            <label htmlFor="price" className="block text-sm font-medium text-gray-700 mb-1">
              מחיר (₪) <span className="text-red-500">*</span>
            </label>
            <input
              id="price"
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="מחיר (₪)"
            />
          </div>
          
          {/* After the price field */}
          <div className="mb-4">
            <label htmlFor="stockAmount" className="block text-sm font-medium text-gray-700 mb-1">
              כמות במלאי
            </label>
            <input
              type="number"
              id="stockAmount"
              min="0"
              value={formData.stockAmount}
              onChange={(e) => 
                setFormData({
                  ...formData,
                  stockAmount: parseInt(e.target.value) || 0
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="הזן את כמות המלאי"
            />
            <p className="mt-1 text-xs text-gray-500">0 משמעותו מוצר אזל מהמלאי</p>
          </div>
          
          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              תיאור המוצר
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows="4"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="תיאור מפורט של המוצר"
            ></textarea>
          </div>
          
          {/* Options */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              אופציות <span className="text-red-500">*</span>
              <span className="text-xs text-gray-500 font-normal mr-2">
                (יש להוסיף לפחות אופציה אחת)
              </span>
            </label>
            
            {/* Current Options */}
            <div className="mb-3">
              {options.length > 0 ? (
                <div className="flex flex-wrap gap-2 mb-3">
                  {options.map((option, index) => (
                    <div key={index} className="bg-gray-100 rounded-full py-1 px-3 flex items-center gap-1 text-sm">
                      <span>{option}</span>
                      <button 
                        type="button" 
                        onClick={() => handleRemoveOption(index)}
                        className="text-gray-400 hover:text-red-500 focus:outline-none ml-1 flex items-center justify-center"
                        aria-label="הסר אופציה"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-red-500 mb-3">אין אופציות עדיין. יש להוסיף לפחות אופציה אחת למוצר.</p>
              )}
            </div>
            
            {/* Add Option */}
            <div className="flex gap-2">
              <input
                type="text"
                value={currentOption}
                onChange={(e) => setCurrentOption(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="הכנס אופציה חדשה"
              />
              <button
                type="button"
                onClick={handleAddOption}
                className="bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
              >
                הוסף
              </button>
            </div>
          </div>
          
          {/* Existing Images */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">תמונות קיימות</label>
            
            {images.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
                {images.map((image, index) => (
                  <div key={index} className="relative group">
                    <img 
                      src={image} 
                      alt={`תמונה ${index + 1}`} 
                      className="w-full h-32 object-cover rounded-lg border border-gray-200"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveExistingImage(index)}
                      className="absolute top-2 right-2 bg-red-500 bg-opacity-90 text-white w-8 h-8 flex items-center justify-center rounded-full shadow-sm hover:bg-opacity-100 transition-colors"
                      title="הסר תמונה"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 mb-4">אין תמונות קיימות למוצר זה.</p>
            )}
          </div>
          
          {/* Upload New Images */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">הוסף תמונות חדשות</label>
            
            <div className="border-2 border-dashed border-gray-300 rounded-md p-6 text-center">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => handleImageUpload(e.target.files)}
                className="hidden"
                id="image-upload"
              />
              <label htmlFor="image-upload" className="cursor-pointer">
                <div className="space-y-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-sm text-gray-600">לחץ להעלאת תמונות או גרור לכאן</p>
                </div>
              </label>
            </div>
            
            {/* Selected Files */}
            {selectedFiles.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">תמונות נבחרות ({selectedFiles.length})</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="relative group">
                      <div className="aspect-square w-full h-32 overflow-hidden rounded-lg border border-gray-200">
                        <img 
                          src={file.preview} 
                          alt={file.name}
                          className="w-full h-full object-cover" 
                        />
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white p-1 text-xs truncate">
                        {file.name}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveNewImage(index)}
                        className="absolute top-2 right-2 bg-red-500 bg-opacity-90 text-white w-7 h-7 flex items-center justify-center rounded-full shadow-sm hover:bg-opacity-100 transition-colors"
                        title="הסר תמונה"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          {/* Submit Button */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => navigate('/Business-Products')}
              className="mr-4 px-5 py-2 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              ביטול
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              עדכן מוצר
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditProduct;
