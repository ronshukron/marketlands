import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { doCreateUserWithEmailAndPassword, doSignInWithGoogle } from '../../firebase/auth';
import { collection, query, where, getDocs, updateDoc, arrayUnion, doc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { searchCommunities } from '../../services/communityService';
import LoadingSpinner from '../LoadingSpinner';
import './AuthForms.css';
import { getAuth } from 'firebase/auth';

// Searchable community picker backed by the Firestore `communities` collection.
// Only existing communities can be selected (no free-text creation).
const CommunityAutocomplete = ({ value, onChange, onSelect, error, placeholder = 'קהילה' }) => {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (suggestionRef.current && !suggestionRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced Firestore search so we don't hammer the DB on every keystroke.
  useEffect(() => {
    let active = true;
    const handle = setTimeout(async () => {
      try {
        const results = await searchCommunities(value);
        if (!active) return;
        setSuggestions(
          (results || []).map((c) => ({ name: c.name || c.id, region: c.region || 'אחר' }))
        );
      } catch (err) {
        console.error('Failed to search communities:', err);
        if (active) setSuggestions([]);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [value]);

  return (
    <div className="form-group relative" ref={suggestionRef}>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setShowSuggestions(true);
        }}
        onFocus={() => setShowSuggestions(true)}
        placeholder={placeholder}
        className={`w-full ${error ? 'input-error' : ''}`}
      />
      {error && <p className="error-message">{error}</p>}

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-10 bg-white border border-gray-300 rounded mt-1 w-full max-h-40 overflow-y-auto">
          {suggestions.map((item, index) => (
            <div
              key={`${item.name}-${index}`}
              className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
              onClick={() => {
                onSelect(item.name);
                setShowSuggestions(false);
              }}
            >
              {item.name} ({item.region})
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const UserRegister = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [community, setCommunity] = useState('');
  const [error, setError] = useState('');
  const [isSigningUp, setIsSigningUp] = useState(false);

  // Field-specific validation states
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [nameError, setNameError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [communityError, setCommunityError] = useState('');

  // Post-Google-signin community selection step.
  const [needsCommunity, setNeedsCommunity] = useState(false);
  const [pendingUid, setPendingUid] = useState(null);

  const navigate = useNavigate();

  // Look up a community doc by exact name. Returns the doc snapshot or null.
  const checkCommunityExists = async (communityName) => {
    const q = query(
      collection(db, 'communities'),
      where('name', '==', communityName.trim())
    );
    const snap = await getDocs(q);
    return !snap.empty ? snap.docs[0] : null;
  };

  // Add the new user's uid to the community doc (background).
  const addUserToCommunityInBackground = async (communityName) => {
    try {
      const auth = getAuth();
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const q = query(collection(db, 'communities'), where('name', '==', communityName.trim()));
      const snap = await getDocs(q);
      if (!snap.empty) {
        await Promise.all(snap.docs.map((d) => updateDoc(d.ref, { userIds: arrayUnion(uid) })));
      }
    } catch (err) {
      console.error('Failed to add user to community (background):', err);
    }
  };

  // Validation functions
  const validateEmail = (value) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!value) {
      setEmailError('אימייל הוא שדה חובה');
      return false;
    } else if (!emailRegex.test(value)) {
      setEmailError('אנא הזן כתובת אימייל תקינה');
      return false;
    }
    setEmailError('');
    return true;
  };

  const validatePassword = (value) => {
    if (!value) {
      setPasswordError('סיסמה היא שדה חובה');
      return false;
    } else if (value.length < 6) {
      setPasswordError('הסיסמה חייבת להכיל לפחות 6 תווים');
      return false;
    }
    setPasswordError('');
    return true;
  };

  const validateName = (value) => {
    if (!value) {
      setNameError('שם הוא שדה חובה');
      return false;
    } else if (value.length < 2) {
      setNameError('השם חייב להכיל לפחות 2 תווים');
      return false;
    }
    setNameError('');
    return true;
  };

  const validatePhone = (value) => {
    const phoneRegex = /^0\d{8,9}$/;
    if (!value) {
      setPhoneError('טלפון הוא שדה חובה');
      return false;
    } else if (!phoneRegex.test(value.replace(/[-\s]/g, ''))) {
      setPhoneError('מספר טלפון לא תקין');
      return false;
    }
    setPhoneError('');
    return true;
  };

  const validateCommunity = (value) => {
    if (!value || !value.trim()) {
      setCommunityError('קהילה היא שדה חובה');
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

      const communityName = community.trim();

      // Community must exist in the DB — no free-text creation.
      const existingCommunity = await checkCommunityExists(communityName);
      if (!existingCommunity) {
        setCommunityError('יש לבחור קהילה קיימת מהרשימה');
        setIsSigningUp(false);
        return;
      }

      const userData = {
        email,
        name,
        phone,
        communityName,
        community: communityName,
        role: 'user',
      };

      await doCreateUserWithEmailAndPassword(email, password, userData, 'users');

      // Navigate immediately for better UX
      navigate('/');

      // Background task: add user to the community's member list
      addUserToCommunityInBackground(communityName);
    } catch (error) {
      console.error('Registration failed:', error);
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

      const userCredential = await doSignInWithGoogle();
      const uid = userCredential?.user?.uid || null;

      // Google sign-ups must also pick a community before continuing.
      // Show the community-selection step instead of navigating away.
      setPendingUid(uid);
      setCommunity('');
      setCommunityError('');
      setNeedsCommunity(true);
    } catch (error) {
      console.error('Google sign-in failed:', error);
      setError(error.message || 'אירעה שגיאה בעת ההרשמה עם Google');
    } finally {
      setIsSigningUp(false);
    }
  };

  const handleConfirmGoogleCommunity = async () => {
    if (isSigningUp) return;
    if (!validateCommunity(community)) return;

    try {
      setIsSigningUp(true);
      setError('');

      const communityName = community.trim();
      const existingCommunity = await checkCommunityExists(communityName);
      if (!existingCommunity) {
        setCommunityError('יש לבחור קהילה קיימת מהרשימה');
        setIsSigningUp(false);
        return;
      }

      const uid = pendingUid || getAuth().currentUser?.uid;
      if (uid) {
        await updateDoc(doc(db, 'users', uid), {
          communityName,
          community: communityName,
        });
      }

      navigate('/');
      addUserToCommunityInBackground(communityName);
    } catch (error) {
      console.error('Failed to save community for Google user:', error);
      setError(error.message || 'אירעה שגיאה בעת שמירת הקהילה');
    } finally {
      setIsSigningUp(false);
    }
  };

  // Show loading spinner during registration
  if (isSigningUp) {
    return <LoadingSpinner />;
  }

  // Post-Google-signin community selection step
  if (needsCommunity) {
    return (
      <div className="auth-form-container">
        <h2 className="auth-form-title">בחרו את הקהילה שלכם</h2>
        <p className="text-sm text-gray-600 mb-4 text-center">
          כדי להשלים את ההרשמה, בחרו את הקהילה שלכם מהרשימה.
        </p>

        <CommunityAutocomplete
          value={community}
          onChange={(val) => {
            setCommunity(val);
            setCommunityError('');
          }}
          onSelect={(val) => {
            setCommunity(val);
            setCommunityError('');
          }}
          error={communityError}
        />

        <button type="button" onClick={handleConfirmGoogleCommunity}>
          המשך
        </button>

        {error && <p className="auth-form-error">{error}</p>}
      </div>
    );
  }

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

        <CommunityAutocomplete
          value={community}
          onChange={(val) => {
            setCommunity(val);
            setCommunityError('');
          }}
          onSelect={(val) => {
            setCommunity(val);
            setCommunityError('');
          }}
          error={communityError}
        />

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
          <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001, 0.002-0.001, 0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"></path>
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
