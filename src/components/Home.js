// src/components/Home.js

import React, { useEffect } from 'react';
import './Home.css';

// Replace these images with your own and ensure they are imported correctly
import logo from '../images/Field.jpg'; // Use your actual logo image
import heroImage from '../images/Field.jpg'; // Use your actual hero image
import featureImage1 from '../images/orchardhillsrollingoverhorizon.jpg';
import featureImage2 from '../images/rolledhaybalesonfarmland.jpg';
import featureImage3 from '../images/sunlightdropedbelowhorizonbehindmountains.jpg';
import featureImage4 from '../images/freshlybaledfield.jpg';

const Home = () => {
  // useEffect(() => {
  //   const handleScroll = () => {
  //     const nav = document.querySelector('.navigation');
  //     const body = document.body;

  //     if (window.scrollY > 50) {
  //       nav.classList.add('scrolled');
  //       body.classList.add('scrolled');
  //     } else {
  //       nav.classList.remove('scrolled');
  //       body.classList.remove('scrolled');
  //     }
  //   };

  //   window.addEventListener('scroll', handleScroll);

  //   // Clean up the event listener
  //   return () => window.removeEventListener('scroll', handleScroll);
  // }, []);

  return (
    <div className="landing-page">
      
      {/* Navigation */}
      {/* <nav className="navigation"> */}
        {/* <img src={logo} alt="Logo" className="logo" /> */}
        {/* <div className="nav-links">
          <a href="#features">תכונות</a>
          <a href="#how-it-works">איך זה עובד</a>
          <a href="#contact">צור קשר</a>
        </div>
      </nav> */}

      {/* Hero Section */}
      <section
        className="hero"
        id="home"
        style={{ backgroundImage: `url(${heroImage})` }}
      >
        <div className="overlay"></div>
        <div className="hero-content">
          <h1>הרחב את העסק שלך עם הפלטפורמה שלנו</h1>
          <p>
            פתחו דפי מכירה עבור קבוצות רכישה, עקבו אחר הזמנות, ונהלו אותם בקלות,
            הכל בחינם!
          </p>
          <a href="#features" className="cta-button">
            התחל עכשיו
          </a>
        </div>
      </section>

      <section className="feature-section" id="features">
        <div
          className="feature-image"
          style={{ backgroundImage: `url(${featureImage4})` }}
        >
          <div className="overlay"></div>
          <div className="feature-content">
            <h2>קבלת תשלומים</h2>
            <p>
              אפשר ללקוחותיך לשלם באמצעות כרטיסי אשראי וביט בצורה מאובטחת. אנו
              משתמשים בטכנולוגיות ההצפנה המתקדמות ביותר כדי להבטיח שהמידע הכספי
              שלך ושל לקוחותיך מוגן.
            </p>
          </div>
        </div>
      </section>


      {/* Features Sections */}
      <section className="feature-section" >
        <div
          className="feature-image"
          style={{ backgroundImage: `url(${featureImage1})` }}
        >
          <div className="overlay"></div>
          <div className="feature-content">
            <h2>צור דפי רכישה קבוציתיות</h2>
            <p>
              הצג את המוצרים שלך בצורה מקצועית ונוחה, עם אפשרות להוסיף תמונות,
              תיאורים, ומחירים אטרקטיביים. דפי רכישה קבוציתיות שלנו מותאמים למכשירים
              ניידים ומספקים חוויית משתמש מעולה ללקוחותיך.
            </p>
          </div>
        </div>
      </section>

      <section className="feature-section" id="how-it-works">
        <div
          className="feature-image"
          style={{ backgroundImage: `url(${featureImage2})` }}
        >
          <div className="overlay"></div>
          <div className="feature-content">
            <h2>עקוב אחר הזמנות</h2>
            <p>
              קבל גישה מיידית להזמנות נכנסות, עדכן את המלאי שלך בזמן אמת, ונהל
              את כל ההזמנות במקום אחד. המערכת שלנו מאפשרת לך לראות סטטיסטיקות
              מפורטות על המכירות שלך.
            </p>
          </div>
        </div>
      </section>

      <section className="feature-section">
        <div
          className="feature-image"
          style={{ backgroundImage: `url(${featureImage3})` }}
        >
          <div className="overlay"></div>
          <div className="feature-content">
            <h2>היסטוריה</h2>
            <p>
              גש לכל ההזמנות הקודמות שלך, נתח מגמות, וגלה אילו מוצרים הם
              הפופולריים ביותר. המידע הזה יסייע לך לקבל החלטות עסקיות מושכלות
              ולשפר את השירות שלך.
            </p>
          </div>
        </div>
      </section>

      {/* Video Section */}
      <section className="video-section">
        <div className="video-content">
          <h2>גלה עוד בסרטון שלנו</h2>
          <div className="video-container">
            {/* Replace 'YOUR_VIDEO_ID' with your actual YouTube video ID */}
            <iframe
              src="https://www.youtube.com/embed/YOUR_VIDEO_ID"
              title="YouTube video"
              frameBorder="0"
              allowFullScreen
            ></iframe>
          </div>
        </div>
      </section>

      {/* Call to Action Section */}
      <section className="cta-section" id="signup">
        <h2>מוכן להתחיל?</h2>
        <p>הצטרף לפלטפורמה שלנו והרחב את העסק שלך היום.</p>
        <a href="/business-register" className="cta-button">
          הצטרף עכשיו
        </a>
      </section>

      {/* Footer */}
      <footer className="footer" id="contact">
        <img src={logo} alt="Logo" className="footer-logo" />
        <div className="footer-links">
          <a href="#features">תכונות</a>
          <a href="#how-it-works">איך זה עובד</a>
          <a href="#contact">צור קשר</a>
        </div>
        <p>© 2023 כל הזכויות שמורות.</p>
      </footer>
    </div>
  );
};

export default Home;
