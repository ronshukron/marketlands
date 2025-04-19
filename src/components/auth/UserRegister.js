import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { doCreateUserWithEmailAndPassword } from '../../firebase/auth';
import { pickupSpots } from '../../data/pickupSpots';
import './AuthForms.css';

const UserRegister = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [community, setCommunity] = useState('');
  const [filteredSpots, setFilteredSpots] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [error, setError] = useState('');
  
  // Field-specific validation states
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [nameError, setNameError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [communityError, setCommunityError] = useState('');
  
  const navigate = useNavigate();
  const suggestionRef = useRef(null);

  // Effect for outside click detection
  useEffect(() => {
    function handleClickOutside(event) {
      if (suggestionRef.current && !suggestionRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    }
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Effect for filtering spots based on input
  useEffect(() => {
    if (community) {
      const filtered = pickupSpots.filter(spot => 
        spot.toLowerCase().includes(community.toLowerCase())
      );
      setFilteredSpots(filtered);
    } else {
      setFilteredSpots([]);
    }
  }, [community]);

  const handleCommunityChange = (e) => {
    setCommunity(e.target.value);
    setCommunityError('');
    setShowSuggestions(true);
  };

  const handleSelectCommunity = (spot) => {
    setCommunity(spot);
    setCommunityError('');
    setShowSuggestions(false);
  };

  // Validation functions
  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) {
      setEmailError('אימייל הוא שדה חובה');
      return false;
    } else if (!emailRegex.test(email)) {
      setEmailError('כתובת אימייל לא תקינה');
      return false;
    }
    setEmailError('');
    return true;
  };

  const validatePassword = (password) => {
    if (!password) {
      setPasswordError('סיסמה היא שדה חובה');
      return false;
    } else if (password.length < 6) {
      setPasswordError('הסיסמה חייבת להכיל לפחות 6 תווים');
      return false;
    }
    setPasswordError('');
    return true;
  };

  const validateName = (name) => {
    if (!name.trim()) {
      setNameError('שם מלא הוא שדה חובה');
      return false;
    } else if (name.trim().length < 2) {
      setNameError('שם מלא חייב להכיל לפחות 2 תווים');
      return false;
    }
    setNameError('');
    return true;
  };

  const validatePhone = (phone) => {
    // Israeli phone number validation (flexible)
    const phoneRegex = /^0\d{8,9}$/;
    if (!phone) {
      setPhoneError('מספר טלפון הוא שדה חובה');
      return false;
    } else if (!phoneRegex.test(phone.replace(/[-\s]/g, ''))) {
      setPhoneError('מספר טלפון לא תקין');
      return false;
    }
    setPhoneError('');
    return true;
  };

  const validateCommunity = (community) => {
    if (!community) {
      setCommunityError('קהילה היא שדה חובה');
      return false;
    } else if (!pickupSpots.includes(community)) {
      setCommunityError('נא לבחור קהילה מהרשימה');
      return false;
    }
    setCommunityError('');
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate all fields
    const isEmailValid = validateEmail(email);
    const isPasswordValid = validatePassword(password);
    const isNameValid = validateName(name);
    const isPhoneValid = validatePhone(phone);
    const isCommunityValid = validateCommunity(community);
    
    // If any validation fails, stop the submission
    if (!isEmailValid || !isPasswordValid || !isNameValid || !isPhoneValid || !isCommunityValid) {
      return;
    }
    
    // Reset general error
    setError('');
    
    try {
      const userData = { 
        email, 
        name, 
        phone, 
        community,
        role: 'user' 
      };
      await doCreateUserWithEmailAndPassword(email, password, userData, 'users');
      navigate('/');
    } catch (error) {
      setError(error.message);
    }
  };

  return (
    <div className="auth-form-container">
      <h2 className="auth-form-title">הירשמו לאתר</h2>
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <input 
            type="email" 
            value={email} 
            onChange={(e) => {
              setEmail(e.target.value);
              setEmailError('');
            }} 
            onBlur={() => validateEmail(email)}
            placeholder="אימייל" 
            className={emailError ? 'input-error' : ''}
          />
          {emailError && <p className="error-message">{emailError}</p>}
        </div>
        
        <div className="form-group">
          <input 
            type="password" 
            value={password} 
            onChange={(e) => {
              setPassword(e.target.value);
              setPasswordError('');
            }} 
            onBlur={() => validatePassword(password)}
            placeholder="סיסמה" 
            className={passwordError ? 'input-error' : ''}
          />
          {passwordError && <p className="error-message">{passwordError}</p>}
        </div>
        
        <div className="form-group">
          <input 
            type="text" 
            value={name} 
            onChange={(e) => {
              setName(e.target.value);
              setNameError('');
            }} 
            onBlur={() => validateName(name)}
            placeholder="שם מלא" 
            className={nameError ? 'input-error' : ''}
          />
          {nameError && <p className="error-message">{nameError}</p>}
        </div>
        
        <div className="form-group">
          <input 
            type="tel" 
            value={phone} 
            onChange={(e) => {
              setPhone(e.target.value);
              setPhoneError('');
            }} 
            onBlur={() => validatePhone(phone)}
            placeholder="טלפון" 
            className={phoneError ? 'input-error' : ''}
          />
          {phoneError && <p className="error-message">{phoneError}</p>}
        </div>
        
        <div className="form-group relative">
          <input 
            type="text" 
            value={community} 
            onChange={handleCommunityChange}
            onBlur={() => validateCommunity(community)} 
            placeholder="קהילה" 
            className={`w-full ${communityError ? 'input-error' : ''}`}
          />
          {communityError && <p className="error-message">{communityError}</p>}
          
          {showSuggestions && filteredSpots.length > 0 && (
            <div 
              ref={suggestionRef}
              className="absolute z-10 bg-white border border-gray-300 rounded mt-1 w-full max-h-40 overflow-y-auto"
            >
              {filteredSpots.map((spot, index) => (
                <div 
                  key={index} 
                  className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                  onClick={() => handleSelectCommunity(spot)}
                >
                  {spot}
                </div>
              ))}
            </div>
          )}
        </div>
        
        <button type="submit">הירשם</button>
      </form>
      
      {error && <p className="auth-form-error">{error}</p>}
      
      <p className="auth-form-switch">
        יש לכם כבר משתמש? <Link to="/login">התחברו</Link>
      </p>
    </div>
  );
};

export default UserRegister;