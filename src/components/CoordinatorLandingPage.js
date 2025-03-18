import React from 'react';
import { Link } from 'react-router-dom';

// Import images - use existing or new ones as needed
import heroImage from '../images/Field.jpg';
import featureImage1 from '../images/orchardhillsrollingoverhorizon.jpg';
import featureImage2 from '../images/rolledhaybalesonfarmland.jpg';
import featureImage3 from '../images/freshlybaledfield.jpg';

const CoordinatorLandingPage = () => {
  return (
    <div dir="rtl" className="min-h-screen bg-gray-50">
      {/* Hero Section - Coordinator Specific with Video */}
      <div className="relative py-20 bg-gradient-to-r from-green-900 to-green-800">
        <div className="absolute inset-0 opacity-20">
          <div 
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${heroImage})` }}
          ></div>
        </div>
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center gap-10">
            {/* Text content */}
            <div className="flex-1 text-center lg:text-right mb-10 lg:mb-0">
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
                הובילו קהילת רכישה משותפת
              </h1>
              <p className="text-xl text-gray-200 mb-3">
                צרו קשר ישיר בין חקלאים וספקים לקהילה שלכם, חסכו לחברי הקהילה כסף וזמן יקר
              </p>
              <p className="text-xl text-yellow-300 font-medium mb-8">
                הרוויחו עמלות אטרקטיביות - 50 עד 150 ש"ח לשעה!
              </p>
              <Link
                to="/coordinator-register"
                className="inline-block bg-yellow-500 hover:bg-yellow-600 text-white text-lg font-medium px-8 py-3 rounded-lg transition-colors duration-300 shadow-lg"
              >
                הצטרפו כרכז/ת קהילה
              </Link>
            </div>
            
            {/* Video */}
            <div className="flex-1 w-full max-w-lg">
              <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden' }}>
                  <iframe 
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
                    src="https://www.youtube.com/embed/qd1VGjkJcfTY" 
                    title="הדרכה לרכזי קהילה"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowFullScreen
                  ></iframe>
                </div>
                <div className="p-5 bg-white text-right">
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">צפו במדריך לרכזי קהילה</h3>
                  <p className="text-gray-600">
                    מדריך מקיף המסביר את כל השלבים ליצירת קהילת רכישה משותפת מצליחה
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* What is a Community Coordinator Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
              מהו רכז קהילה?
            </h2>
            <div className="h-1 w-24 bg-green-600 mx-auto my-4 rounded-full"></div>
            <p className="mt-4 max-w-2xl mx-auto text-xl text-gray-500">
              רכזי קהילה מחברים בין משקים חקלאיים וספקים לבין קבוצות צרכנים בקהילה
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            {/* Left column: Text description */}
            <div className="mt-6 bg-gray-50 rounded-xl p-8 shadow-sm">
              <div className="prose prose-lg">
                <p>
                  כרכז/ת קהילה, תפקידך הוא לחבר בין החקלאים והספקים המקומיים לבין חברי הקהילה שלך. 
                  אתם מאפשרים לחברי הקהילה להזמין תוצרת טרייה ומוצרים איכותיים במחירים הוגנים ישירות מהיצרנים.
                </p>
                <p>
                  המערכת שלנו מאפשרת לך לנהל בקלות את כל ההזמנות, לתקשר עם ספקים וחברי קהילה, ולשמור על מעקב אחר התשלומים והמשלוחים.
                </p>
              </div>
            </div>

            {/* Right column: Video */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden' }}>
                <iframe 
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
                  src="https://www.youtube.com/embed/qd1VGjkJcfTY" 
                  title="הדרכה לרכזי קהילה"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                  allowFullScreen
                ></iframe>
              </div>
              <div className="p-5">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">צפו במדריך לרכזי קהילה</h3>
                <p className="text-gray-600">
                  מדריך מקיף המסביר את כל השלבים ליצירת קהילת רכישה משותפת מצליחה
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Grid */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            היתרונות של רכזי קהילה
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {benefits.map((benefit, index) => (
              <div 
                key={index}
                className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow duration-300 overflow-hidden"
              >
                <div className="h-40 overflow-hidden">
                  <img 
                    src={benefit.image} 
                    alt={benefit.title}
                    className="w-full h-full object-cover transform hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <div className="p-6 text-right">
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">
                    {benefit.title}
                  </h3>
                  <p className="text-gray-600">
                    {benefit.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-16 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            כיצד זה עובד?
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <div key={index} className="text-center">
                <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl font-bold text-white">{index + 1}</span>
                </div>
                <h3 className="text-xl font-semibold mb-3">{step.title}</h3>
                <p className="text-gray-600">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      {/* <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
              מה אומרים רכזי קהילה שלנו
            </h2>
            <div className="h-1 w-24 bg-green-600 mx-auto my-4 rounded-full"></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <div key={index} className="bg-gray-50 p-6 rounded-lg shadow-sm">
                <div className="flex items-center mb-4">
                  <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-xl font-bold">
                    {testimonial.name.charAt(0)}
                  </div>
                  <div className="mr-4">
                    <h4 className="font-medium text-gray-900">{testimonial.name}</h4>
                    <p className="text-sm text-gray-500">{testimonial.role}</p>
                  </div>
                </div>
                <p className="text-gray-600 italic">"{testimonial.quote}"</p>
              </div>
            ))}
          </div>
        </div>
      </section> */}

      {/* CTA Section */}
      <section className="py-20 px-4 bg-gradient-to-r from-green-600 to-green-800 text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-6">
            הצטרפו כרכזי קהילה עוד היום
          </h2>
          <p className="text-xl text-green-100 mb-8">
            עזרו לחברי הקהילה שלכם לקבל תוצרת איכותית במחירים הוגנים ותרמו לחיזוק החקלאות המקומית
          </p>
          <Link
            to="/coordinator-register"
            className="inline-block bg-white text-green-600 text-lg font-medium px-8 py-4 rounded-lg hover:bg-green-50 transition-colors duration-300 shadow-lg"
          >
            הירשמו עכשיו
          </Link>
          <p className="mt-4 text-sm text-green-200">
            אין התחייבות. השירות שלנו חינמי לגמרי לרכזי קהילה.
          </p>
        </div>
      </section>
    </div>
  );
};

// Benefits data
const benefits = [
  {
    title: 'תרומה לקהילה',
    description: 'סייעו לקהילה שלכם לקבל תוצרת טרייה ואיכותית במחירים הוגנים, תוך חיזוק החקלאות המקומית',
    image: featureImage1
  },
  {
    title: 'עמלות אטרקטיביות',
    description: 'קבלו עמלה על כל הזמנה שמגיעה דרככם, ללא עלויות או השקעה ראשונית',
    image: featureImage2
  },
  {
    title: 'מערכת קלה לניהול',
    description: 'המערכת שלנו פשוטה לשימוש ומאפשרת לכם לנהל את כל התהליך בקלות, מההזמנה ועד למשלוח',
    image: featureImage3
  }
];

// How it works steps
const steps = [
  {
    title: 'הרשמה כרכז',
    description: 'הירשמו למערכת בתור רכזי קהילה והגדירו את פרטי הקהילה שלכם'
  },
  {
    title: 'בחירת ספקים',
    description: 'בחרו את הספקים והחקלאים שברצונכם לעבוד איתם מתוך המאגר שלנו'
  },
  {
    title: 'יצירת הזמנה',
    description: 'צרו דף הזמנה והפיצו אותו לחברי הקהילה שלכם'
  },
  {
    title: 'חלוקה לקהילה',
    description: 'קבלו את ההזמנה המרוכזת וארגנו את החלוקה לחברי הקהילה'
  }
];

// Testimonials data
const testimonials = [
  {
    name: 'מיכל כהן',
    role: 'רכזת קהילה בתל אביב',
    quote: 'המערכת חוסכת לי המון זמן בניהול ההזמנות הקהילתיות. חברי הקהילה שלי מרוצים מאוד מהתוצרת הטרייה והמחירים.'
  },
  {
    name: 'יוסי לוי',
    role: 'רכז קהילה בחיפה',
    quote: 'הצלחתי להרחיב את הקהילה שלי בזכות המערכת. הממשק פשוט לשימוש והתמיכה מצוינת.'
  },
  {
    name: 'שירה אברהם',
    role: 'רכזת קהילה בירושלים',
    quote: 'בזכות המערכת אני יכולה לחבר בין חקלאים מקומיים לקהילה שלי בצורה יעילה ולהציע מחירים טובים יותר לכולם.'
  }
];

export default CoordinatorLandingPage; 