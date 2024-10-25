// src/components/ProductDetails.js

import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import './ProductDetail.css';

const ProductDetail = () => {
  const { productId } = useParams();
  const [productData, setProductData] = useState(null);
  const [selectedImage, setSelectedImage] = useState('');

  useEffect(() => {
    const fetchProductData = async () => {
      try {
        const productDocRef = doc(db, 'Products', productId);
        const productSnap = await getDoc(productDocRef);
        if (productSnap.exists()) {
          const data = productSnap.data();
          setProductData(data);
          setSelectedImage(data.images?.[0] || '');
        } else {
          console.error('Product not found');
        }
      } catch (error) {
        console.error('Error fetching product data:', error);
      }
    };

    fetchProductData();
  }, [productId]);

  const handleImageClick = (imageUrl) => {
    setSelectedImage(imageUrl);
  };

  if (!productData) {
    return <div>טוען...</div>;
  }

  return (
    <div className="product-details-container">
      <div className="product-details-image-section">
        <img
          src={selectedImage}
          alt={productData.name}
          className="product-details-main-image"
        />
        <div className="product-details-thumbnail-row">
          {productData.images?.map((image, index) => (
            <img
              key={index}
              src={image}
              alt={`${productData.name} thumbnail ${index + 1}`}
              className={`product-details-thumbnail ${
                selectedImage === image ? 'selected' : ''
              }`}
              onClick={() => handleImageClick(image)}
            />
          ))}
        </div>
      </div>
      <div className="product-details-info-section">
        <h1 className="product-details-title">{productData.name}</h1>
        <p className="product-details-price">₪{productData.price}</p>
        <p className="product-details-description">{productData.description}</p>
        {productData.options && (
          <div className="product-details-options">
            <h3>אופציות:</h3>
            <ul>
              {productData.options.map((option, index) => (
                <li key={index}>{option}</li>
              ))}
            </ul>
          </div>
        )}
        {/* <button className="product-details-add-to-cart-button">
          Add to Cart
        </button> */}
      </div>
    </div>
  );
};

export default ProductDetail;
