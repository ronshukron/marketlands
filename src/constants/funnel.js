// Funnel steps tracked by services/funnelService.js and reported in
// admin/FunnelReport.js. firestore.rules (funnelEvents) lists the same names;
// change both together.

export const FUNNEL_STEPS = {
  weekly_basket: ['signup_opened', 'basket_edited', 'submitted', 'card_saved'],
  cart: ['cart_started', 'checkout_opened', 'payment_started', 'order_completed'],
  // Flyer / QR campaigns (/q/{code}): the scan, then each page a campaign
  // visitor opens (once per page per visit).
  campaign: ['scan', 'page_view'],
};

// Steps a visitor may skip on the way to the next one (a ready-made basket can
// be submitted unchanged). The report shows them as "of those" counts and does
// not assume a visitor who went further passed them.
export const OPTIONAL_FUNNEL_STEPS = ['basket_edited'];

export const FUNNEL_TITLES = {
  weekly_basket: 'הרשמה לסל שבועי',
  cart: 'עגלה רגילה',
  campaign: 'קמפיינים',
};

export const FUNNEL_STEP_LABELS = {
  signup_opened: 'פתחו את דף ההרשמה',
  basket_edited: 'שינו את הסל',
  submitted: 'המשיכו לשמירת כרטיס',
  card_saved: 'שמרו כרטיס (נרשמו)',
  cart_started: 'הוסיפו מוצר לעגלה',
  checkout_opened: 'הגיעו לקופה',
  payment_started: 'עברו לדף התשלום',
  order_completed: 'השלימו הזמנה',
  scan: 'סרקו',
  page_view: 'צפו בדף',
};

// Why a customer pauses or cancels the weekly basket (MySubscriptions). The
// functions side (utils/leaveFeedback.js) accepts the same values.
export const LEAVE_REASONS = [
  { value: 'price', label: 'מחיר' },
  { value: 'quantities', label: 'כמויות' },
  { value: 'quality', label: 'איכות' },
  { value: 'not_now', label: 'לא מתאים לי כרגע' },
  { value: 'other', label: 'אחר' },
];

export const LEAVE_REASON_LABELS = Object.fromEntries(LEAVE_REASONS.map(({ value, label }) => [value, label]));

export const MAX_LEAVE_NOTE_LENGTH = 300;
