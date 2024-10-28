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

    if (selectedFiles.length < 2) {
      Swal.fire({
        icon: 'error',
        title: 'שגיאה',
        text: 'אנא העלה לפחות שתי תמונות עבור המוצר.',
      });
      setLoading(false); // Stop loading spinner if there's an error
      return;
    }

    try {
      // Upload all selected files to Firebase Storage
      const imageUrls = await Promise.all(
        selectedFiles.map(async (file) => {
          const storageRef = ref(storage, `products/${currentUser.uid}/${Date.now()}_${file.name}`);
          const uploadTask = uploadBytesResumable(storageRef, file);

          await new Promise((resolve, reject) => {
            uploadTask.on(
              'state_changed',
              null,
              reject,
              () => resolve() // Wait for each file to finish uploading
            );
          });

          const downloadURL = await getDownloadURL(storageRef);
          return downloadURL;
        })
      );

      // Save the product with image URLs
      await addDoc(collection(db, 'Products'), {
        name: productName,
        price: parseFloat(price),
        description,
        options,
        images: imageUrls, // Store URLs in Firestore
        Owner_Email: currentUser.email,
        Owner_ID: currentUser.uid,
        createdAt: new Date(),
      });

      Swal.fire({
        icon: 'success',
        title: 'מוצר נוסף בהצלחה',
        showConfirmButton: false,
        timer: 2000,
      });
      setLoading(false);
      navigate('/Business-Products');
    } catch (error) {
      console.error('Error adding product:', error);
      Swal.fire({
        icon: 'error',
        title: 'שגיאה',
        text: 'אירעה שגיאה בעת הוספת המוצר. נסה שוב מאוחר יותר.',
      });
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    handleImageUpload(files);
  };

  if (loading) {
    return <LoadingSpinner />;
 }

  return (
    <div className="add-product-container">
      <h1 className="add-product-header">הוסף מוצר חדש</h1>
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

        <label>הוסף תמונות:</label>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleImageUpload(e.target.files)}
        />

        <div
          className="drop-area"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          גרור ושחרר תמונות כאן
        </div>

        {selectedFiles.map((file, index) => (
          <div key={index} className="file-display">
            <span>{file.name}</span>
            <button type="button" onClick={() => handleRemoveImage(index)}>
              הסר
            </button>
          </div>
        ))}

        <button type="submit" className="submit-button">
          הוסף מוצר
        </button>
      </form>
    </div>
  );
};

export default AddProduct;
