/**
 * Deadline label for weekly promotion cards (שוק הבסטות).
 */
export const getPromotionDeadlineChip = (endsAt) => {
  if (!endsAt) return null;

  const date =
    typeof endsAt.toDate === 'function' ? endsAt.toDate() : new Date(endsAt);
  if (Number.isNaN(date.getTime())) return null;

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  const daysLeft = Math.ceil((end - now) / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) return { text: 'הסתיים', soon: false, past: true };
  if (daysLeft === 0) return { text: 'נגמר היום', soon: true, past: false };
  if (daysLeft === 1) return { text: 'נשאר יום', soon: true, past: false };
  if (daysLeft <= 3) return { text: `נשארו ${daysLeft} ימים`, soon: true, past: false };
  return { text: `עד ${date.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })}`, soon: false, past: false };
};
