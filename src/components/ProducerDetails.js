import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import Slider from "react-slick";
import { doc, getDoc } from "firebase/firestore"; 
import { db } from '../firebase/firebase'; // Adjust the path as necessary
import './ProducerDetails.css';
import LoadingSpinner from './LoadingSpinner';
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";

const ProducerDetails = () => {
    const { producerId } = useParams();
    const [producer, setProducer] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchProducer = async () => {
            const docRef = doc(db, "Producers", producerId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                setProducer({
                    ...docSnap.data(),
                    id: docSnap.id,
                });
            } else {
                console.log("No producer found!");
            }
            setLoading(false);
        };

        fetchProducer();
    }, [producerId]);

    if (loading) {
        return <LoadingSpinner />;
    }
    if (!producer) return <div>No producer details available.</div>;

    // Slider settings
    const settings = {
        dots: true,
        infinite: true,
        speed: 500,
        slidesToShow: 1,
        slidesToScroll: 1
    };

    return (
        <div className="producer-details">
            <h1>{producer.Name}</h1>
            {Object.keys(producer).filter(key => key.startsWith('Product_')).map((key, index) => (
                <div key={index} className="product-container">
                    <Slider className='slider' {...settings}>
                        {producer[key].Images.map((imgUrl, idx) => (
                            <div key={idx} className="slider-image-container">
                                <img src={imgUrl} alt={`Image ${idx + 1}`} className="product-image" />
                            </div>
                        ))}
                    </Slider>
                    <div className="product-info">
                        <h2>{producer[key].Name} - ₪{producer[key].Price}</h2>
                        <p>{producer[key].Description}</p>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default ProducerDetails;
