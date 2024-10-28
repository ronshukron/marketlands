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

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        const productDoc = await getDoc(doc(db, 'Products', productId));
        if (productDoc.exists()) {
          const productData = productDoc.data();
          setProductName(productData.name);
          setPrice(productData.price);
          setDescription(productData.description);
          setOptions(productData.options || []);
          setImages(productData.images || []); // Set existing images from Firestore
        }
      } catch (error) {
        console.error('Error fetching product:', error);
      }
    };

    fetchProduct();
  }, [productId]);

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
  setLoading(true);

  if (!productName || !price || isNaN(price)) {
    Swal.fire({
      icon: 'error',
      title: 'שגיאה',
      text: 'אנא מלא את כל השדות הנדרשים עם ערכים תקינים.',
    });
    return;
  }

  if (images.length + selectedFiles.length < 2) {
    Swal.fire({
      icon: 'error',
      title: 'שגיאה',
      text: 'אנא העלה לפחות שתי תמונות עבור המוצר.',
    });
    setLoading(false);
    return;
  }

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
    <div className="add-product-container">
      <h1 className="add-product-header">ערוך מוצר</h1>
      <form onSubmit={handleSubmit} className="add-product-form">
        <label>
          <input
            type="text"
            value={productName}
            placeholder="שם המוצר"
            onChange={(e) => setProductName(e.target.value)}
            required
          />
        </label>

        <label>
          <input
            type="number"
            step="0.01"
            value={price}
            placeholder="מחיר (₪)"
            onChange={(e) => setPrice(e.target.value)}
            required
          />
        </label>

        <label>
          <textarea
            value={description}
            placeholder="תיאור:"
            onChange={(e) => setDescription(e.target.value)}
          ></textarea>
        </label>

        <label>אופציות:</label>
        {options.map((option, index) => (
          <div key={index} className="option-display">
            <button type="button" className="remove-button" onClick={() => handleRemoveOption(index)}>
              X
            </button>
            <span>{option}</span>
          </div>
        ))}

        <div className="option-input">
          <button type="button" className="regular-button" onClick={handleAddOption}>
            הוסף
          </button>
          <input
            type="text"
            value={currentOption}
            placeholder="הכנס אופציה"
            onChange={(e) => setCurrentOption(e.target.value)}
          />
        </div>

        <label>תמונות קיימות:</label>
        {images.map((image, index) => (
          <div key={index} className="file-display">
            <button type="button" onClick={() => handleRemoveExistingImage(index)}>
              X
            </button>
            <img src={image} alt={`תמונה ${index + 1}`} className="product-image" />
          </div>
        ))}

        <label>הוסף תמונות נוספות:</label>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleImageUpload(e.target.files)}
        />

        {selectedFiles.map((file, index) => (
          <div key={index} className="file-display">
            <span>{file.name}</span>
            <button type="button" onClick={() => handleRemoveNewImage(index)}>
              הסר
            </button>
          </div>
        ))}

        <button type="submit" className="submit-button">
          עדכן מוצר
        </button>
      </form>
    </div>
  );
};

export default EditProduct;
