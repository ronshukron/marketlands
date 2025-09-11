import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const SaleModeContext = createContext();

export const useSaleMode = () => useContext(SaleModeContext);

const STORAGE_KEY = 'saleMode';
const DEFAULT_MODE = 'weekly'; // 'weekly' | 'independent'

export const SaleModeProvider = ({ children }) => {
  const [saleMode, setSaleModeState] = useState(DEFAULT_MODE);
  const [hasLoadedFromStorage, setHasLoadedFromStorage] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'weekly' || saved === 'independent') {
        setSaleModeState(saved);
      }
    } catch (err) {
      console.error('Error loading saleMode from localStorage:', err);
      localStorage.removeItem(STORAGE_KEY);
    }
    setHasLoadedFromStorage(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedFromStorage) return;
    try {
      localStorage.setItem(STORAGE_KEY, saleMode);
    } catch (err) {
      console.error('Error saving saleMode to localStorage:', err);
    }
  }, [saleMode, hasLoadedFromStorage]);

  const setSaleMode = (mode) => {
    if (mode !== 'weekly' && mode !== 'independent') return;
    setSaleModeState(mode);
  };

  const toggleSaleMode = () => {
    setSaleModeState((prev) => (prev === 'weekly' ? 'independent' : 'weekly'));
  };

  const value = useMemo(() => ({
    saleMode,
    setSaleMode,
    toggleSaleMode,
    isWeekly: saleMode === 'weekly',
    isIndependent: saleMode === 'independent'
  }), [saleMode]);

  return (
    <SaleModeContext.Provider value={value}>
      {children}
    </SaleModeContext.Provider>
  );
}; 