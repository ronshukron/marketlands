import React from 'react';
import { Link } from 'react-router-dom';

const cards = [
  {
    title: 'ניהול מודעות חקלאים עצמאיים',
    description: 'צפייה וניהול מודעות מכירה של חקלאים עצמאיים',
    to: '/admin/independent-orders',
    featured: true
  },
  {
    title: 'אישור מוצרים (חקלאים עצמאיים)',
    description: 'סקירה ואישור מוצרים שנוספו על ידי חקלאים עצמאיים',
    to: '/admin/products'
  },
  {
    title: 'סיכום שבועי',
    description: 'דוחות וסטטיסטיקות של הזמנות שבועיות',
    to: '/admin/weekly-summary'
  },
  {
    title: 'ניהול משלוחים',
    description: 'ניהול והקצאת משלוחים להזמנות',
    to: '/admin/delivery'
  },
  {
    title: 'ניהול משלוחים (80)',
    description: 'גרסת 80 לניהול משלוחים',
    to: '/admin/delivery-80'
  },
  {
    title: 'בקשות זיכוי',
    description: 'סקירה וטיפול בבקשות זיכוי של משתמשים',
    to: '/admin/refunds'
  },
  {
    title: 'סיכום שבועי V2',
    description: 'דוחות שבועיים עם בחירת שבוע וקהילות',
    to: '/admin/weekly-summary-v2',
    featured: true
  },
  {
    title: 'ניהול משלוחים V2',
    description: 'ניהול משלוחים עם בחירת שבוע וקהילות',
    to: '/admin/delivery-v2',
    featured: true
  },
  {
    title: 'ניהול משלוחים V3 (ไทย)',
    description: 'גרסה לעובדים תאילנדיים - עם תמונות ושמות בתאילנדית',
    to: '/admin/delivery-v3',
    featured: true
  }
];

const AdminDashboard = () => {
  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8 text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900">לוח ניהול</h1>
          <p className="text-gray-600 mt-2">גישה מהירה לכלי הניהול והבקרה</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {cards.map((card) => (
            <Link key={card.to} to={card.to} className="block group">
              <div className={`bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow h-full ${card.featured ? 'border-2 border-green-500' : 'border border-gray-200'}`}>
                {card.featured && (
                  <span className="inline-block bg-green-100 text-green-700 text-xs px-2 py-1 rounded mb-2">מומלץ</span>
                )}
                <h2 className="text-xl font-semibold text-gray-800 mb-2 group-hover:text-blue-700">{card.title}</h2>
                <p className="text-gray-600 text-sm">{card.description}</p>
                <div className="mt-4 text-blue-600 text-sm font-medium">לכניסה →</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard; 