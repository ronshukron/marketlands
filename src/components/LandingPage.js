// src/components/Home.js

import React from 'react';
import { Link } from 'react-router-dom';
import './Home.css';

// Replace these images with your own and ensure they are imported correctly
import logo from '../images/Field.jpg'; // Use your actual logo image
import heroImage from '../images/Field.jpg'; // Use your actual hero image
import featureImage1 from '../images/orchardhillsrollingoverhorizon.jpg';
import featureImage2 from '../images/rolledhaybalesonfarmland.jpg';
import featureImage3 from '../images/sunlightdropedbelowhorizonbehindmountains.jpg';
import featureImage4 from '../images/freshlybaledfield.jpg';

const LandingPage = () => {
  return (
    <div dir="rtl" className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="relative h-screen">
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${heroImage})` }}
        >
          <div className="absolute inset-0 bg-black bg-opacity-50"></div>
        </div>
        
        <div className="relative h-full flex items-center justify-center px-4">
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-6">
              מחברים בין חקלאים לסוחרים וקבוצות רכישה
            </h1>
            <p className="text-xl text-gray-200 mb-8">
              פתחו דף מכירה עבור סוחרים קבוצות רכישה, עקבו אחר הזמנות, ונהלו אותם בקלות ובחינם
            </p>
            <Link
              to="/business-register"
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-lg font-medium px-8 py-3 rounded-lg transition-colors duration-300"
            >
              התחל עכשיו
            </Link>
          </div>
        </div>
      </div>



      {/* Tutorial Videos Section */}
      <section className="py-16 bg-gray-50" dir="rtl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
              סרטוני הדרכה
            </h2>
            <div className="h-1 w-24 bg-blue-600 mx-auto my-4 rounded-full"></div>
            <p className="mt-4 max-w-2xl mx-auto text-xl text-gray-500">
              צפו בסרטוני ההדרכה שלנו כדי ללמוד איך להשתמש במערכת בצורה הטובה ביותר
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* First Video - with explicit styling */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden' }}>
                <iframe 
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
                  src="https://www.youtube.com/embed/qd1VGjkJcfTY" 
                  title="הדרכה למשתמשים"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                  allowFullScreen
                ></iframe>
              </div>
              <div className="p-5">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">הדרכה למשתמשים</h3>
                <p className="text-gray-600">
                  למדו כיצד לבצע הזמנות, להצטרף לקבוצות רכישה ולנהל את הפרופיל שלכם בקלות
                </p>
              </div>
            </div>

            {/* Second Video - with explicit styling */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden' }}>
                <iframe 
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
                  src="https://www.youtube.com/embed/qd1VGjkJfcTY" 
                  title="הדרכה לספקים"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                  allowFullScreen
                ></iframe>
              </div>
              <div className="p-5">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">הדרכה לספקים</h3>
                <p className="text-gray-600">
                  למדו כיצד להעלות מוצרים, ליצור דפי מכירה ולנהל את ההזמנות שלכם באופן יעיל
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>


      {/* Features Grid */}
      <div className="py-20 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            היתרונות שלנו
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div 
                key={index}
                className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow duration-300 overflow-hidden"
              >
                <div className="h-48 overflow-hidden">
                  <img 
                    src={feature.image} 
                    alt={feature.title}
                    className="w-full h-full object-cover transform hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <div className="p-6 text-right">
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">
                    {feature.title}
                  </h3>
                  <p className="text-gray-600">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* How It Works Section */}
      <div className="py-20 px-4 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            איך זה עובד?
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map((step, index) => (
              <div key={index} className="text-center">
                <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl font-bold text-white">{index + 1}</span>
                </div>
                <h3 className="text-xl font-semibold mb-3">{step.title}</h3>
                <p className="text-gray-600">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="py-20 px-4 bg-blue-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-6">
            מוכנים להתחיל?
          </h2>
          <p className="text-xl text-blue-100 mb-8">
            הצטרפו לפיילוט שלנו שיתחיל ביום ראשון בתאריך 16.03.2025
          </p>
          <Link
            to="/business-register"
            className="inline-block bg-white text-blue-600 text-lg font-medium px-8 py-3 rounded-lg hover:bg-blue-50 transition-colors duration-300"
          >
            הצטרף עכשיו
          </Link>
        </div>
      </div>

      {/* Footer */}
      {/* <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="text-right">
              <img src={logo} alt="Logo" className="h-12 mb-4" />
              <p className="text-sm">
                הפלטפורמה המובילה לניהול קבוצות רכישה והזמנות מרוכזות
              </p>
            </div>
            <div className="text-right">
              <h4 className="text-white font-medium mb-4">קישורים מהירים</h4>
              <ul className="space-y-2">
                <li><Link to="/" className="hover:text-white transition-colors">דף הבית</Link></li>
                <li><Link to="/features" className="hover:text-white transition-colors">תכונות</Link></li>
                <li><Link to="/about" className="hover:text-white transition-colors">אודות</Link></li>
              </ul>
            </div>
            <div className="text-right">
              <h4 className="text-white font-medium mb-4">משאבים</h4>
              <ul className="space-y-2">
                <li><Link to="/help" className="hover:text-white transition-colors">מדריך למשתמש</Link></li>
                <li><Link to="/faq" className="hover:text-white transition-colors">שאלות נפוצות</Link></li>
                <li><Link to="/contact" className="hover:text-white transition-colors">צור קשר</Link></li>
              </ul>
            </div>
            <div className="text-right">
              <h4 className="text-white font-medium mb-4">עקבו אחרינו</h4>
              <div className="flex gap-4">
                {/* Add your social media icons/links here */}
              {/* </div>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-12 pt-8 text-center">
            <p className="text-sm">© 2024 כל הזכויות שמורות.</p>
          </div>
        </div>
      </footer> */}
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

export default LandingPage;
