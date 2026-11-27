// Messages for every result code the QL-800 service can return
// (electron/services/printerService.js and ql800Raster.js), in Hebrew and Thai.
// V7 and V8 both use this table, so a new code is added once.

export const PRINTER_MESSAGES = {
  he: {
    no_printer: 'המדפסת לא נמצאה. בדקו USB ו-Editor Lite.',
    busy: 'המדפסת תפוסה. Windows כנראה תפס את ה-USB — השתמשו ב-Zadig (WinUSB).',
    need_winusb: 'Windows חוסם גישת USB. התקינו WinUSB עם Zadig (בלי דרייבר Brother).',
    no_usb_module: 'מודול USB לא נטען. הריצו npx electron-builder install-app-deps',
    no_media: 'אין גליל במדפסת',
    media_end: 'הגליל נגמר. החליפו גליל ונסו שוב.',
    cover_open: 'המכסה פתוח',
    editor_lite: 'כבו את Editor Lite (הנורית הירוקה)',
    wrong_media: 'הגליל במדפסת לא תואם',
    cutter_jam: 'הסכין של המדפסת תקועה. פתחו את המכסה ושחררו את המדבקה.',
    buffer_full: 'זיכרון המדפסת מלא. חכו רגע ונסו שוב.',
    system_error: 'שגיאת מערכת במדפסת. כבו והדליקו את המדפסת.',
    turned_off: 'המדפסת כבויה או התנתקה.',
    timeout: 'המדפסת לא ענתה בזמן',
    communication_error: 'שגיאת תקשורת עם המדפסת. נסו שוב, ואם זה חוזר כבו והדליקו את המדפסת.',
    print_failed: 'ההדפסה נכשלה',
    already_printing: 'הדפסה קודמת עוד לא הסתיימה',
    no_electron: 'הדפסה זמינה רק באפליקציית שולחן העבודה',
  },
  th: {
    no_printer: 'ไม่พบเครื่องพิมพ์ ตรวจ USB และ Editor Lite',
    busy: 'เครื่องพิมพ์ไม่ว่าง Windows จับ USB ไว้ — ใช้ Zadig (WinUSB)',
    need_winusb: 'Windows บล็อก USB ติดตั้ง WinUSB ด้วย Zadig (ไม่ติดตั้งไดรเวอร์ Brother)',
    no_usb_module: 'โหลดโมดูล USB ไม่ได้ รัน npx electron-builder install-app-deps',
    no_media: 'ไม่มีม้วนในเครื่องพิมพ์',
    media_end: 'ม้วนฉลากหมด เปลี่ยนม้วนแล้วลองใหม่',
    cover_open: 'ฝาเปิดอยู่',
    editor_lite: 'ปิด Editor Lite (ไฟเขียว)',
    wrong_media: 'ม้วนไม่ตรงกับงานพิมพ์',
    cutter_jam: 'ใบมีดเครื่องพิมพ์ติด เปิดฝาแล้วเอาฉลากที่ติดออก',
    buffer_full: 'หน่วยความจำเครื่องพิมพ์เต็ม รอสักครู่แล้วลองใหม่',
    system_error: 'เครื่องพิมพ์ผิดพลาด ปิดแล้วเปิดเครื่องพิมพ์ใหม่',
    turned_off: 'เครื่องพิมพ์ปิดอยู่หรือหลุดการเชื่อมต่อ',
    timeout: 'เครื่องพิมพ์ไม่ตอบ',
    communication_error: 'การสื่อสารกับเครื่องพิมพ์ผิดพลาด ลองอีกครั้ง ถ้ายังไม่พิมพ์ ให้ปิดแล้วเปิดเครื่องพิมพ์',
    print_failed: 'พิมพ์ไม่สำเร็จ',
    already_printing: 'งานพิมพ์ก่อนหน้ายังไม่เสร็จ',
    no_electron: 'พิมพ์ได้เฉพาะแอปเดสก์ท็อป',
  },
};

/**
 * @param {'he'|'th'} lang
 * @param {string} code
 * @param {string} [detail] the service's technical message, shown after the text
 * @return {string}
 */
export function printerErrorText(lang, code, detail) {
  const table = PRINTER_MESSAGES[lang] || PRINTER_MESSAGES.he;
  const base = table[code] || table.print_failed;
  const extra = detail && detail !== code ? ` — ${detail}` : '';
  return `${base}${extra}`;
}

// Station strings for the shared print flow (carton counter, confirm, log).
export const CARTON_PRINT_TEXT = {
  he: {
    printSaving: 'שומר…',
    labelOutTitle: 'המדבקה יצאה?',
    labelOutQuestion: (n) => `המדפסת לא אישרה שההדפסה הסתיימה. האם המדבקה של קרטון ${n}# יצאה מהמדפסת?`,
    printLogTitle: 'יומן הדפסות בתחנה (50 אחרונות)',
    printLogEmpty: 'אין הדפסות עדיין בתחנה הזו',
    printLogTime: 'שעה',
    printLogOrder: 'הזמנה',
    printLogCarton: 'קרטון',
    printLogResult: 'תוצאה',
    printLogDuration: 'משך',
    printLogSync: 'ספירה ללקוח',
    printLogOk: 'הודפס',
    printLogConfirmed: 'הודפס (אושר ידנית)',
    printLogSaved: 'נשמר',
    printLogPending: 'ממתין לאינטרנט',
    packedCartonSyncRetried: (n) => `מספר הקרטונים (${n}) נשמר ללקוח`,
  },
  th: {
    printSaving: 'กำลังบันทึก…',
    labelOutTitle: 'ฉลากออกมาแล้วหรือไม่?',
    labelOutQuestion: (n) => `เครื่องพิมพ์ไม่ยืนยันว่าพิมพ์เสร็จ ฉลากกล่อง ${n}# ออกมาจากเครื่องพิมพ์แล้วหรือไม่?`,
    printLogTitle: 'บันทึกการพิมพ์ของสถานีนี้ (50 ครั้งล่าสุด)',
    printLogEmpty: 'สถานีนี้ยังไม่มีการพิมพ์',
    printLogTime: 'เวลา',
    printLogOrder: 'ออเดอร์',
    printLogCarton: 'กล่อง',
    printLogResult: 'ผล',
    printLogDuration: 'ใช้เวลา',
    printLogSync: 'จำนวนกล่องของลูกค้า',
    printLogOk: 'พิมพ์แล้ว',
    printLogConfirmed: 'พิมพ์แล้ว (ยืนยันเอง)',
    printLogSaved: 'บันทึกแล้ว',
    printLogPending: 'รออินเทอร์เน็ต',
    packedCartonSyncRetried: (n) => `บันทึกจำนวนกล่อง (${n}) ให้ลูกค้าแล้ว`,
  },
};
