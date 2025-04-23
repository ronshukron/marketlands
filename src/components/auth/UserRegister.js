import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { doCreateUserWithEmailAndPassword, doSignInWithGoogle } from '../../firebase/auth';
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
  const [isSigningUp, setIsSigningUp] = useState(false);
  
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
      setEmailError('אנא הזן כתובת אימייל תקינה');
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
    if (!name) {
      setNameError('שם הוא שדה חובה');
      return false;
    } else if (name.length < 2) {
      setNameError('השם חייב להכיל לפחות 2 תווים');
      return false;
    }
    setNameError('');
    return true;
  };

  const validatePhone = (phone) => {
    const phoneRegex = /^0\d{8,9}$/;
    if (!phone) {
      setPhoneError('טלפון הוא שדה חובה');
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

  const validateForm = () => {
    const isEmailValid = validateEmail(email);
    const isPasswordValid = validatePassword(password);
    const isNameValid = validateName(name);
    const isPhoneValid = validatePhone(phone);
    const isCommunityValid = validateCommunity(community);
    
    return isEmailValid && isPasswordValid && isNameValid && isPhoneValid && isCommunityValid;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm() || isSigningUp) {
      return;
    }
    
    try {
      setIsSigningUp(true);
      setError('');
      
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
      console.error("Registration failed:", error);
      setError(error.message || 'אירעה שגיאה בעת ההרשמה');
    } finally {
      setIsSigningUp(false);
    }
  };

  // Handle Google Sign-in
  const handleGoogleSignIn = async (e) => {
    e.preventDefault();
    if (isSigningUp) return;
    
    try {
      setIsSigningUp(true);
      setError('');
      
      await doSignInWithGoogle();
      navigate('/');
    } catch (error) {
      console.error("Google sign-in failed:", error);
      setError(error.message || 'אירעה שגיאה בעת ההרשמה עם Google');
    } finally {
      setIsSigningUp(false);
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
        
        <button 
          type="submit" 
          disabled={isSigningUp}
          className={isSigningUp ? 'button-disabled' : ''}
        >
          {isSigningUp ? 'מבצע רישום...' : 'הירשם'}
        </button>
      </form>
      
      {error && <p className="auth-form-error">{error}</p>}
      
      <div className="auth-divider">
        <span>או</span>
      </div>
      
      <button 
        onClick={handleGoogleSignIn}
        disabled={isSigningUp}
        className="google-auth-button"
      >
        <svg className="google-icon" viewBox="0 0 48 48">
          <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"></path>
          <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"></path>
          <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"></path>
          <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"></path>
        </svg>
        המשך עם Google
      </button>
      
      <p className="auth-form-switch">
        יש לכם כבר משתמש? <Link to="/login">התחברו</Link>
      </p>
    </div>
  );
};

export default UserRegister;