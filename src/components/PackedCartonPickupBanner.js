import React from 'react';
import { packedCartonCustomerTitle, normalizePackedCartonCount } from '../utils/crateLabelCounter';

export default function PackedCartonPickupBanner({ count, pickupSpot, className = '' }) {
  const cartonCount = normalizePackedCartonCount(count);
  const title = packedCartonCustomerTitle(cartonCount);
  if (!title) return null;

  return (
    <div
      className={`rounded-xl border-2 border-emerald-400 bg-emerald-50 px-4 py-3 text-emerald-950 ${className}`}
      role="status"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-xl font-black text-white shadow">
          {cartonCount}
        </div>
        <div className="min-w-0">
          <div className="text-lg font-black leading-tight">{title}</div>
          {pickupSpot ? (
            <div className="mt-0.5 text-sm font-bold text-emerald-800">
              בנקודת האיסוף: {pickupSpot}
            </div>
          ) : (
            <div className="mt-0.5 text-sm font-bold text-emerald-800">
              אספו את הקרטונים בנקודת האיסוף
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
