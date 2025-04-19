// src/components/Home.js

import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/authContext';
import './Home.css';
import OngoingOrders from './OngoingOrders';

// Replace these images with your own and ensure they are imported correctly
import logo from '../images/Field.jpg'; // Use your actual logo image
import heroImage from '../images/Field.jpg'; // Use your actual hero image
import featureImage1 from '../images/orchardhillsrollingoverhorizon.jpg';
import featureImage2 from '../images/rolledhaybalesonfarmland.jpg';
import featureImage3 from '../images/sunlightdropedbelowhorizonbehindmountains.jpg';
import featureImage4 from '../images/freshlybaledfield.jpg';

const Home = () => {
  const { userLoggedIn } = useAuth();
  console.log("User logged in status:", userLoggedIn); // Debug log

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Enhanced Welcome Section */}
      <div 
        className="relative py-16 md:py-24 bg-gradient-to-br from-blue-500 to-blue-700 text-white" 
        style={{
          backgroundImage: `linear-gradient(to bottom right, rgba(37, 99, 235, 0.9), rgba(29, 78, 216, 0.85)), url(${heroImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center relative z-10">
            <h1 className="text-4xl md:text-6xl font-bold mb-6 text-white drop-shadow-md">
              ברוכים הבאים לשוק
            </h1>
            <p className="mt-3 max-w-2xl mx-auto text-lg md:text-xl text-blue-50 leading-relaxed">
              כאן תוכלו למצוא את כל המכירות הפעילות מהחקלאים והספקים שלנו
            </p>
            
            {/* Improved buttons */}
            {!userLoggedIn && (
              <div className="mt-10 flex flex-col sm:flex-row justify-center gap-4">
                <Link
                  to="/login"
                  className="bg-white text-blue-700 hover:bg-blue-50 px-8 py-3 rounded-lg font-medium shadow-md transition-all duration-200 transform hover:scale-105"
                >
                  התחברות
                </Link>
                <Link
                  to="/user-register"
                  className="bg-transparent text-white hover:bg-blue-600 border-2 border-white px-8 py-3 rounded-lg font-medium shadow-md transition-all duration-200 transform hover:scale-105"
                >
                  הרשמה
                </Link>
              </div>
            )}
          </div>
        </div>
        
        {/* Decorative wave divider */}
        <div className="absolute bottom-0 left-0 right-0 overflow-hidden">
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            viewBox="0 0 1440 100" 
            className="w-full h-auto transform translate-y-1"
          >
            <path 
              fill="#f9fafb" 
              fillOpacity="1" 
              d="M0,32L60,42.7C120,53,240,75,360,69.3C480,64,600,32,720,26.7C840,21,960,43,1080,53.3C1200,64,1320,64,1380,64L1440,64L1440,100L1380,100C1320,100,1200,100,1080,100C960,100,840,100,720,100C600,100,480,100,360,100C240,100,120,100,60,100L0,100Z"
            ></path>
          </svg>
        </div>
      </div>

      {/* Ongoing Orders Section with improved styling */}
      <div className="bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8 text-center">
            {/* <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
              דפי מכירה פעילים
            </h2>
            <p className="mt-2 text-gray-600">
              בחרו מתוך מגוון דפי המכירה הפעילים כעת
            </p> */}
          </div>
          <OngoingOrders />
        </div>
      </div>
    </div>
  );
};

// Features data
const features = [
  {
    title: 'דפי רכישה',
    description: 'צרו דפי מכירה מרשימים עם תמונות, תיאורים ומחירים. מותאם למובייל ונוח לשימוש.',
    image: featureImage1
  },
  {
    title: 'ניהול הזמנות',
    description: 'עקבו אחר הזמנות בזמן אמת, נהלו מלאי וקבלו סטטיסטיקות מפורטות על המכירות שלכם.',
    image: featureImage2
  },
  {
    title: 'תשלומים מאובטחים',
    description: 'קבלו תשלומים באמצעות כרטיסי אשראי, ביט ופייבוקס בצורה מאובטחת ופשוטה.',
    image: featureImage4
  }
];

// How it works steps
const steps = [
  {
    title: 'הרשמה פשוטה',
    description: 'הירשמו למערכת בקלות ופתחו את החנות שלכם תוך דקות.'
  },
  {
    title: 'העלאת מוצרים',
    description: 'הוסיפו את המוצרים שלכם עם תמונות ותיאורים.'
  },
  {
    title: 'התחילו למכור',
    description: 'שתפו את דף המכירה שלכם והתחילו לקבל הזמנות.'
  }
];

export default Home;
