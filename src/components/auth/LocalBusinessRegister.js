import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { doCreateUserWithEmailAndPassword } from '../../firebase/auth';
import { LOCAL_BUSINESS_COLLECTION } from '../../constants/accountCollections';
import './AuthForms.css';

const LocalBusinessRegister = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [communityName, setCommunityName] = useState('');
  const [businessKind, setBusinessKind] = useState('');

  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const userData = {
        email,
        name,
        phone,
        businessName,
        communityName,
        businessKind,
        role: 'localBusiness',
        isLocalBusiness: true,
        isIndependent: false,
      };

      await doCreateUserWithEmailAndPassword(
        email,
        password,
        userData,
        LOCAL_BUSINESS_COLLECTION
      );

      navigate('/marketplace/dashboard');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="auth-form-container">
      <h2 className="auth-form-title">פתיחת בסטה בשוק</h2>
      <p className="auth-form-subtitle" style={{ textAlign: 'center', marginBottom: '1rem', color: '#5c4a32' }}>
        הרשמה לעסקים מקומיים בשוק הבסטות — נפרד מהחקלאים העצמאיים ומהמכירה השבועית הראשית.
      </p>
      <form className="auth-form" onSubmit={handleSubmit}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="אימייל"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="סיסמה"
          required
        />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="שם איש קשר"
          required
        />
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="טלפון"
          required
        />
        <input
          type="text"
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          placeholder="שם הבסטה (כפי שיופיע בשוק)"
          required
        />
        <input
          type="text"
          value={communityName}
          onChange={(e) => setCommunityName(e.target.value)}
          placeholder="קהילה / יישוב"
          required
        />
        <input
          type="text"
          value={businessKind}
          onChange={(e) => setBusinessKind(e.target.value)}
          placeholder="סוג העסק (חקלאי, מאפייה, דבש, וכו')"
          required
        />
        <button type="submit">הרשמה לשוק הבסטות</button>
      </form>
      {error && <p className="auth-form-error">{error}</p>}
      <p className="auth-form-switch">
        יש לכם כבר משתמש? <Link to="/login">התחברו</Link>
      </p>
      <p className="auth-form-switch">
        <Link to="/community-marketplace">חזרה לשוק הבסטות</Link>
      </p>
    </div>
  );
};

export default LocalBusinessRegister;
