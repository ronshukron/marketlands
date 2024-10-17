import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/authContext';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import './BusinessProducts.css';

const BusinessProducts = () => {
  const { currentUser } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProducts = async () => {
      if (!currentUser) return;
      try {
        const q = query(collection(db, 'Products'), where('Owner_Email', '==', currentUser.email));
        const querySnapshot = await getDocs(q);
        const fetchedProducts = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setProducts(fetchedProducts);
      } catch (error) {
        console.error('Error fetching products:', error);
      }
      setLoading(false);
    };

    fetchProducts();
  }, [currentUser]);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="my-products-container">
      <h1 className="my-products-header">המוצרים שלי</h1>
      <div className="products-list">
        {products.length === 0 ? (
          <p>אין מוצרים להציג</p>
        ) : (
          products.map(product => (
            <div key={product.id} className="product-item">
              <h3>{product.name}</h3>
              <p>מחיר: ₪{product.price}</p>
              <p>תיאור: {product.description}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default BusinessProducts;
