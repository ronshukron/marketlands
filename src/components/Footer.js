// src/components/Footer.js
import React from 'react';
import { Link } from 'react-router-dom';
import './Footer.css';

const Footer = () => {
    return (
        <footer className="footer">
            <div className="footer-content">
                <p>&copy; {new Date().getFullYear()} Basta Basket. All rights reserved.</p>
                {/* <p><a href="mailto:support@communitycart.com">community.cart.kehila@gmail.com</a>: ניתן לפנות אלינו ב </p> */}
                <p>
                    <Link to="/">בית</Link> | 
                    <Link to="/contact"> צור קשר</Link> |  
                    <Link to="/terms-of-service">תקנון</Link> | 

                </p>
                <p>
                    <a href="https://facebook.com" target="_blank" rel="noopener noreferrer"> Facebook</a> |
                    <a href="https://twitter.com" target="_blank" rel="noopener noreferrer"> Twitter</a> |
                    <a href="https://instagram.com" target="_blank" rel="noopener noreferrer"> Instagram</a>
                עקבו אחרינו</p>

                <p>
                    
                </p>

            </div>
        </footer>
    );
};

export default Footer;
