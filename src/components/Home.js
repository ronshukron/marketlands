// src/components/Home.js
import React from 'react';
import './Home.css'; // Ensure this path is correct
import mainImage from '../images/vegetables.jpg'; // Path to your main image file
import testimonialImage from '../images/Field.jpg'; // Path to your testimonial image file

const Home = () => {
  return (
    <div className="home">
      <header className="home-header">
        <img src={mainImage} alt="קהילות ויצרנים" className="main-image"/>
        <div className="header-content">
          <h1>הפלטפורמת לרכישה קהילתית עבור הרכז הקהילתי</h1>
          <p>אנחנו מחברים בין יצרנים לרכזי קהילות שמעוניינים לבצע רכישה סיטונאית בצורה קלה ויעילה</p>
        </div>
      </header>
      
      <section className="how-it-works">
        <h2>איך זה עובד</h2>
        <p>רכזי קהילות מייצרים הזמנה עבור ספק מסויים ושולחים לינק לטופס ההזמנה לקהילה שלהם, בטופס חברי הקהילה יכולים לראות הכל על המוצרים ולהזמין. כאשר הרכז מחליט שנגמר הזמן, הוא מעביר את ההזמנה הלאה ליצרן/חקלאי</p>
      </section>
      
      <section className="benefits">
        <h2>היתרונות</h2>
        <ul>
          <li>רכישה במחירים סיטונאים עבור חברי הקהילה</li>
          <li>גישה ישירה לשוק היצרנים</li>
          <li>מערכת ניהול הזמנות ולוגיסטיקה מוסדרת</li>
        </ul>
      </section>
      
      {/* <section className="testimonials">
        <img src={testimonialImage} alt="חברי קהילה מרוצים" className="testimonial-image"/>
        <div>
          <h2>המלצות</h2>
          <p>"שימוש בפלטפורמה זו הקל מאוד על ארגון רכישות מרוכזות עבור קהילתנו!" - מנהל קהילה</p>
        </div>
      </section> */}
    </div>
  );
};

export default Home;
