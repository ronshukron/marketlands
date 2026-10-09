import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { usePickupSpot } from './PickupSpotContext';
import { getWeightBufferForSpot } from '../services/paymentConfigService';

const INITIAL_STATE = { bufferPercent: 0, configuredPercent: 0, loaded: false };

const WeightBufferContext = createContext(INITIAL_STATE);

export const useWeightBuffer = () => useContext(WeightBufferContext);

/**
 * Exposes the kg weight buffer for the selected pickup spot. Only delayed
 * (card-hold) spots get a buffer (`bufferPercent`); pay-upfront spots are
 * charged the shown estimate, so they must not be inflated.
 * `configuredPercent` is the admin setting regardless of spot.
 */
export const WeightBufferProvider = ({ children }) => {
  const { selectedPickupSpot, hasLoadedFromStorage } = usePickupSpot();
  const [state, setState] = useState(INITIAL_STATE);

  useEffect(() => {
    if (!hasLoadedFromStorage) return undefined;
    let cancelled = false;
    getWeightBufferForSpot(selectedPickupSpot).then(({ percent, isDelayedSpot }) => {
      if (cancelled) return;
      setState({
        bufferPercent: isDelayedSpot ? percent : 0,
        configuredPercent: percent,
        loaded: true,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [hasLoadedFromStorage, selectedPickupSpot]);

  const value = useMemo(() => state, [state]);

  return (
    <WeightBufferContext.Provider value={value}>
      {children}
    </WeightBufferContext.Provider>
  );
};

export default WeightBufferContext;
