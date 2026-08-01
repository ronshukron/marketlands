export const DEFAULT_NEW_PRODUCT_DAYS = 14;

export const toProductDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === 'object' && Number.isFinite(value.seconds)) {
    return new Date(value.seconds * 1000);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const isNewProduct = (
  createdAt,
  now = new Date(),
  maxAgeDays = DEFAULT_NEW_PRODUCT_DAYS,
) => {
  const created = toProductDate(createdAt);
  const current = toProductDate(now);
  const days = Number(maxAgeDays);
  if (!created || !current || !Number.isFinite(days) || days <= 0) return false;

  const ageMs = current.getTime() - created.getTime();
  return ageMs >= 0 && ageMs < days * 24 * 60 * 60 * 1000;
};
