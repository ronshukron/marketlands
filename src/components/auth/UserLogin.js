import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { doSignInWithEmailAndPassword, doSignInWithGoogle } from '../../firebase/auth';
import { useAuth } from '../../contexts/authContext';
import './AuthForms.css';

const UserLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const navigate = useNavigate();
  const { userLoggedIn } = useAuth();

  useEffect(() => {
    if (userLoggedIn) {
      navigate('/');
    }
  }, [userLoggedIn, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSigningIn) return;
    
    try {
      setIsSigningIn(true);
      setError('');
      await doSignInWithEmailAndPassword(email, password);
      navigate('/');
    } catch (error) {
      console.error("Login failed:", error);
      setError(error.message || 'שם משתמש או סיסמה שגויים');
    } finally {
      setIsSigningIn(false);
    }
  };

  // Handle Google Sign-in
  const handleGoogleSignIn = async (e) => {
    e.preventDefault();
    if (isSigningIn) return;
    
    try {
      setIsSigningIn(true);
      setError('');
      await doSignInWithGoogle();
      navigate('/');
    } catch (error) {
      console.error("Google sign-in failed:", error);
      setError(error.message || 'אירעה שגיאה בעת ההתחברות עם Google');
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className="auth-form-container">
      <h2 className="auth-form-title">התחברות</h2>
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
        <button 
          type="submit" 
          disabled={isSigningIn}
          className={isSigningIn ? 'button-disabled' : ''}
        >
          {isSigningIn ? 'מתחבר...' : 'התחבר'}
        </button>
      </form>
      
      {error && <p className="auth-form-error">{error}</p>}
      
      <div className="auth-divider">
        <span>או</span>
      </div>
      
      <button 
        onClick={handleGoogleSignIn}
        disabled={isSigningIn}
        className="google-auth-button"
      >
        <svg className="google-icon" viewBox="0 0 48 48">
          <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"></path>
          <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"></path>
          <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"></path>
          <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"></path>
        </svg>
        התחבר עם Google
      </button>
      
      <p className="auth-form-switch">
        אין לכם משתמש? <Link to="/user-register">הירשמו</Link>
      </p>
    </div>
  );
};

export default UserLogin;