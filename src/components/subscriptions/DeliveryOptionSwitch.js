import React, { useState } from 'react';
import usePickupSpots from '../../hooks/usePickupSpots';
import {
  DELIVERY_OPTION_LABELS,
  deliveryOptionsForSpot,
  preferredDeliveryOption,
} from '../../utils/subscriptionDelivery';

// "קבלה" on a weekly basket (customer page and admin): pickup or home
// delivery, among what the community offers. Saving calls the parent's onSave
// with {deliveryOption, address, directions} (the delivery_option action);
// the open delivery changes too while still before its cutoff.

const feeText = (spot, option) => {
  if (option !== 'homeDelivery') return 'חינם';
  const fee = Number(spot?.deliveryFee) || 0;
  return fee > 0 ? `₪${fee.toFixed(2)}` : 'חינם';
};

export default function DeliveryOptionSwitch({ subscription, busy = false, onSave, compact = false }) {
  const { pickupSpotsData = {} } = usePickupSpots();
  const spot = pickupSpotsData[subscription.community] || null;
  const options = deliveryOptionsForSpot(spot);
  const current = subscription.deliveryOption || 'pickup';
  const details = subscription.customerDetails || {};
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState(current);
  const [address, setAddress] = useState(details.address || '');
  const [directions, setDirections] = useState(details.directions || '');
  const canChange = options.length > 1 || !options.includes(current);
  const addressMissing = choice === 'homeDelivery' && !address.trim();

  const start = () => {
    setChoice(options.includes(current) ? current : preferredDeliveryOption(options));
    setAddress(details.address || '');
    setDirections(details.directions || '');
    setOpen(true);
  };
  const save = async () => {
    if (addressMissing) return;
    const saved = await onSave({ deliveryOption: choice, address: address.trim(), directions: directions.trim() });
    if (saved !== false) setOpen(false);
  };

  return (
    <div className={compact ? 'text-sm' : 'text-sm text-gray-700'} data-testid="delivery-option-switch">
      <span>{DELIVERY_OPTION_LABELS[current] || current}</span>
      {current === 'homeDelivery' && details.address && <span className="text-gray-500"> · {details.address}</span>}
      {canChange && !open && (
        <button type="button" onClick={start} disabled={busy}
          className="mr-2 text-xs font-semibold text-emerald-700 underline disabled:opacity-50">
          שינוי
        </button>
      )}
      {open && (
        <div className="mt-2 space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-right [&_p]:mb-0">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="דרך הקבלה">
            {options.map((option) => (
              <button key={option} type="button" role="radio" aria-checked={choice === option}
                onClick={() => setChoice(option)}
                className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                  choice === option ? 'border-emerald-700 bg-emerald-600 text-white' : 'border-gray-300 bg-white text-gray-700'
                }`}>
                {DELIVERY_OPTION_LABELS[option]} <span className="font-normal">({feeText(spot, option)})</span>
              </button>
            ))}
          </div>
          {choice === 'homeDelivery' && (
            <>
              <label className="block text-xs font-medium text-gray-700">
                כתובת למשלוח
                <input value={address} onChange={(event) => setAddress(event.target.value)} maxLength={200}
                  className={`mt-1 w-full rounded-lg border px-3 py-2 text-base sm:text-sm ${addressMissing ? 'border-red-400' : 'border-gray-300'}`} />
              </label>
              <label className="block text-xs font-medium text-gray-700">
                הערות לשליח (לא חובה)
                <input value={directions} onChange={(event) => setDirections(event.target.value)} maxLength={300}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base sm:text-sm" />
              </label>
            </>
          )}
          <p className="text-xs text-gray-500">השינוי חל על המשלוחים הבאים, וגם על המשלוח הפתוח אם עוד לא נסגר להזמנות.</p>
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={busy || addressMissing}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">
              שמירה
            </button>
            <button type="button" onClick={() => setOpen(false)} disabled={busy}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700">
              ביטול
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
