import React, { useMemo } from 'react';

export default function ThresholdProgressBar({ minCommunityTotal, currentTotal, thresholdDeadline }) {
  const percentage = useMemo(() => {
    const min = Number(minCommunityTotal || 0);
    const current = Number(currentTotal || 0);
    if (!min) return 0;
    return Math.min(100, Math.round((current / min) * 100));
  }, [minCommunityTotal, currentTotal]);

  const remainingAmount = useMemo(() => {
    const min = Number(minCommunityTotal || 0);
    const current = Number(currentTotal || 0);
    return Math.max(0, min - current);
  }, [minCommunityTotal, currentTotal]);

  const timeRemaining = useMemo(() => {
    if (!thresholdDeadline) return null;
    const end = typeof thresholdDeadline === 'number' ? thresholdDeadline : new Date(thresholdDeadline).getTime();
    const ms = end - Date.now();
    if (ms <= 0) return { expired: true, days: 0, hours: 0, minutes: 0 };
    const days = Math.floor(ms / (24 * 60 * 60 * 1000));
    const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
    return { expired: false, days, hours, minutes };
  }, [thresholdDeadline]);

  return (
    <div style={{ width: '100%', margin: '12px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <strong>Progress</strong>
        <span>{percentage}%</span>
      </div>
      <div style={{ height: 10, background: '#eee', borderRadius: 6, overflow: 'hidden' }}>
        <div
          style={{
            width: `${percentage}%`,
            height: '100%',
            background: '#16a34a'
          }}
        />
      </div>
      <div style={{ marginTop: 8, fontSize: 14 }}>
        <div>Remaining to reach minimum: ₪{remainingAmount}</div>
        {timeRemaining && (
          <div>
            {timeRemaining.expired
              ? 'Deadline passed'
              : `Time left: ${timeRemaining.days}d ${timeRemaining.hours}h ${timeRemaining.minutes}m`}
          </div>
        )}
      </div>
    </div>
  );
} 