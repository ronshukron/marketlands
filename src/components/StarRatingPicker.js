import React, { useState } from 'react';

const RATING_LABELS = {
  1: 'גרוע',
  2: 'לא טוב',
  3: 'בסדר',
  4: 'טוב',
  5: 'מצוין',
};

const StarRatingPicker = ({ value = 0, onChange }) => {
  const [hoverValue, setHoverValue] = useState(0);
  const shown = hoverValue || Number(value) || 0;

  return (
    <fieldset
      className="mt-4"
      onMouseLeave={() => setHoverValue(0)}
    >
      <legend className="text-sm font-medium text-gray-700">דירוג</legend>
      <div className="mt-2 flex gap-2" dir="ltr" role="radiogroup" aria-label="דירוג מ־1 גרוע עד 5 מצוין">
        {[1, 2, 3, 4, 5].map((rating) => {
          const filled = shown >= rating;
          return (
            <button
              key={rating}
              type="button"
              role="radio"
              aria-checked={Number(value) === rating}
              aria-label={`${rating} מתוך 5, ${RATING_LABELS[rating]}`}
              onMouseEnter={() => setHoverValue(rating)}
              onFocus={() => setHoverValue(rating)}
              onBlur={() => setHoverValue(0)}
              onClick={() => onChange(rating)}
              className={`flex h-14 min-w-11 flex-1 flex-col items-center justify-center rounded-lg border text-xl leading-none ${
                filled
                  ? 'border-amber-500 bg-amber-100'
                  : 'border-gray-300 bg-white'
              }`}
            >
              <span className={filled ? 'text-amber-500' : 'text-gray-300'} aria-hidden="true">★</span>
              <span className={`mt-0.5 text-xs font-bold ${filled ? 'text-amber-950' : 'text-gray-500'}`}>{rating}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-xs font-medium text-gray-600" dir="ltr">
        <span>1 · גרוע</span>
        <span>5 · מצוין</span>
      </div>
      <p className="mt-1 min-h-5 text-sm font-semibold text-amber-950" role="status">
        {shown ? `${shown} מתוך 5 — ${RATING_LABELS[shown]}` : '1 זה גרוע, 5 זה מצוין'}
      </p>
    </fieldset>
  );
};

export default StarRatingPicker;
