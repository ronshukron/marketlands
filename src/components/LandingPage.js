// // src/components/LandingPage.js

// import React from 'react';
// import './LandingPage.css';

// // Replace these images with your own and ensure they are imported correctly
// import logo from '../assets/logo.png';
// import heroImage from '../assets/hero-image.jpg';
// import feature1 from '../assets/feature1.png';
// import feature2 from '../assets/feature2.png';
// import feature3 from '../assets/feature3.png';
// import feature4 from '../assets/feature4.png';

// const LandingPage = () => {
//   return (
//     <div className="landing-page">
//       {/* Hero Section */}
//       <section className="hero">
//         <div className="container">
//           <nav className="navigation">
//             <img src={logo} alt="Logo" className="logo" />
//             <a href="#features">תכונות</a>
//             <a href="#how-it-works">איך זה עובד</a>
//             <a href="#contact">צור קשר</a>
//           </nav>
//           <div className="hero-content">
//             <h1>הרחב את העסק שלך עם הפלטפורמה שלנו</h1>
//             <p>צור דפי סיטונאות, עקוב אחר הזמנות, ושלוט בהיסטוריה - הכל במקום אחד.</p>
//             <a href="#signup" className="cta-button">התחל עכשיו</a>
//           </div>
//         </div>
//       </section>

//       {/* Features Section */}
//       <section className="features" id="features">
//         <div className="container">
//           <h2>מה הפלטפורמה שלנו מציעה?</h2>
//           <div className="feature-list">
//             <div className="feature-item">
//               <img src={feature1} alt="Create Wholesale Pages" />
//               <h3>צור דפי סיטונאות</h3>
//               <p>הצג את המוצרים שלך לסיטונאים באופן מקצועי ונוח.</p>
//             </div>
//             <div className="feature-item">
//               <img src={feature2} alt="Track Orders" />
//               <h3>עקוב אחר הזמנות</h3>
//               <p>קבל מידע בזמן אמת על הזמנות נכנסות וניהול מלאי.</p>
//             </div>
//             <div className="feature-item">
//               <img src={feature3} alt="Manage History" />
//               <h3>שלוט בהיסטוריה</h3>
//               <p>צפה בהיסטוריית ההזמנות שלך כדי לנתח מגמות ולהבין את הלקוחות שלך.</p>
//             </div>
//             <div className="feature-item">
//               <img src={feature4} alt="Accept Payments" />
//               <h3>קבלת תשלומים</h3>
//               <p>קבל תשלומים באמצעות כרטיסי אשראי וביט בצורה מאובטחת.</p>
//             </div>
//           </div>
//         </div>
//       </section>

//       {/* How It Works Section */}
//       <section className="how-it-works" id="how-it-works">
//         <div className="container">
//           <h2>איך זה עובד?</h2>
//           <div className="steps">
//             <div className="step-item">
//               <span className="step-number">1</span>
//               <h3>הירשם לפלטפורמה</h3>
//               <p>צור חשבון והגדר את הפרופיל העסקי שלך בקלות.</p>
//             </div>
//             <div className="step-item">
//               <span className="step-number">2</span>
//               <h3>הוסף את המוצרים שלך</h3>
//               <p>העלה את המוצרים שלך עם תמונות, תיאורים ומחירים.</p>
//             </div>
//             <div className="step-item">
//               <span className="step-number">3</span>
//               <h3>שתף את דף הסיטונאות</h3>
//               <p>שתף את הדף שלך עם לקוחות פוטנציאליים וקיים הזמנות.</p>
//             </div>
//             <div className="step-item">
//               <span className="step-number">4</span>
//               <h3>נהל הזמנות ותשלומים</h3>
//               <p>עקוב אחר הזמנות וקבל תשלומים בצורה מאובטחת.</p>
//             </div>
//           </div>
//         </div>
//       </section>

//       {/* Video Section */}
//       <section className="video-section">
//         <div className="container">
//           <h2>צפה בסרטון כדי ללמוד עוד</h2>
//           <div className="video-container">
//             {/* Replace 'YOUR_VIDEO_ID' with your actual YouTube video ID */}
//             <iframe
//               width="560"
//               height="315"
//               src="https://www.youtube.com/embed/YOUR_VIDEO_ID"
//               title="YouTube video"
//               frameBorder="0"
//               allowFullScreen
//             ></iframe>
//           </div>
//         </div>
//       </section>

//       {/* Call to Action Section */}
//       <section className="cta-section" id="signup">
//         <div className="container">
//           <h2>מוכן להתחיל?</h2>
//           <p>הצטרף לפלטפורמה שלנו והרחב את העסק שלך היום.</p>
//           <a href="#contact" className="cta-button">הצטרף עכשיו</a>
//         </div>
//       </section>

//       {/* Footer */}
//       <footer className="footer" id="contact">
//         <div className="container">
//           <img src={logo} alt="Logo" className="footer-logo" />
//           <div className="footer-links">
//             <a href="#features">תכונות</a>
//             <a href="#how-it-works">איך זה עובד</a>
//             <a href="#contact">צור קשר</a>
//           </div>
//           <p>© 2023 כל הזכויות שמורות.</p>
//         </div>
//       </footer>
//     </div>
//   );
// };

// export default LandingPage;
