const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const toDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return new Date(value);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const combinePromotionClosingDateTime = (dateValue, timeValue) => {
  if (!DATE_PATTERN.test(String(dateValue || '')) || !TIME_PATTERN.test(String(timeValue || ''))) {
    return null;
  }

  const [year, month, day] = dateValue.split('-').map(Number);
  const [hours, minutes] = timeValue.split(':').map(Number);
  const combined = new Date(year, month - 1, day, hours, minutes, 0, 0);

  if (
    combined.getFullYear() !== year ||
    combined.getMonth() !== month - 1 ||
    combined.getDate() !== day ||
    combined.getHours() !== hours ||
    combined.getMinutes() !== minutes
  ) {
    return null;
  }
  return combined;
};

export const getPromotionScheduleFormValues = (value, fallbackTime = '20:00') => {
  const date = toDate(value);
  if (!date) return { endsAt: '', endsAtTime: fallbackTime };
  const pad = (part) => String(part).padStart(2, '0');
  return {
    endsAt: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    endsAtTime: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
};

export const validatePromotionClosingSchedule = ({
  endsAt,
  endsAtTime,
  startsAt,
  now = new Date(),
  requireFuture = true,
} = {}) => {
  const closing = combinePromotionClosingDateTime(endsAt, endsAtTime);
  if (!closing) return { valid: false, message: 'בחרו תאריך ושעת סגירה מדויקים' };

  if (startsAt && DATE_PATTERN.test(startsAt)) {
    const opening = combinePromotionClosingDateTime(startsAt, '00:00');
    if (opening && closing <= opening) {
      return { valid: false, message: 'מועד הסגירה חייב להיות אחרי מועד הפתיחה' };
    }
  }

  if (requireFuture && closing <= now) {
    return { valid: false, message: 'מועד הסגירה חייב להיות בעתיד' };
  }

  return { valid: true, message: '', closing };
};

export const formatPromotionClosingDateTime = (value) => {
  const date = toDate(value);
  if (!date) return '';
  return date.toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};
