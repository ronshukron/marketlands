// src/components/PrivateRoute.js
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/authContext';

// List of admin UIDs that are allowed to access protected routes
const ADMIN_UIDS = ['YOUR_USER_ID_HERE']; // Replace with your actual UID

const PrivateRoute = ({ children }) => {
  const { currentUser } = useAuth();
  
  // Check if user is logged in and is an admin
  const isAuthorized = currentUser && ADMIN_UIDS.includes(currentUser.uid);
  
  // If not authorized, redirect to home page
  if (!isAuthorized) {
    return <Navigate to="/" replace />;
  }
  
  // If authorized, render the children components
  return children;
};

export default PrivateRoute;