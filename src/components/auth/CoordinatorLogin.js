import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doSignInWithEmailAndPassword } from '../../firebase/auth';

const CoordinatorLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // New state variables for validation
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const validateEmail = (email) => {
    // Simple email regex for validation
    const re = /\S+@\S+\.\S+/;
    return re.test(email);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    let valid = true;

    // Reset error messages
    setEmailError('');
    setPasswordError('');
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

    if (!valid) {
      return;
    }

    try {
      await doSignInWithEmailAndPassword(email, password);
      navigate('/dashboard');
    } catch (error) {
      setError('אימייל או סיסמה שגויים');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        required
      />
      {emailError && <p style={{ color: 'red' }}>{emailError}</p>}
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        required
      />
      {passwordError && <p style={{ color: 'red' }}>{passwordError}</p>}
      <button type="submit">Login as Coordinator</button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </form>
  );
};

export default CoordinatorLogin;
