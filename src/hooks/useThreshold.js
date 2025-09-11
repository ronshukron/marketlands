import { useMemo } from 'react';

export function useThreshold({ min = 0, current = 0, deadline }) {
  const percentage = useMemo(() => {
    if (!min) return 0;
    return Math.min(100, Math.round((current / min) * 100));
  }, [min, current]);

  const remainingAmount = useMemo(() => Math.max(0, min - current), [min, current]);

  const timeRemaining = useMemo(() => {
    if (!deadline) return null;
    const end = typeof deadline === 'number' ? deadline : new Date(deadline).getTime();
    const ms = end - Date.now();
    if (ms <= 0) return { expired: true, days: 0, hours: 0, minutes: 0 };
    const days = Math.floor(ms / (24 * 60 * 60 * 1000));
    const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
    return { expired: false, days, hours, minutes };
  }, [deadline]);

  return { percentage, remainingAmount, timeRemaining };
} 