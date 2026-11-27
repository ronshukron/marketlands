import { confirmLeaving, leaveReasonHtml, readLeaveReason } from './leaveReasonPrompt';

const buildPrompt = () => {
  const popup = document.createElement('div');
  popup.innerHTML = leaveReasonHtml();
  return popup;
};

test('the prompt offers the five reasons and a note', () => {
  const popup = buildPrompt();
  const labels = [...popup.querySelectorAll('label span')].map((node) => node.textContent);
  expect(labels).toEqual(['מחיר', 'כמויות', 'איכות', 'לא מתאים לי כרגע', 'אחר']);
  expect(popup.querySelector('textarea').getAttribute('maxlength')).toBe('300');
});

test('reads nothing, a reason, or a note alone (as "other")', () => {
  const popup = buildPrompt();
  expect(readLeaveReason(popup)).toEqual({});
  popup.querySelector('input[value="quantities"]').checked = true;
  expect(readLeaveReason(popup)).toEqual({ reason: 'quantities', note: '' });
  popup.querySelector('textarea').value = '  יותר מדי עלים  ';
  expect(readLeaveReason(popup)).toEqual({ reason: 'quantities', note: 'יותר מדי עלים' });
  popup.querySelector('input[value="quantities"]').checked = false;
  expect(readLeaveReason(popup)).toEqual({ reason: 'other', note: 'יותר מדי עלים' });
  expect(readLeaveReason(null)).toEqual({});
});

test('confirmLeaving: no means null, yes returns the answer (or {} with no answer)', async () => {
  const swal = (result) => ({ fire: () => Promise.resolve(result), getPopup: () => null });
  await expect(confirmLeaving(swal({ isConfirmed: false }), 'x')).resolves.toBeNull();
  await expect(confirmLeaving(swal({ isConfirmed: true, value: { reason: 'price', note: '' } }), 'x'))
    .resolves.toEqual({ reason: 'price', note: '' });
  await expect(confirmLeaving(swal({ isConfirmed: true, value: true }), 'x')).resolves.toEqual({});
});
