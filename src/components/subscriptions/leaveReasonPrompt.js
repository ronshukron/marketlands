import { LEAVE_REASONS, MAX_LEAVE_NOTE_LENGTH } from '../../constants/funnel';

// The pause / cancel confirmation in MySubscriptions, with the optional
// "מה הסיבה?" question. The answer is sent with the action and shown in the
// admin funnel report. Answering is never required.

export const LEAVE_REASON_FIELD = 'leave-reason';
export const LEAVE_NOTE_ID = 'leave-reason-note';

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// Static markup (no customer text in it), so a plain string is safe here.
export const leaveReasonHtml = () => `
  <fieldset dir="rtl" style="text-align:right;border:0;margin:0;padding:0">
    <legend style="font-weight:700;margin-bottom:6px">מה הסיבה? (לא חובה)</legend>
    ${LEAVE_REASONS.map(({ value, label }) => `
      <label style="display:flex;align-items:center;gap:8px;margin:4px 0;cursor:pointer">
        <input type="radio" name="${LEAVE_REASON_FIELD}" value="${value}" />
        <span>${label}</span>
      </label>`).join('')}
    <label for="${LEAVE_NOTE_ID}" style="display:block;margin-top:8px;font-size:14px">רוצים לפרט?</label>
    <textarea id="${LEAVE_NOTE_ID}" maxlength="${MAX_LEAVE_NOTE_LENGTH}" rows="2"
      style="width:100%;margin-top:4px;border:1px solid #d1d5db;border-radius:8px;padding:6px 8px;font-size:14px"></textarea>
  </fieldset>`;

/**
 * The answer in the prompt: {} when nothing was chosen or written, otherwise
 * {reason, note}. A note without a chosen reason counts as "other".
 * @param {ParentNode|null} container the prompt's popup
 * @return {{reason?: string, note?: string}}
 */
export const readLeaveReason = (container) => {
  if (!container) return {};
  const checked = container.querySelector(`input[name="${LEAVE_REASON_FIELD}"]:checked`);
  const noteField = container.querySelector(`#${LEAVE_NOTE_ID}`);
  const reason = checked ? checked.value : '';
  const note = noteField ? String(noteField.value || '').trim().slice(0, MAX_LEAVE_NOTE_LENGTH) : '';
  if (!reason && !note) return {};
  return { reason: reason || 'other', note };
};

/**
 * Ask to confirm a pause or cancel, with the optional reason.
 * @param {Object} swal sweetalert2
 * @param {string} title
 * @param {string} [text] a fixed explanation shown above the question (our own wording only)
 * @return {Promise<Object|null>} null when the customer said no, else the answer
 */
export const confirmLeaving = async (swal, title, text = '') => {
  const note = text
    ? `<p dir="rtl" style="margin:0 0 10px;font-size:14px;color:#374151;text-align:right">${escapeHtml(text)}</p>`
    : '';
  const result = await swal.fire({
    title,
    icon: 'question',
    html: note + leaveReasonHtml(),
    showCancelButton: true,
    confirmButtonText: 'כן',
    cancelButtonText: 'לא',
    focusConfirm: false,
    preConfirm: () => readLeaveReason(typeof swal.getPopup === 'function' ? swal.getPopup() : null),
  });
  if (!result || !result.isConfirmed) return null;
  return result.value && typeof result.value === 'object' ? result.value : {};
};
