// src/components/ProductDetail.js
import React from 'react';
import './ProductDetail.css';

const ProductDetail = ({ product }) => {
    return (
        <div className="product-detail">
            <h2>{product.name}</h2>
            <p>{product.description}</p>
            <div className="image-gallery">
                {product.image_urls.map((url, index) => (
                    <img key={index} src={`http://localhost:8000${url}`} alt={`Image ${index + 1} for ${product.name}`} />
                ))}
            </div>
        </div>
    );
};

export default ProductDetail;
