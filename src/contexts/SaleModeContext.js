import React, { createContext, useContext, useEffect, useState } from 'react';

const SaleModeContext = createContext();

export const useSaleMode = () => {
  const context = useContext(SaleModeContext);
  if (!context) {
    throw new Error('useSaleMode must be used within a SaleModeProvider');
  }
  return context;
};

export const SaleModeProvider = ({ children }) => {
  const [saleMode, setSaleMode] = useState(() => {
    // Initialize from localStorage or default to 'weekly'
    try {
      const saved = localStorage.getItem('saleMode');
      return saved === 'independent' ? 'independent' : 'weekly';
    } catch {
      return 'weekly';
    }
  });

  useEffect(() => {
    // Persist to localStorage whenever saleMode changes
    try {
      localStorage.setItem('saleMode', saleMode);
    } catch (error) {
      console.warn('Failed to save saleMode to localStorage:', error);
    }
  }, [saleMode]);

  const value = {
    saleMode,
    setSaleMode
  };

  return (
    <SaleModeContext.Provider value={value}>
      {children}
    </SaleModeContext.Provider>
  );
};

export default SaleModeContext; 