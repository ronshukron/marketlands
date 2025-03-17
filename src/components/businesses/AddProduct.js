import React, { useState } from 'react';
import { useAuth } from '../../contexts/authContext';
import { db, storage } from '../../firebase/firebase'; // Correct storage import
import { collection, addDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'; // Import necessary storage methods
import { useNavigate } from 'react-router-dom';
import './AddProduct.css';
import Swal from 'sweetalert2';
import LoadingSpinner from '../LoadingSpinner';


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

      // Create the product in Firestore
      const productData = {
        name: productName,
        price: parseFloat(price),
        description: description,
        options: productOptions,
        images: imageUrls,
        Owner_ID: currentUser.uid,
        Owner_Email: currentUser.email,
        createdAt: new Date(),
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
              onChange={(e) => setProductName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="הזן את שם המוצר"
            />
          </div>

          {/* Price */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">מחיר (₪) *</label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              step="0.01"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="הזן את מחיר המוצר"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">תיאור המוצר</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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
                onChange={(e) => setCurrentOption(e.target.value)}
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
