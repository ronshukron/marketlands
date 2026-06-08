import { useEffect, useState } from 'react';
import { getPickupSpotsSync, subscribePickupSpots } from '../services/pickupSpotsService';

export default function usePickupSpots() {
  const [state, setState] = useState(() => getPickupSpotsSync());

  useEffect(() => subscribePickupSpots(setState), []);

  return state;
}
