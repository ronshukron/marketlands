/**
 * Deadline label for weekly promotion cards (שוק הבסטות).
 */
export const getPromotionDeadlineChip = (endsAt, nowValue = new Date()) => {
  if (!endsAt) return null;

  const date =
    typeof endsAt.toDate === 'function' ? endsAt.toDate() : new Date(endsAt);
  if (Number.isNaN(date.getTime())) return null;

  const now = new Date(nowValue);
  const millisecondsLeft = date.getTime() - now.getTime();
  const daysLeft = Math.ceil(millisecondsLeft / (1000 * 60 * 60 * 24));
  const time = date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

  if (millisecondsLeft <= 0) return { text: 'הסתיים', soon: false, past: true };
  if (date.toDateString() === now.toDateString()) {
    return { text: `נסגר היום ב־${time}`, soon: true, past: false };
  }
  if (daysLeft === 1) return { text: `נסגר מחר ב־${time}`, soon: true, past: false };
  if (daysLeft <= 3) return { text: `נשארו ${daysLeft} ימים`, soon: true, past: false };
  return {
    text: `עד ${date.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })}, ${time}`,
    soon: false,
    past: false,
  };
};
