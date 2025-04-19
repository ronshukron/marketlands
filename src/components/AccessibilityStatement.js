import React from 'react';

const AccessibilityStatement = () => {
  // Get current date formatted in Hebrew style
  const today = new Date();
  const formattedDate = today.toLocaleDateString('he-IL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <div dir="rtl" className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6 text-center">הצהרת נגישות</h1>
      
      <div className="bg-white shadow-md rounded-lg p-6 mb-8">
        <p className="mb-4">
          אנו בבאסטה בסקאט מאמינים כי פלטפורמת השיווק שלנו צריכה להיות נגישה לכולם, כולל אנשים עם מוגבלויות.
          אנו מחויבים לאפשר לכל אדם, ללא קשר ליכולותיו, להשתמש באתר שלנו בצורה נוחה ויעילה.
        </p>
        
        {/* <h2 className="text-xl font-semibold mt-6 mb-3">המחויבות שלנו לנגישות</h2>
        <p className="mb-4">
          אנו פועלים באופן מתמיד לשיפור הנגישות של האתר בהתאם להנחיות הנגישות לתוכן אינטרנט (WCAG) 2.1,
          ולתקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), תשע"ג-2013.
        </p> */}
        
        <h2 className="text-xl font-semibold mt-6 mb-3">תכונות נגישות באתר שלנו</h2>
        <ul className="list-disc list-inside mb-4 space-y-2">
          <li>ניגודיות צבעים הניתנת להתאמה אישית - לשיפור הקריאות עבור משתמשים עם לקויות ראייה</li>
          <li>אפשרות להפעלת מצב גווני אפור - לסיוע למשתמשים הרגישים לצבעים מסוימים</li>
          <li>אפשרות להגדלת גודל הטקסט - לשיפור הקריאות</li>
          {/* <li>שימוש בגופנים ברורים וקריאים לאורך כל האתר</li> */}
          {/* <li>הקפדה על מבנה היררכי של כותרות לניווט קל יותר</li> */}
          <li>תמיכה מלאה בהתאמה למכשירים ניידים ומסכים בגדלים שונים</li>
          <li>ניתן להשתמש בכפתור הנגישות (בפינה השמאלית התחתונה) להתאמת האתר לצרכים אישיים</li>
        </ul>
        
        <h2 className="text-xl font-semibold mt-6 mb-3">תהליך השיפור המתמיד</h2>
        <p className="mb-4">
          אנו מבינים שהדרך לנגישות מלאה היא תהליך מתמשך. אנו מחויבים להמשיך ולשפר את האתר, ולהתייחס לכל בעיה שעשויה להתעורר.
          המשוב שלכם הוא חשוב לנו מאוד בתהליך זה.
        </p>
        
        {/* <h2 className="text-xl font-semibold mt-6 mb-3">מגבלות ידועות</h2>
        <p className="mb-4">
          חלק מהתכונות באתר עדיין בתהליך שיפור מבחינת נגישות. אנו עובדים על:
        </p>
        <ul className="list-disc list-inside mb-4 space-y-2">
          <li>שיפור תיאורים חלופיים לתמונות המוצרים</li>
          <li>שיפור הניווט באמצעות מקלדת בלבד</li>
          <li>אופטימיזציה נוספת עבור קוראי מסך</li>
        </ul> */}
        
        <h2 className="text-xl font-semibold mt-6 mb-3">יצירת קשר בנושאי נגישות</h2>
        <p className="mb-4">
          אנו מעריכים את המשוב שלכם. אם נתקלתם בקשיים בשימוש באתר, או אם יש לכם הצעות לשיפור הנגישות, אנא צרו איתנו קשר:
        </p>
        <ul className="list-disc list-inside mb-4 space-y-2">
          {/* <li>דוא"ל: community.cart.kehila@gmail.com</li> */}
          <li>טופס יצירת קשר: <a href="/contact" className="text-blue-600 hover:underline">לחצו כאן</a></li>
        </ul>
        
        <p className="mt-8 text-sm text-gray-600">
          הצהרת נגישות זו עודכנה לאחרונה בתאריך: {formattedDate}
        </p>
      </div>
    </div>
  );
};

export default AccessibilityStatement; 