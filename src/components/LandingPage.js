// src/components/Home.js

import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/authContext';
import './Home.css';

// Replace these images with your own and ensure they are imported correctly
import logo from '../images/Field.jpg'; // Use your actual logo image
import heroImage from '../images/Field.jpg'; // Use your actual hero image
import featureImage1 from '../images/orchardhillsrollingoverhorizon.jpg';
import featureImage2 from '../images/rolledhaybalesonfarmland.jpg';
import featureImage3 from '../images/sunlightdropedbelowhorizonbehindmountains.jpg';
import featureImage4 from '../images/freshlybaledfield.jpg';
import farmImg from '../images/farm_fresh.jpg';
import deliveryImg from '../images/delivery.jpg';
import dashboardImg from '../images/dashboard.png';
import groupBuyingImg from '../images/group_buying.png';

const LandingPage = () => {
  const { currentUser } = useAuth();

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-green-600 to-green-500 text-white">
        <div className="container mx-auto px-4 py-16 max-w-6xl">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">חיבור ישיר בין חקלאים לסוחרים</h1>
            <p className="text-xl mb-8">
              פלטפורמה המאפשרת לחקלאים למכור את תוצרתם ישירות לסוחרים ולקבוצות רכישה.
            </p>
            <div className="space-x-4 space-x-reverse">
              {!currentUser ? (
                <>
                  <Link
                    to="/register"
                    className="bg-white text-green-600 hover:bg-gray-100 px-6 py-3 rounded-lg font-medium shadow-md transition-colors inline-block"
                  >
                    הרשמה
                  </Link>
                  <Link
                    to="/login"
                    className="bg-transparent border-2 border-white text-white hover:bg-white hover:text-green-600 px-6 py-2.5 rounded-lg font-medium transition-colors inline-block"
                  >
                    התחברות
                  </Link>
                </>
              ) : (
                <Link
                  to="/dashboard"
                  className="bg-white text-green-600 hover:bg-gray-100 px-6 py-3 rounded-lg font-medium shadow-md transition-colors inline-block"
                >
                  ללוח הזמנות
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* How It Works Section */}
      <div className="container mx-auto px-4 py-16 max-w-6xl">
        <h2 className="text-3xl font-bold text-center mb-12">איך זה עובד?</h2>
        
        {/* For Farmers */}
        <div className="bg-white rounded-xl overflow-hidden shadow-md mb-16">
          <div className="bg-green-50 px-6 py-4 border-b border-green-100">
            <h3 className="text-2xl font-bold text-green-800">לחקלאים</h3>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div>
                <div className="space-y-4">
                  <div className="flex items-start">
                    <div className="bg-green-100 rounded-full w-8 h-8 flex items-center justify-center text-green-800 font-bold flex-shrink-0 mt-0.5">1</div>
                    <div className="mr-4">
                      <h4 className="font-bold text-lg mb-1">העלאת מוצרים</h4>
                      <p className="text-gray-600">הוסיפו את המוצרים שברצונכם למכור עם תמונות ותיאורים מפורטים.</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start">
                    <div className="bg-green-100 rounded-full w-8 h-8 flex items-center justify-center text-green-800 font-bold flex-shrink-0 mt-0.5">2</div>
                    <div className="mr-4">
                      <h4 className="font-bold text-lg mb-1">יצירת מודעת מכירה</h4>
                      <p className="text-gray-600">צרו מודעת מכירה עם כל המוצרים שברצונכם למכור, הגדירו את משך זמן המכירה ותאריכי האספקה.</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start">
                    <div className="bg-green-100 rounded-full w-8 h-8 flex items-center justify-center text-green-800 font-bold flex-shrink-0 mt-0.5">3</div>
                    <div className="mr-4">
                      <h4 className="font-bold text-lg mb-1">קבלת הזמנות</h4>
                      <p className="text-gray-600">הסוחרים מזמינים את התוצרת ישירות מהמודעה שלכם.</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start">
                    <div className="bg-green-100 rounded-full w-8 h-8 flex items-center justify-center text-green-800 font-bold flex-shrink-0 mt-0.5">4</div>
                    <div className="mr-4">
                      <h4 className="font-bold text-lg mb-1">אספקה וקבלת תשלום</h4>
                      <p className="text-gray-600">ספקו את ההזמנות בתאריך שהגדרתם וקבלו את התשלום אחת לשבועיים באופן אוטומטי, בניכוי עמלה של 2% בלבד.</p>
                    </div>
                  </div>
                </div>
                
                <div className="mt-6 bg-yellow-50 border-r-4 border-yellow-300 p-4 rounded-md">
                  <h4 className="font-bold text-gray-800 mb-1">יתרונות לחקלאים:</h4>
                  <ul className="text-gray-700 space-y-1 list-disc list-inside">
                    <li>פתרון פשוט ונוח למכירת תוצרת ישירות לסוחרים</li>
                    <li>עמלה נמוכה של 2% בלבד</li>
                    <li>לוח בקרה לניהול הזמנות ומעקב אחר מכירות</li>
                    <li>קבלת תשלומים מאובטחים ומהירים</li>
                  </ul>
                </div>
              </div>
              <div className="order-first md:order-last">
                <img src={farmImg} alt="חקלאי" className="w-full h-auto rounded-lg shadow-lg" />
              </div>
            </div>
          </div>
        </div>
        
        {/* For Merchants */}
        <div className="bg-white rounded-xl overflow-hidden shadow-md mb-16">
          <div className="bg-blue-50 px-6 py-4 border-b border-blue-100">
            <h3 className="text-2xl font-bold text-blue-800">לסוחרים</h3>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div className="order-first md:order-first">
                <img src={deliveryImg} alt="הזמנות" className="w-full h-auto rounded-lg shadow-lg" />
              </div>
              <div>
                <div className="space-y-4">
                  <div className="flex items-start">
                    <div className="bg-blue-100 rounded-full w-8 h-8 flex items-center justify-center text-blue-800 font-bold flex-shrink-0 mt-0.5">1</div>
                    <div className="mr-4">
                      <h4 className="font-bold text-lg mb-1">צפייה במודעות מכירה</h4>
                      <p className="text-gray-600">עיינו במודעות המכירה הפעילות וראו מה החקלאים מציעים למכירה.</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start">
                    <div className="bg-blue-100 rounded-full w-8 h-8 flex items-center justify-center text-blue-800 font-bold flex-shrink-0 mt-0.5">2</div>
                    <div className="mr-4">
                      <h4 className="font-bold text-lg mb-1">ביצוע הזמנה</h4>
                      <p className="text-gray-600">בחרו את המוצרים שאתם מעוניינים לרכוש בכמויות הרצויות.</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start">
                    <div className="bg-blue-100 rounded-full w-8 h-8 flex items-center justify-center text-blue-800 font-bold flex-shrink-0 mt-0.5">3</div>
                    <div className="mr-4">
                      <h4 className="font-bold text-lg mb-1">תשלום</h4>
                      <p className="text-gray-600">התשלום מתבצע דרך המערכת, שמחזיקה את הכסף בנאמנות עד לאספקת המוצרים.</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start">
                    <div className="bg-blue-100 rounded-full w-8 h-8 flex items-center justify-center text-blue-800 font-bold flex-shrink-0 mt-0.5">4</div>
                    <div className="mr-4">
                      <h4 className="font-bold text-lg mb-1">קבלת המוצרים</h4>
                      <p className="text-gray-600">קבלו את המוצרים שהזמנתם בתאריך האספקה שהוגדר על ידי החקלאי.</p>
                    </div>
                  </div>
                </div>
                
                <div className="mt-6 bg-blue-50 border-r-4 border-blue-300 p-4 rounded-md">
                  <h4 className="font-bold text-gray-800 mb-1">יתרונות לסוחרים:</h4>
                  <ul className="text-gray-700 space-y-1 list-disc list-inside">
                    <li>גישה ישירה לתוצרת טרייה מהחקלאים</li>
                    <li>מחירים אטרקטיביים ללא פערי תיווך גדולים</li>
                    <li>מערכת הזמנות נוחה וקלה לשימוש</li>
                    <li>תשלום מאובטח דרך המערכת</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Group Purchasing */}
        <div className="bg-white rounded-xl overflow-hidden shadow-md mb-16">
          <div className="bg-purple-50 px-6 py-4 border-b border-purple-100">
            <h3 className="text-2xl font-bold text-purple-800">לרכזי קבוצות רכישה</h3>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div>
                <div className="space-y-4">
                  <div className="flex items-start">
                    <div className="bg-purple-100 rounded-full w-8 h-8 flex items-center justify-center text-purple-800 font-bold flex-shrink-0 mt-0.5">1</div>
                    <div className="mr-4">
                      <h4 className="font-bold text-lg mb-1">ארגון קבוצת רכישה</h4>
                      <p className="text-gray-600">פתחו קבוצת רכישה ואפשרו לחברי הקבוצה להזמין מוצרים מחקלאים.</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start">
                    <div className="bg-purple-100 rounded-full w-8 h-8 flex items-center justify-center text-purple-800 font-bold flex-shrink-0 mt-0.5">2</div>
                    <div className="mr-4">
                      <h4 className="font-bold text-lg mb-1">הגדרת עמלה</h4>
                      <p className="text-gray-600">קבעו עמלה בשיעור של 3%-15% על המחיר שהחקלאי מבקש (המערכת תוסיף עמלה של 3%-8%).</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start">
                    <div className="bg-purple-100 rounded-full w-8 h-8 flex items-center justify-center text-purple-800 font-bold flex-shrink-0 mt-0.5">3</div>
                    <div className="mr-4">
                      <h4 className="font-bold text-lg mb-1">ריכוז הזמנות ותיאום אספקה</h4>
                      <p className="text-gray-600">רכזו את ההזמנות מחברי הקבוצה ותאמו את האספקה עם החקלאי.</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start">
                    <div className="bg-purple-100 rounded-full w-8 h-8 flex items-center justify-center text-purple-800 font-bold flex-shrink-0 mt-0.5">4</div>
                    <div className="mr-4">
                      <h4 className="font-bold text-lg mb-1">קבלת העמלה</h4>
                      <p className="text-gray-600">קבלו את העמלה שלכם יחד עם התשלום לחקלאי (החקלאי מקבל את המחיר המלא שביקש, פחות 2% עמלת המערכת).</p>
                    </div>
                  </div>
                </div>
                
                <div className="mt-6 bg-purple-50 border-r-4 border-purple-300 p-4 rounded-md">
                  <h4 className="font-bold text-gray-800 mb-1">כיצד זה עובד:</h4>
                  <p className="text-gray-700 mb-2">
                    בקבוצות רכישה, המחיר לצרכן יהיה גבוה יותר מהמחיר שהחקלאי ביקש:
                  </p>
                  <ul className="text-gray-700 space-y-1 list-disc list-inside">
                    <li>החקלאי מקבל את המחיר שביקש (פחות 2% עמלה רגילה)</li>
                    <li>רכז הקבוצה מקבל עמלה של 3%-15% שהוגדרה מראש</li>
                    <li>המערכת לוקחת עמלה נוספת של 3%-8%</li>
                    <li>הצרכן הסופי משלם את הסכום הכולל</li>
                  </ul>
                </div>
              </div>
              <div className="order-first md:order-last">
                <img src={groupBuyingImg} alt="קבוצת רכישה" className="w-full h-auto rounded-lg shadow-lg" />
              </div>
            </div>
          </div>
        </div>

        {/* Dashboard */}
        <div className="bg-white rounded-xl overflow-hidden shadow-md mb-16">
          <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
            <h3 className="text-2xl font-bold text-gray-800">לוח בקרה למעקב</h3>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div className="order-first md:order-last">
                <div className="space-y-4">
                  <p className="text-gray-700">
                    לוח הבקרה מאפשר לחקלאים לעקוב בקלות אחר הזמנות, לקוחות ומכירות:
                  </p>
                  
                  <ul className="space-y-2">
                    <li className="flex items-start">
                      <svg className="w-5 h-5 text-green-600 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                      </svg>
                      <span className="text-gray-700">צפייה בכל ההזמנות והסטטוס שלהן</span>
                    </li>
                    <li className="flex items-start">
                      <svg className="w-5 h-5 text-green-600 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                      </svg>
                      <span className="text-gray-700">ניתוח מכירות וביצועים</span>
                    </li>
                    <li className="flex items-start">
                      <svg className="w-5 h-5 text-green-600 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                      </svg>
                      <span className="text-gray-700">ניהול מוצרים ומודעות מכירה</span>
                    </li>
                    <li className="flex items-start">
                      <svg className="w-5 h-5 text-green-600 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                      </svg>
                      <span className="text-gray-700">מעקב אחר תשלומים והכנסות</span>
                    </li>
                    <li className="flex items-start">
                      <svg className="w-5 h-5 text-green-600 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                      </svg>
                      <span className="text-gray-700">צפייה במיקום ההזמנות ופרטי הלקוחות</span>
                    </li>
                  </ul>
                  
                  <p className="text-gray-700 mt-4">
                    הלוח הבקרה נגיש ופשוט לשימוש, ומאפשר לכם לנהל את העסק שלכם ביעילות ובמהירות.
                  </p>
                </div>
              </div>
              <div className="order-first md:order-first">
                <img src={dashboardImg} alt="לוח בקרה" className="w-full h-auto rounded-lg shadow-lg" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Video Tutorials Section */}
      <div className="bg-gray-50 py-16">
        <div className="container mx-auto px-4 max-w-6xl">
          <h2 className="text-3xl font-bold text-center mb-8">סרטוני הדרכה</h2>
          <p className="text-lg text-center text-gray-700 mb-12 max-w-3xl mx-auto">
            למדו כיצד להשתמש בפלטפורמה בצורה מיטבית באמצעות סרטוני ההדרכה שלנו
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            {/* Farmer Tutorials */}
            <div className="bg-white rounded-xl overflow-hidden shadow-md">
              <div className="bg-green-50 px-6 py-4 border-b border-green-100">
                <h3 className="text-xl font-bold text-green-800">הדרכה לחקלאים</h3>
              </div>
              <div className="p-6">
                <div className="aspect-w-16 aspect-h-9 mb-6">
                  {/* Replace the src with your actual video */}
                  <div className="bg-black relative rounded-lg overflow-hidden">
                    {/* Placeholder for video - replace with actual iframe */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <svg className="w-20 h-20 text-white opacity-80" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                      </svg>
                    </div>
                    {/* Once you have the video, replace this div with the iframe: */}
                    {/* <iframe 
                      src="https://www.youtube.com/embed/YOUR_VIDEO_ID" 
                      title="הדרכה לחקלאים" 
                      frameBorder="0" 
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                      allowFullScreen
                      className="absolute inset-0 w-full h-full"
                    ></iframe> */}
                  </div>
                </div>
                <h4 className="text-lg font-bold mb-2">כיצד למכור את התוצרת שלך</h4>
                <p className="text-gray-600 mb-4">
                  סרטון זה מדריך אותך בכל השלבים הנדרשים להעלאת מוצרים, יצירת מודעות מכירה, הגדרת מחירים ומעקב אחר ההזמנות שלך.
                </p>
                <div className="space-y-2">
                  <div className="flex items-start">
                    <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                    <span className="text-gray-700">העלאת מוצרים ותמונות</span>
                  </div>
                  <div className="flex items-start">
                    <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                    <span className="text-gray-700">יצירת מודעת מכירה</span>
                  </div>
                  <div className="flex items-start">
                    <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                    <span className="text-gray-700">ניהול הזמנות ומשלוחים</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Merchant Tutorials */}
            <div className="bg-white rounded-xl overflow-hidden shadow-md">
              <div className="bg-blue-50 px-6 py-4 border-b border-blue-100">
                <h3 className="text-xl font-bold text-blue-800">הדרכה לסוחרים</h3>
              </div>
              <div className="p-6">
                <div className="aspect-w-16 aspect-h-9 mb-6">
                  {/* Replace the src with your actual video */}
                  <div className="bg-black relative rounded-lg overflow-hidden">
                    {/* Placeholder for video - replace with actual iframe */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <svg className="w-20 h-20 text-white opacity-80" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                      </svg>
                    </div>
                    {/* Once you have the video, replace this div with the iframe: */}
                    {/* <iframe 
                      src="https://www.youtube.com/embed/YOUR_VIDEO_ID" 
                      title="הדרכה לסוחרים" 
                      frameBorder="0" 
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                      allowFullScreen
                      className="absolute inset-0 w-full h-full"
                    ></iframe> */}
                  </div>
                </div>
                <h4 className="text-lg font-bold mb-2">כיצד לרכוש תוצרת טרייה</h4>
                <p className="text-gray-600 mb-4">
                  סרטון זה מראה כיצד לחפש מודעות מכירה, להזמין מוצרים מחקלאים, לבצע תשלום ולעקוב אחר ההזמנות שלך.
                </p>
                <div className="space-y-2">
                  <div className="flex items-start">
                    <svg className="w-5 h-5 text-blue-500 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                    <span className="text-gray-700">מציאת מודעות מכירה פעילות</span>
                  </div>
                  <div className="flex items-start">
                    <svg className="w-5 h-5 text-blue-500 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                    <span className="text-gray-700">ביצוע הזמנה ותשלום</span>
                  </div>
                  <div className="flex items-start">
                    <svg className="w-5 h-5 text-blue-500 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                    <span className="text-gray-700">מעקב אחר הזמנה ותיאום קבלה</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Add a coordinator video tutorial if needed */}
          <div className="mt-12 text-center">
            <h3 className="text-xl font-semibold mb-4">צריכים עזרה נוספת?</h3>
            <p className="text-gray-600 mb-6 max-w-2xl mx-auto">
              אנחנו מוסיפים סרטוני הדרכה חדשים באופן קבוע. אם יש לכם שאלות נוספות, אל תהססו ליצור קשר עם צוות התמיכה שלנו.
            </p>
            <button className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium py-2 px-6 rounded-lg transition-colors">
              כל סרטוני ההדרכה
            </button>
          </div>
        </div>
      </div>

      {/* Call to Action */}
      <div className="bg-green-600 text-white py-16">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <h2 className="text-3xl font-bold mb-6">מוכנים להתחיל?</h2>
          <p className="text-xl mb-8 max-w-2xl mx-auto">
            הצטרפו לקהילת החקלאים והסוחרים שלנו והתחילו ליהנות ממסחר ישיר, פשוט ויעיל.
          </p>
          <div className="space-x-4 space-x-reverse">
            {!currentUser ? (
              <>
                <Link
                  to="/register"
                  className="bg-white text-green-600 hover:bg-gray-100 px-8 py-3 rounded-lg font-medium shadow-md transition-colors inline-block"
                >
                  הרשמה עכשיו
                </Link>
                <Link
                  to="/login"
                  className="bg-transparent border-2 border-white text-white hover:bg-white hover:text-green-600 px-8 py-2.5 rounded-lg font-medium transition-colors inline-block"
                >
                  התחברות
                </Link>
              </>
            ) : (
              <Link
                to="/dashboard"
                className="bg-white text-green-600 hover:bg-gray-100 px-8 py-3 rounded-lg font-medium shadow-md transition-colors inline-block"
              >
                למערכת האישית
              </Link>
            )}
          </div>
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

export default LandingPage;
