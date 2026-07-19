import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FaArchive, FaBoxOpen, FaEye, FaEyeSlash } from 'react-icons/fa'; // Assuming react-icons is available, or I'll use emoji/svg

const initialCards = [
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
    title: 'סיכום שבועי V3',
    description: 'דוחות שבועיים כולל הזמנות בתשלום מושהה',
    to: '/admin/weekly-summary-v3',
    featured: true
  },
  {
    title: 'ניהול הזמנות לקוחות',
    description: 'צפייה לפי שבוע וקהילה + ביטול הזמנה, הסרת פריט ושינוי קהילה',
    to: '/admin/weekly-customer-orders',
    featured: true
  },
  {
    title: 'העברת שבוע משלוח',
    description: 'העברת הזמנות חנות קבועה מתאריך משלוח אחד לאחר (למשל משבוע הבא לשבוע הנוכחי)',
    to: '/admin/transfer-delivery-week',
    featured: true
  },
  {
    title: 'סיכום הכנסות V4',
    description: 'סיכום כספי — סכומים ששולמו בפועל ומה שקיבלתי, כולל שקילה',
    to: '/admin/weekly-summary-v4',
    featured: true
  },
  {
    title: 'הזמנות מספקים',
    description: 'סיכום הזמנות לפי ספקים — העתקה, התאמה וחישוב עלויות',
    to: '/admin/order-from-suppliers',
    featured: true
  },
  {
    title: 'ייבוא מחירון ספק',
    description: 'פענוח PDF, השוואת עלויות, התאמת מוצרים ועדכון מחירים מבוקר',
    to: '/admin/supplier-price-import',
    featured: true
  },
  {
    title: 'לוחות משלוחים לקהילות',
    description: 'הגדרת ימי משלוח, תאריכים חריגים וזמני חיתוך לחנות הקבועה',
    to: '/admin/delivery-schedules',
    featured: true
  },
  {
    title: 'ניהול יישובים',
    description: 'הוספה ועריכת נקודות איסוף, צבעים ומיגרציית ניצנים',
    to: '/admin/communities',
    featured: true
  },
  {
    title: 'סלי היכרות לקהילות',
    description: 'בניית סל קבוע ממוצרים של כמה חקלאים, מחיר אחד ותצוגה בחנות הקהילה',
    to: '/admin/introduction-baskets',
    featured: true
  },
  {
    title: 'רשימת המתנה לשוק',
    description: 'עסקים מקומיים שנרשמו לפיילוט השוק (שם, טלפון, אימייל, סוג עסק וקהילה)',
    to: '/admin/marketplace-waitlist',
    featured: true
  },
  {
    title: 'הגדרות שיתוף ותגמול',
    description: 'בחירה בין הנחה קהילתית להנחה אישית על שיתוף האתר',
    to: '/admin/referral-config',
    featured: true
  },
  {
    title: 'סיכום לפי שבוע משלוח',
    description: 'צפייה בהזמנות לפי תאריך/שבוע משלוח וקהילה, כולל נתוני עבר',
    to: '/admin/weekly-delivery-summary',
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
  },
  {
    title: 'ניהול משלוחים V4 (חדש)',
    description: 'גרסה V4 עם מספרים קבועים וסנכרון אונליין/אופליין',
    to: '/admin/delivery-v4',
    featured: true
  },
  {
    title: 'ניהול משלוחים V4.5 (דחוי)',
    description: 'גרסה V4 לעבודה עם הזמנות תשלום מושהה',
    to: '/admin/delivery-v4-5',
    featured: true
  },
  {
    title: 'ניהול משלוחים V5 (משקלים)',
    description: 'גרסת שקילה וניהול חלוקה מתקדמת',
    to: '/admin/delivery-v5',
    featured: true
  },
  {
    title: 'ניהול משלוחים V6 / จัดการจัดส่ง V6',
    description: 'גרסה משופרת: שקילה אוטומטית, עברית/תאילנדית, אופליין — เวอร์ชันปรับปรุง: ชั่งอัตโนมัติ, ฮิบรู/ไทย, ออฟไลน์',
    to: '/admin/delivery-v6',
    featured: true
  },
  {
    title: 'ניהול משלוחים V7 (Realtime)',
    description: 'גרסה מבודדת חדשה: עבודה בכמה תחנות עם סנכרון בזמן אמת, Claim להזמנה, הוספת פריטים ועדכון מחיר',
    to: '/admin/delivery-v7',
    featured: true
  },
  {
    title: 'משלוחים וחלוקה (חדש)',
    description: 'ממשק נוח לניהול חלוקה ומשלוחים לפי קהילות',
    to: '/admin/deliveries',
    featured: true
  },
  {
    title: 'עגלות נטושות',
    description: 'צפייה בהזמנות שלא הושלמו (עגלות נטושות) לפי שבוע וקהילה',
    to: '/admin/abandoned-carts',
    featured: true
  },
  {
    title: 'אנליטיקס ודוחות',
    description: 'דשבורד נתונים מתקדם: מכירות, צמיחת קהילה, התנהגות צרכנים ועוד',
    to: '/admin/analytics',
    featured: true
  },
  {
    title: 'ניתוח לקוחות',
    description: 'מעקב אחרי לקוחות בודדים: כמה הזמנות ביצעו ומה ההיסטוריה שלהם',
    to: '/admin/customers',
    featured: true
  },
  {
    title: 'הגדרות תשלום',
    description: 'הגדרת נקודות איסוף לתשלום מושהה (J5) או רגיל',
    to: '/admin/payment-config',
    featured: true
  },
  {
    title: 'שוק הבסטות',
    description: 'הפעלה/כיבוי קישורי תשלום בעמוד אישור הזמנה (Bit, PayBox וכו׳)',
    to: '/admin/marketplace-settings',
    featured: true
  },
  {
    title: 'הנחות קהילה',
    description: 'הגדרת רמות הנחה לפי סכום הזמנות שבועי של קהילה (סף תצוגה + סף אמיתי)',
    to: '/admin/community-discount',
    featured: true
  },
  {
    title: 'ניהול מרכז קהילה',
    description: 'הפעלה/כיבוי רכיבים בעמוד הקהילה, שינוי סדר תצוגה',
    to: '/admin/community-hub',
    featured: true
  },
  {
    title: 'התקנת אפליקציית ניהול',
    description: 'הוספת באסטה למסך הבית לגישה מהירה לניהול מהטלפון (מנהלים בלבד)',
    to: '/admin/pwa-install',
    featured: true
  }
];

