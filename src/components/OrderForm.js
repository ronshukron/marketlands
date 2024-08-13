import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc } from "firebase/firestore"; 
import { db } from '../firebase/firebase'; // Adjust depending on the actual file name and location
import './OrderForm.css';
import LoadingSpinner from './LoadingSpinner';
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import Swal from 'sweetalert2'; // Import SweetAlert2

const OrderForm = () => {
    const { orderId } = useParams();
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [producerInfo, setProducerInfo] = useState({});
    const [userName, setUserName] = useState('');
    const [nameValid, setNameValid] = useState(true);
    const [cartProducts, setCartProducts] = useState([]);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchOrderDetails = async () => {
            const orderDoc = doc(db, "Orders", orderId);
            const docSnap = await getDoc(orderDoc);

            if (docSnap.exists()) {
                fetchProducerDetails(docSnap.data().Producer_ID);
            } else {
                console.log("No such document!");
                navigate('/error');
            }
            setLoading(false);
        };

        fetchOrderDetails();
    }, [orderId, navigate]);

    const fetchProducerDetails = async (producerId) => {
        const producerDoc = doc(db, "Producers", producerId);
        const docSnap = await getDoc(producerDoc);

        if (docSnap.exists()) {
            const producerData = docSnap.data();
            setProducerInfo({
                image: producerData.Image,
                kind: producerData.Kind,
                location: producerData.Location,
                name: producerData.Name
            });
            const extractedProducts = Object.keys(producerData)
                .filter(key => key.startsWith('Product_'))
                .map(key => ({
                    id: key,
                    description: producerData[key].Description,
                    name: producerData[key].Name,
                    price: producerData[key].Price,
                    images: producerData[key].Images,
                    options: producerData[key].Options || []
                }));
            setProducts(extractedProducts.map(product => ({
                ...product,
                selectedOption: "", // Default to empty string for placeholder
                quantity: 0,
                uid: `${product.name}_${Math.random().toString(36).substr(2, 9)}` // Unique identifier for each entry
            })));
        } else {
            console.log("Producer document not found!");
        }
    };

    const handleQuantityChange = (index, increment) => {
        setProducts(products.map((product, i) => {
            if (i === index) {
                return { ...product, quantity: increment ? product.quantity + 1 : Math.max(product.quantity - 1, 0) };
            }
            return product;
        }));
    };

    const handleOptionChange = (index, newOption) => {
        setProducts(products.map((product, i) => {
            if (i === index) {
                return { ...product, selectedOption: newOption };
            }
            return product;
        }));
    };

    const removeFromCart = (uid) => {
        setCartProducts(cartProducts.filter(product => product.uid !== uid));
    };
    

    const addToCart = (productIndex) => {
        const productToAdd = products[productIndex];
        if (productToAdd.selectedOption === "") {
            Swal.fire({
                icon: 'error',
                title: 'בחר אפשרות למוצר',
                text: 'אנא בחר אפשרות לפני הוספה לסל הקניות',
                showConfirmButton: false,
                timer: 3000
            });
            return;
        }
        const newCartProduct = { ...productToAdd, uid: `${productToAdd.name}_${Math.random().toString(36).substr(2, 9)}` };
        if (productToAdd.quantity <= 0) {
            Swal.fire({
                icon: 'error',
                title: 'הוסיפו כמות גדולה מ-0',
                text: '',
                showConfirmButton: false,
                timer: 3000
            });
        } else {
            setCartProducts([
                ...cartProducts,
                newCartProduct
            ]);

            // Reset the quantity for the added product
            setProducts(products.map((product, i) => {
                if (i === productIndex) {
                    return { ...product, quantity: 0 };
                }
                return product;
            }));
            Swal.fire({
                icon: 'success',
                title: 'המוצר נוסף בהצלחה לסל הקניות',
                text: 'תוכלו לראות את כל המוצרים שהוספתם בדף סיכום הזמנה',
                showConfirmButton: false,
                timer: 5500
            });
        }
    };

    const handleSubmitOrder = () => {
        if (cartProducts.length === 0) {
            Swal.fire({
                icon: 'error',
                title: 'הסל שלך ריק',
                text: 'אנא הוסף מוצרים לסל הקניות לפני המעבר לדף הסיכום',
                showConfirmButton: false,
                timer: 3000
            });
            return;
        }
        navigate('/order-confirmation', { state: { cartProducts, userName, orderId } });
    };
    
    if (loading) {
        return <LoadingSpinner />;
    }

    // Slider settings
    const settings = {
        dots: true,
        infinite: true,
        speed: 500,
        slidesToShow: 1,
        slidesToScroll: 1
    };

    return (
        <div className="order-form-container">
            <div className="header-section">
                <h1>טופס הזמנה עבור {producerInfo.name}</h1>
                {producerInfo.image && (
                    <img className="producer-image" src={producerInfo.image} alt={`Image of ${producerInfo.name}`} />
                )}
                <div className="producer-details">
                    <p><strong>סוג:</strong> {producerInfo.kind}</p>
                    <p><strong>מיקום:</strong> {producerInfo.location}</p>
                </div>
            </div>
            <div className="instructions">
                <h4>הסבר שימוש</h4>
                <p>הכנס את שמך-</p>
                <p>בחר מוצר, אופציה וכמות-</p>
                <p>לחץ על הוסף לסל-</p>
                <p>לחץ עבור לסיכום הזמנה-</p>
            </div>
            <div>
            </div>
            {products.map((product, index) => (
                <div key={index} className="product-item">
                    <h3 className="product-name">{product.name}</h3>
                    <p className="product-price">₪{product.price}</p>
                    <p className="product-description">{product.description}</p>
                    {product.images.length > 0 && (
                        <Slider className="slider" {...settings}>
                            {product.images.map((image, idx) => (
                                <div key={idx} className="slider-image-container">
                                    <div className="image-wrapper">
                                        <img src={image} alt={`Image ${idx + 1} for ${product.name}`} className="product-image" />
                                    </div>
                                </div>
                            ))}
                        </Slider>
                    )}
                    {product.options.length > 0 && (
                        <div className="options-dropdown">
                            <select
                                value={product.selectedOption}
                                onChange={(e) => handleOptionChange(index, e.target.value)}
                            >
                                <option value="" disabled>בחר אפשרות</option>
                                {product.options.map((option, idx) => (
                                    <option key={idx} value={option}>{option}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    <div className="quantity-controls">
                        <button onClick={() => handleQuantityChange(index, false)}>-</button>
                        <span>{product.quantity || 0}</span>
                        <button onClick={() => handleQuantityChange(index, true)}>+</button>
                    </div>
                    <div className="button-container">
                        <button className="add-to-cart" onClick={() => addToCart(index)}>הוסף לסל</button>
                    </div>
                </div>
            ))}
            {/* <input
                type="text"
                placeholder="השם שלך"
                value={userName}
                onChange={(e) => {
                    setUserName(e.target.value);
                    if (e.target.value.trim() !== '') {
                        setNameValid(true);
                    }
                }}
                className={`name-input ${!nameValid ? 'invalid' : ''}`}
            /> */}
            <div className="button-container">
                <button onClick={handleSubmitOrder} className="submit-button">עבור לסיכום הזמנה וצפייה בסל הקניות שלך</button>
            </div>
        {/* Floating Cart */}
        <div className="floating-cart">
            <h2>הסל שלי</h2>
            <div className="cart-items">
                {cartProducts.map((product) => (
                    <div key={product.uid} className="cart-item">
                        <span>{product.quantity} x {product.price}₪</span>
                        <span>{product.name} - {product.selectedOption}</span>
                        <button className="remove-from-cart" onClick={() => removeFromCart(product.uid)}>X</button>
                    </div>
                ))}
            </div>
            <button className="cart-submit-button" onClick={handleSubmitOrder}>עבור לסיכום הזמנה וצפייה בסל הקניות שלך</button>
        </div>
        </div>
    );};

export default OrderForm;
