import React, { createContext, useState, useContext, useEffect } from 'react';

const PickupSpotContext = createContext();

export const usePickupSpot = () => useContext(PickupSpotContext);

export const PickupSpotProvider = ({ children }) => {
  const [selectedPickupSpot, setSelectedPickupSpot] = useState('');
  const [hasLoadedFromStorage, setHasLoadedFromStorage] = useState(false);

  // Load pickup spot from localStorage on component mount
  useEffect(() => {
    try {
      const savedPickupSpot = localStorage.getItem('selectedPickupSpot');
      
      if (savedPickupSpot) {
        setSelectedPickupSpot(savedPickupSpot);
      }
    } catch (error) {
      console.error('Error loading pickup spot from localStorage:', error);
      localStorage.removeItem('selectedPickupSpot');
    }
    
    setHasLoadedFromStorage(true);
  }, []);

  // Save pickup spot to localStorage whenever it changes (but only after initial load)
  useEffect(() => {
    if (!hasLoadedFromStorage) return;
    
    try {
      if (selectedPickupSpot) {
        localStorage.setItem('selectedPickupSpot', selectedPickupSpot);
      } else {
        localStorage.removeItem('selectedPickupSpot');
      }
    } catch (error) {
      console.error('Error saving pickup spot to localStorage:', error);
    }
  }, [selectedPickupSpot, hasLoadedFromStorage]);

  const updatePickupSpot = (pickupSpot) => {
    setSelectedPickupSpot(pickupSpot);
  };

  const clearPickupSpot = () => {
    setSelectedPickupSpot('');
    localStorage.removeItem('selectedPickupSpot');
  };

  const value = {
    selectedPickupSpot,
    updatePickupSpot,
    clearPickupSpot,
    hasLoadedFromStorage
  };

  return (
    <PickupSpotContext.Provider value={value}>
      {children}
    </PickupSpotContext.Provider>
  );
}; 