const AdminDashboard = () => {
  const [archivedPaths, setArchivedPaths] = useState([]);
  const [showArchive, setShowArchive] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('adminDashboardArchived');
    if (saved) {
      try {
        setArchivedPaths(JSON.parse(saved));
      } catch (e) {
        console.error("Error parsing archived paths", e);
      }
    }
  }, []);

  const toggleArchive = (path) => {
    let newPaths;
    if (archivedPaths.includes(path)) {
      newPaths = archivedPaths.filter(p => p !== path);
    } else {
      newPaths = [...archivedPaths, path];
    }
    setArchivedPaths(newPaths);
    localStorage.setItem('adminDashboardArchived', JSON.stringify(newPaths));
  };

  const visibleCards = initialCards.filter(card => {
    const isArchived = archivedPaths.includes(card.to);
    if (showArchive) {
      return isArchived; // Only show archived
    }
    return !isArchived; // Only show non-archived
  });

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8 flex flex-col md:flex-row justify-between items-center">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900">
              {showArchive ? 'ארכיון דפים' : 'לוח ניהול'}
            </h1>
            <p className="text-gray-600 mt-2">
              {showArchive ? 'דפים שהועברו לארכיון' : 'גישה מהירה לכלי הניהול והבקרה'}
            </p>
          </div>
          
          <button 
            onClick={() => setShowArchive(!showArchive)}
            className={`mt-4 md:mt-0 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${showArchive ? 'bg-gray-200 text-gray-800' : 'bg-gray-800 text-white'}`}
          >
            {showArchive ? (
              <>חזרה ללוח הראשי</>
            ) : (
              <>מעבר לארכיון</>
            )}
          </button>
        </div>

        {visibleCards.length === 0 && (
          <div className="text-center py-12 text-gray-500 bg-white rounded-lg border border-dashed border-gray-300">
            {showArchive ? 'אין דפים בארכיון' : 'אין דפים להצגה'}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleCards.map((card) => (
            <div key={card.to} className="relative group">
              <Link to={card.to} className="block h-full">
                <div className={`bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow h-full ${card.featured ? 'border-2 border-green-500' : 'border border-gray-200'}`}>
                  {card.featured && (
                    <span className="inline-block bg-green-100 text-green-700 text-xs px-2 py-1 rounded mb-2">מומלץ</span>
                  )}
                  <h2 className="text-xl font-semibold text-gray-800 mb-2 group-hover:text-blue-700">{card.title}</h2>
                  <p className="text-gray-600 text-sm">{card.description}</p>
                  <div className="mt-4 text-blue-600 text-sm font-medium">לכניסה ←</div>
                </div>
              </Link>
              
              {/* Archive/Unarchive Button */}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleArchive(card.to);
                }}
                title={showArchive ? "החזר ללוח" : "העבר לארכיון"}
                className="absolute top-3 right-3 h-8 w-8 inline-flex items-center justify-center text-gray-500 hover:text-gray-700 bg-white rounded-full shadow-sm border border-gray-200"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {showArchive ? (
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  ) : (
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  )}
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;