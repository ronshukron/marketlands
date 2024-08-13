import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/authContext';
import './Menu.css';

const Menu = () => {
    const { userLoggedIn, signOut } = useAuth();
    const navigate = useNavigate();
    const [isOpen, setIsOpen] = useState(false);

    const toggleMenu = () => {
        setIsOpen(!isOpen);
    };
    
    const handleLogout = async () => {
        try {
            await signOut();
            navigate('/');
            toggleMenu();
            console.log("Successfully logged out");
        } catch (error) {
            console.error("Logout failed:", error);
        }
    };

    return (
        <nav className="navbar">
            <div className="header">
                <div className="title">Community Cart</div>
                <div className="hamburger" onClick={toggleMenu}>
                    ☰
                </div>
            </div>

            <ul className={`menu-list ${isOpen ? 'open' : ''}`}>
                <li><Link to="/" onClick={toggleMenu}>בית</Link></li>
                <li><Link to="/producers" onClick={toggleMenu}>ספקים</Link></li>
                <li><Link to="/contact" onClick={toggleMenu}>צור קשר</Link></li>
                {userLoggedIn && (
                    <>
                        <li><Link to="/create-order" onClick={toggleMenu}>יצירת הזמנה</Link></li>
                        <li><Link to="/dashboard" onClick={toggleMenu}>לוח הזמנות</Link></li>
                        <li>
                            <button className="logout-button" onClick={handleLogout}>
                                התנתק
                            </button>
                        </li>
                    </>
                )}
                {!userLoggedIn && (
                    <>
                        <li><Link to="/signup" onClick={toggleMenu}>הירשמו</Link></li>
                        <li><Link to="/login" onClick={toggleMenu}>התחברו</Link></li>
                    </>
                )}
            </ul>
        </nav>
    );
};

export default Menu;
