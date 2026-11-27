// Station strings for the charge limit (item E), Hebrew and Thai.
// Spread into TR.he / TR.th of DeliveryManagementV7 and DeliveryManagementV8.

const ils = (value) => `₪${(Number(value) || 0).toFixed(2)}`;

export const CHARGE_LIMIT_TEXT = {
  he: {
    maxChargeTile: 'מקסימום לסליקה',
    ceilingTile: 'תקרה ללא אישור (סל שבועי)',
    chargeRemaining: (value) => `נותר ${ils(value)}`,
    chargeOverBy: (value) => `חריגה ${ils(value)}`,
    lineMaxQty: (quantity, unit) => `מקסימום לשקילה במוצר זה: ${quantity} ${unit}`,
    lineMaxNone: 'אין מקום למוצר זה בתוך המקסימום לסליקה',
    overLimitBadge: 'חריגה',
    capChargeQuestion: (total, max, waived) => `הסכום שנשקל ${ils(total)} גבוה מהמקסימום לסליקה ${ils(max)}.\n`
      + `לחייב את המקסימום, ${ils(max)}? הלקוח לא יחויב על ${ils(waived)}.`,
    aboveHoldError: (total, max) => `הסכום ${ils(total)} גבוה מהמקסימום לסליקה ${ils(max)}`,
    batchHoldCapSummary: (count, waived) => `${count} הזמנות שנבחרו חורגות מהמקסימום לסליקה. הלקוחות לא יחויבו על ${ils(waived)}.`,
    batchCapOverHoldLabel: 'לחייב את המקסימום בהזמנות שחורגות',
    batchCapOverHoldOff: 'הזמנות שחורגות לא ייכללו בחיוב הזה',
    batchOverHoldBadge: (total, max) => `חריגה: ${ils(total)} · יחויב ${ils(max)}`,
    batchSkipOverHold: 'חורגת מהמקסימום לסליקה',
  },
  th: {
    maxChargeTile: 'ยอดเรียกเก็บสูงสุด',
    ceilingTile: 'เพดานโดยไม่ต้องยืนยัน (ตะกร้ารายสัปดาห์)',
    chargeRemaining: (value) => `เหลือ ${ils(value)}`,
    chargeOverBy: (value) => `เกิน ${ils(value)}`,
    lineMaxQty: (quantity, unit) => `ชั่งได้สูงสุดสำหรับสินค้านี้: ${quantity} ${unit}`,
    lineMaxNone: 'ไม่เหลือยอดสำหรับสินค้านี้ภายในยอดเรียกเก็บสูงสุด',
    overLimitBadge: 'เกิน',
    capChargeQuestion: (total, max, waived) => `ยอดที่ชั่งได้ ${ils(total)} สูงกว่ายอดเรียกเก็บสูงสุด ${ils(max)}\n`
      + `เรียกเก็บยอดสูงสุด ${ils(max)} หรือไม่? ลูกค้าจะไม่ถูกเรียกเก็บ ${ils(waived)}`,
    aboveHoldError: (total, max) => `ยอด ${ils(total)} สูงกว่ายอดเรียกเก็บสูงสุด ${ils(max)}`,
    batchHoldCapSummary: (count, waived) => `${count} ออเดอร์ที่เลือกเกินยอดเรียกเก็บสูงสุด ลูกค้าจะไม่ถูกเรียกเก็บ ${ils(waived)}`,
    batchCapOverHoldLabel: 'เรียกเก็บยอดสูงสุดสำหรับออเดอร์ที่เกิน',
    batchCapOverHoldOff: 'ออเดอร์ที่เกินจะไม่ถูกเรียกเก็บในรอบนี้',
    batchOverHoldBadge: (total, max) => `เกิน: ${ils(total)} · เรียกเก็บ ${ils(max)}`,
    batchSkipOverHold: 'เกินยอดเรียกเก็บสูงสุด',
  },
};

/** Button labels of the cap dialog, both languages on one button like the other dialogs. */
export const capChargeButtonLabel = (max) => `לחייב ${ils(max)} / เรียกเก็บ ${ils(max)}`;
export const BACK_TO_WEIGHING_LABEL = 'חזרה לשקילה / กลับไปชั่ง';
