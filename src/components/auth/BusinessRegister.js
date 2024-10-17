import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { doCreateUserWithEmailAndPassword } from '../../firebase/auth';
import './AuthForms.css';

const BusinessRegister = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const userData = { email, name, phone, businessName, role: 'business' };
      await doCreateUserWithEmailAndPassword(email, password, userData, 'businesses');
      navigate('/business-dashboard');
    } catch (error) {
      setError(error.message);
    }
  };

  return (
    <div className="auth-form-container">
      <h2 className="auth-form-title">הירשמו כעסק</h2>
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
          placeholder="שם מלא" 
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
          placeholder="שם העסק" 
          required 
        />
        <button type="submit">הירשם כעסק</button>
      </form>
      {error && <p className="auth-form-error">{error}</p>}
      <p className="auth-form-switch">
        יש לכם כבר משתמש? <Link to="/login">התחברו</Link>
      </p>
    </div>
  );
};

export default BusinessRegister;
