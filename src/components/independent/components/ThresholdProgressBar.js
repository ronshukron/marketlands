import React from 'react';
import { useThreshold } from '../../../hooks/useThreshold';

export default function ThresholdProgressBar({ minCommunityTotal, currentTotal, thresholdDeadline }) {
  const { percentage, remainingAmount, timeRemaining } = useThreshold({
    min: Number(minCommunityTotal || 0),
    current: Number(currentTotal || 0),
    deadline: thresholdDeadline
  });

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