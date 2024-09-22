import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { doCreateUserWithEmailAndPassword } from '../../firebase/auth';
import './AuthForms.css';

const CoordinatorRegister = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [community, setCommunity] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // State variables for validation errors
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [nameError, setNameError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [communityError, setCommunityError] = useState('');

  const validateEmail = (email) => {
    const re = /\S+@\S+\.\S+/;
    return re.test(email);
  };

  const validatePhone = (phone) => {
    // Israeli mobile phone numbers: exactly 10 digits, start with '05'
    const re = /^05\d{8}$/;
    return re.test(phone);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    let valid = true;

    // Reset error messages
    setEmailError('');
    setPasswordError('');
    setNameError('');
    setPhoneError('');
    setCommunityError('');
    setError('');

    // Email validation
    if (!validateEmail(email)) {
      setEmailError('כתובת אימייל לא תקינה');
      valid = false;
    }

    // Password validation
    if (password.length < 6) {
      setPasswordError('הסיסמה חייבת להכיל לפחות 6 תווים');
      valid = false;
    }

    // Name validation (at least 3 characters)
    if (name.trim().length < 3) {
      setNameError('השם חייב להכיל לפחות 3 תווים');
      valid = false;
    }

    // Phone validation
    if (!validatePhone(phone)) {
      setPhoneError('מספר טלפון לא תקין. יש להזין מספר נייד בעל 10 ספרות המתחיל ב-05');
      valid = false;
    }

    // Community validation (at least 3 characters)
    if (community.trim().length < 3) {
      setCommunityError('הקהילה חייבת להכיל לפחות 3 תווים');
      valid = false;
    }

    if (!valid) {
      return;
    }

    try {
      const userData = {
        email,
        name,
        phone,
        community,
        role: 'coordinator',
      };
      await doCreateUserWithEmailAndPassword(
        email,
        password,
        userData,
        'coordinators'
      );
      navigate('/');
    } catch (error) {
      setError('הרישום נכשל. אנא נסה שוב.');
    }
  };

  return (
    <div className="auth-form-container">
      <h2 className="auth-form-title">הירשמו בתור רכז</h2>
      <form className="auth-form" onSubmit={handleSubmit}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="אימייל"
          required
        />
        {emailError && <p className="auth-form-error">{emailError}</p>}

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="סיסמה"
          required
        />
        {passwordError && <p className="auth-form-error">{passwordError}</p>}

        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="שם מלא"
          required
        />
        {nameError && <p className="auth-form-error">{nameError}</p>}

        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="טלפון"
          required
        />
        {phoneError && <p className="auth-form-error">{phoneError}</p>}

        <input
          type="text"
          value={community}
          onChange={(e) => setCommunity(e.target.value)}
          placeholder="קהילה"
          required
        />
        {communityError && <p className="auth-form-error">{communityError}</p>}

        <button type="submit">הירשם</button>
      </form>
      {error && <p className="auth-form-error">{error}</p>}
      <p className="auth-form-switch">
        יש לכם כבר משתמש? <Link to="/login">התחברו</Link>
      </p>
    </div>
  );
};

export default CoordinatorRegister;
