import React from 'react';
import { Link } from 'react-router-dom';
import './Footer.css';

const Footer = () => {
    return (
        <footer className="footer">
            <div className="footer-content">
                <div className="footer-section about">
                    <h2>באסטה בסקאט</h2>
                    <p>חיבור בין קהילות לחקלאים מקומיים</p>
                    <p>אימייל: community.cart.kehila@gmail.com</p>
                </div>
                <div className="footer-section links">
                    <h2>קישורים מהירים</h2>
                    <ul>
                        <li><Link to="/">בית</Link></li>
                        <li><Link to="/contact">צור קשר</Link></li>
                        <li><Link to="/terms-of-service">תקנון</Link></li>
                    </ul>
                </div>
                <div className="footer-section social">
                    <h2>עקבו אחרינו</h2>
                    <div className="social-links">
                        <a href="https://facebook.com" target="_blank" rel="noopener noreferrer">Facebook</a>
                        <a href="https://twitter.com" target="_blank" rel="noopener noreferrer">Twitter</a>
                        <a href="https://instagram.com" target="_blank" rel="noopener noreferrer">Instagram</a>
                    </div>
                </div>
            </div>
            <div className="footer-bottom">
                <p>.כל הזכויות שמורות Basta Basket {new Date().getFullYear()} &copy;</p>
            </div>
        </footer>
    );
};

export default Footer;