import { getPromotionDeadlineChip } from './marketplacePromotionDeadline';
import {
  combinePromotionClosingDateTime,
  getPromotionScheduleFormValues,
  validatePromotionClosingSchedule,
} from './marketplacePromotionSchedule';

test('combines and restores an exact local closing time', () => {
  const closing = combinePromotionClosingDateTime('2030-08-14', '19:45');
  expect(closing).not.toBeNull();
  expect(getPromotionScheduleFormValues(closing)).toEqual({
    endsAt: '2030-08-14',
    endsAtTime: '19:45',
  });
});

test('validates missing, past, and future closing schedules', () => {
  const now = new Date(2030, 7, 14, 12, 0);
  expect(validatePromotionClosingSchedule({ endsAt: '2030-08-14', endsAtTime: '', now }).valid)
    .toBe(false);
  expect(
    validatePromotionClosingSchedule({
      endsAt: '2030-08-14',
      endsAtTime: '11:59',
      startsAt: '2030-08-13',
      now,
    }).valid
  ).toBe(false);
  expect(
    validatePromotionClosingSchedule({
      endsAt: '2030-08-14',
      endsAtTime: '19:45',
      startsAt: '2030-08-13',
      now,
    }).valid
  ).toBe(true);
});

test('deadline chip respects the exact closing time', () => {
  const closing = new Date(2030, 7, 14, 19, 45);
  expect(getPromotionDeadlineChip(closing, new Date(2030, 7, 14, 18, 0))).toMatchObject({
    soon: true,
    past: false,
  });
  expect(getPromotionDeadlineChip(closing, new Date(2030, 7, 14, 20, 0))).toEqual({
    text: 'הסתיים',
    soon: false,
    past: true,
  });
});
