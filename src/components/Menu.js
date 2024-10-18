import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/authContext';
import './Menu.css';

const Menu = () => {
    const { userLoggedIn, signOut, userRole } = useAuth();
    const navigate = useNavigate();
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef(null);
    
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

    const handleTitleClick = () => {
        navigate('/');
    };

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target) && isOpen) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    return (
        <nav className="navbar">
            <div className="header">
                <div className="title">
                    <Link to="/" onClick={handleTitleClick}>Basta Basket</Link>
                </div>
                <div className="hamburger" onClick={toggleMenu}>
                    ☰
                </div>
            </div>
            <ul className={`menu-list ${isOpen ? 'open' : ''}`}>
                <li><Link to="/" onClick={toggleMenu}>בית</Link></li>
                <li><Link to="/contact" onClick={toggleMenu}>צור קשר</Link></li>
                <li><Link to="/ongoing-orders" onClick={toggleMenu}>הזמנות פעילות</Link></li>

                {userLoggedIn && userRole === 'coordinator' && (
                    <>
                        <li><Link to="/producers" onClick={toggleMenu}>ספקים</Link></li>
                        <li><Link to="/create-order" onClick={toggleMenu}>יצירת הזמנה</Link></li>
                        <li><Link to="/dashboard" onClick={toggleMenu}>לוח הזמנות</Link></li>
                        {/* <li><Link to="/manage-community" onClick={toggleMenu}>ניהול קהילה</Link></li> */}
                    </>
                )}

                {userLoggedIn && userRole === 'user' && (
                    <>
                        <li><Link to="/my-orders" onClick={toggleMenu}>ההזמנות שלי</Link></li>
                        {/* <li><Link to="/join-community" onClick={toggleMenu}>הצטרף לקהילה</Link></li> */}
                    </>
                )}

                {userLoggedIn && (
                    <>
                        <li><Link to="/coordinators" onClick={toggleMenu}>רכזי קהילות</Link></li>
                        {/* <li><Link to="/profile" onClick={toggleMenu}>פרופיל</Link></li> */}
                        <li>
                            <button className="logout-button" onClick={handleLogout}>
                                התנתק
                            </button>
                        </li>
                    </>
                )}

                {userLoggedIn && userRole === 'business' && (
                    <>
                        <li><Link to="/Business-DashBoard" onClick={toggleMenu}>החנות שלי</Link></li>
                        <li><Link to="/Business-Products" onClick={toggleMenu}>המוצרים שלי</Link></li>
                        <li><Link to="/dashboard" onClick={toggleMenu}>לוח הזמנות</Link></li>

                    </>
                )}

                {!userLoggedIn && (
                    <>
                        <li><Link to="/user-register" onClick={toggleMenu}>הירשמו כמשתמש</Link></li>
                        <li><Link to="/coordinator-register" onClick={toggleMenu}>הירשמו כרכז</Link></li>
                        <li><Link to="/business-register" onClick={toggleMenu}>הירשמו כעסק</Link></li>
                        <li><Link to="/login" onClick={toggleMenu}>התחברו</Link></li>
                    </>
                )}
            </ul>
            {isOpen && <div className="menu-overlay" onClick={toggleMenu}></div>}
        </nav>
    );
};

export default Menu;