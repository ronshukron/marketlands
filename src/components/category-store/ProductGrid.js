import React from 'react';
import ProductCard from './ProductCard';

const ProductGrid = ({ products, calculateTimeRemaining, selectedCommunity }) => {
  if (products.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-xl shadow-sm">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
        <h3 className="text-lg font-medium text-gray-900 mb-2">אין מוצרים זמינים בקטגוריה זו</h3>
        <p className="text-gray-600">נסה לבחור קטגוריה אחרת או חזור מאוחר יותר</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {products.map((product) => (
        <ProductCard 
          key={product.uid} 
          product={product}
          calculateTimeRemaining={calculateTimeRemaining}
          selectedCommunity={selectedCommunity}
        />
      ))}
    </div>
  );
};

export default ProductGrid;

