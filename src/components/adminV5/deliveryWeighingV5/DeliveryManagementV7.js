import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc, runTransaction } from 'firebase/firestore';
import { db } from '../../../firebase/firebase';
import { useAuth } from '../../../contexts/authContext';
import LoadingSpinner from '../../LoadingSpinner';
import { getCommunityColor, getPickupSpotsSync, subscribePickupSpots } from '../../../services/pickupSpotsService';
import {
  addItemToDelayedOrderV7,
  fetchAvailableDeliveryWeeksV7,
  fetchProductDetailsV7,
  handleSuspendedPaymentV7,
  removeDelayedOrderLineV7,
  searchProductsV7,
  subscribeDelayedOrdersForWeekV7,
  updateDelayedOrderLineV7,
} from './apiV7';
import {
  buildSessionIdV7,
  bulkSetDraftWeightsV7,
  claimOrderV7,
  clearDraftLineWeightV7,
  clearOrderDraftV7,
  clearPresenceV7,
  getOrCreateStationIdV7,
  isClaimStaleV7,
  releaseOrderClaimV7,
  saveOrderDraftV7,
  setDraftLineRemovedV7,
  setDraftLineWeightV7,
  subscribeClaimsV7,
  subscribeDraftsV7,
  subscribePresenceV7,
  upsertPresenceV7,
} from './realtimeStateV7';
import { useWeightScale } from '../../../hooks/useWeightScale';
import ScaleConnectionPanel from '../../scale/ScaleConnectionPanel';
import { getEstimatedChargeableQuantity, getEstimatedLineTotal } from '../../../utils/pricing';
import {
  BUFFER_LINE_CATALOG_NUMBER,
  buildSettlementPayload,
  getNextUnweighedIndex,
  mergeProductDetailsIntoItems,
  isCanonicalLineIdV7,
  sanitizeDraftForItems,
  weekKeyToRangeLabel,
} from './v7/orderDraftUtils';
import {
  applyOpToDraft,
  applyOpsToDrafts,
  buildBaseSnapshotForOp,
  buildOfflineScopeKey,
  getCurrentFieldValueForOp,
  getDesiredFieldValueForOp,
  getOfflineScope,
  mergePendingOps,
  readDraftStore,
  readOfflineStore,
  writeDraftScopeData,
  writeDraftStore,
  writeStaticScopeData,
} from './v7/offlineSyncV7';
import { readCommunityOrder, readCommunityColorOverrides, saveCommunityColorOverride, saveCommunityOrder } from './v7/localStorageSafeV7';
import {
  computeCommunityOrderNumbers,
  readShowCommunityNumbering,
  saveShowCommunityNumbering,
} from './v7/communityOrderNumbering';
import {
  getOrderDeliveryDate,
  getWeekKey,
  normalizeDateRange,
  parseDateSafe,
  toLocalDateKey,
} from '../../../utils/deliveryScheduleUtils';
import CustomerOrderDeliveryTransferControl from '../../admin/CustomerOrderDeliveryTransferControl';

const ADMIN_UIDS = ['rfHOLhNoJOW8ByNypCtm3hlSNKs2'];
const WEIGHT_ON_THRESHOLD = 0.020;
const WEIGHT_OFF_THRESHOLD = 0.010;
const LANG_STORAGE_KEY = 'deliveryV7::lang';
const COMMUNITY_ORDER_KEY = 'deliveryV7::communityOrder';
const LAST_SETUP_KEY = 'deliveryV7::lastSetup';

function isLikelyNetworkErrorV7(error) {
  const message = String(error?.message || '');
  return (
    (typeof navigator !== 'undefined' && !navigator.onLine)
    || error?.code === 'unavailable'
    || error?.code === 'deadline-exceeded'
    || message.includes('client is offline')
    || message.includes('Failed to fetch')
    // Firestore 10.11.1 can throw this internal assertion while a transaction is interrupted offline.
    || message.includes('INTERNAL ASSERTION FAILED: Unexpected state')
  );
}

function isBrowserOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function readLastSetupV7() {
  if (typeof localStorage === 'undefined') return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(LAST_SETUP_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeLastSetupV7(setup) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LAST_SETUP_KEY, JSON.stringify(setup || {}));
  } catch {
    // Non-critical: offline cache still keeps the loaded orders.
  }
}

const TR = {
  he: {
    title: 'ניהול משלוחים V7',
    subtitle: 'שקילת פריטים בזמן אמת בין תחנות עבודה',
    switchLang: 'TH ไทย',
    showScale: 'הצג משקל',
    hideScale: 'הסתר משקל',
    week: 'שבוע:',
    communities: 'קהילות:',
    allCommunities: 'כל הקהילות',
    nSelected: (n) => `נבחרו ${n}`,
    selectAll: 'הכל',
    clearSel: 'נקה',
    load: 'טען הזמנות',
    deliveryDay: 'יום משלוח:',
    allDeliveryDays: 'כל ימי המשלוח',
    fromDate: 'מתאריך:',
    toDate: 'עד תאריך:',
    clearDates: 'נקה תאריכים',
    weekLabel: 'שבוע נבחר:',
    commLabel: 'קהילות:',
    orders: 'הזמנות',
    total: 'סה"כ',
    noOrders: 'אין הזמנות להצגה.',
    customer: 'לקוח',
    items: 'פריטים',
    pickOrder: 'בחר הזמנה כדי להתחיל.',
    community: 'קהילה',
    phone: 'טלפון',
    useOrderedQty: 'כמות הזמנה לכל הפריטים',
    completeBtn: 'השלם + חיוב',
    orderedKg: 'הוזמן (ק"ג)',
    weighedKg: 'נשקל (ק"ג)',
    orderedPrice: 'מחיר הזמנה (₪)',
    weighedPrice: 'מחיר שקילה (₪)',
    itemsLabel: (a, t2) => `פריטים (${a}/${t2})`,
    ordered: 'הוזמן',
    weighed: 'נשקל',
    notWeighed: 'טרם נשקל',
    notConfirmed: 'טרם אושר',
    next: 'הבא',
    removedLabel: 'הוסר',
    remove: 'הסר',
    restore: 'החזר',
    edit: 'ערוך',
    save: 'שמור',
    cancel: 'ביטול',
    kg: 'ק"ג',
    unitLbl: "יח'",
    pkgLbl: 'מארז',
    perKg: '₪/ק"ג',
    perPkg: '₪/מארז',
    liveWt: 'משקל חי',
    placeOnScale: 'הנח על המשקל...',
    scaleOn: 'משקל מחובר',
    scaleOff: 'משקל לא מחובר',
    autoSaved: (w) => `נשמר ${w} ק"ג`,
    reset: 'אפס',
    srcManual: 'ידני',
    srcScale: 'משקל (BEP)',
    srcPlaceholder: 'סקייל',
    srcOrdered: 'כמות הזמנה',
    srcPackage: 'מארז (אושר)',
    stPending: 'ממתין',
    stInProgress: 'בהכנה',
    stWeighed: 'נשקל',
    stSettling: 'מחייב…',
    stCompleted: 'הושלם',
    noPermission: 'אין הרשאות לצפות בדף זה',
    failWeeks: 'שגיאה בטעינת שבועות',
    failOrders: 'שגיאה בטעינת הזמנות',
    unitOrderedBadge: 'הוזמן ביחידות',
    underOneKgBadge: 'פחות מקילו',
    largeDiffWarn: (exp, act, pct) => `הכמות שהוזנה שונה ב-${pct}% מהכמות שהוזמנה.\nהוזמן: ${exp}\nהוזן: ${act}\nלהמשיך בכל זאת?`,
    claim: 'תפוס הזמנה',
    release: 'שחרר',
    transferDelivery: 'העבר משלוח',
    claimedBy: 'מטופל ע"י',
    busyElsewhere: 'הזמנה זו פתוחה בתחנה אחרת',
    workersOnline: 'עובדים מחוברים',
    searchProduct: 'חפש מוצר להוספה',
    addProduct: 'הוסף מוצר',
    qty: 'כמות',
    price: 'מחיר',
    savePrice: 'שמור מחיר',
    realtimeDraft: 'טיוטת שקילה בזמן אמת',
    orderClaimedOk: 'ההזמנה נתפסה לתחנה זו',
    orderReleasedOk: 'ההזמנה שוחררה',
    addItemOk: 'המוצר נוסף להזמנה',
    priceUpdatedOk: 'המחיר עודכן',
    deleteLine: 'מחק שורה',
    deleteLineConfirm: (n) => `למחוק לצמיתות את "${n}" מההזמנה? פעולה בלתי הפיכה.`,
    advancedActions: 'פעולות מתקדמות',
    confirmWait: (s) => `אישור (${s})`,
    offlineReady: 'עבודה מקומית פעילה',
    onlineReady: 'מחובר בזמן אמת',
    pendingSync: (n) => `ממתין לסנכרון: ${n}`,
    syncingNow: 'מסנכרן שינויים מקומיים...',
    syncDone: 'הסנכרון הושלם',
    syncConflicts: (n) => `קונפליקטים בסנכרון: ${n}`,
    offlineLoaded: 'נטען מהמטמון המקומי',
    offlineNoCache: 'אין מטמון מקומי לטווח הזה',
    offlineDraftSaved: 'נשמר מקומית. יסונכרן כשיש אינטרנט.',
    offlineOnlyCached: 'אפשר לעבוד אופליין רק עם הזמנות שכבר נטענו מקומית.',
    offlineClaimDisabled: 'אי אפשר לתפוס או לשחרר הזמנה בלי אינטרנט.',
    offlineChargeBlocked: 'לא ניתן לחייב בלי אינטרנט. סנכרן שינויים ואז נסה שוב.',
    syncBlockedByPending: 'יש שינויים מקומיים שממתינים לסנכרון או נתקעו בקונפליקט.',
    offlineEditOnlineOnly: 'הפעולה הזו זמינה רק אונליין.',
    conflictTitle: 'קונפליקטים אחרונים',
    conflictHelp: 'נוצר כשהענן השתנה בזמן שהשקילה נשמרה מקומית. בחרו איזה ערך לשמור.',
    conflictSameValues: 'המשקל זהה — אפשר לנקות את ההתראה.',
    acceptCloud: 'קבל ערך בענן',
    keepLocal: 'שמור מקומי לענן',
    dismissConflict: 'נקה התראה',
    localAttempt: 'ניסיון מקומי',
    cloudValue: 'ערך בענן',
    conflictLine: 'שורה',
    conflictStatus: 'סטטוס',
    reusableCartonBadge: 'קרטון חוזר',
    reusableCartonBannerTitle: 'הלקוח ביקש קרטוני חקלאים בשימוש חוזר',
    reusableCartonBannerBody: 'ארזו את ההזמנה בקרטוני חקלאים נקיים ובמצב טוב, אם קיימים בעמדת האריזה.',
  },
  th: {
    title: 'จัดการจัดส่ง V7',
    subtitle: 'ชั่งสินค้าแบบเรียลไทม์ระหว่างหลายสถานี',
    switchLang: 'HE עברית',
    showScale: 'แสดงตาชั่ง',
    hideScale: 'ซ่อนตาชั่ง',
    week: 'สัปดาห์:',
    communities: 'ชุมชน:',
    allCommunities: 'ทุกชุมชน',
    nSelected: (n) => `เลือก ${n}`,
    selectAll: 'ทั้งหมด',
    clearSel: 'ล้าง',
    load: 'โหลดคำสั่งซื้อ',
    deliveryDay: 'วันจัดส่ง:',
    allDeliveryDays: 'ทุกวันจัดส่ง',
    fromDate: 'จากวันที่:',
    toDate: 'ถึงวันที่:',
    clearDates: 'ล้างวันที่',
    weekLabel: 'สัปดาห์:',
    commLabel: 'ชุมชน:',
    orders: 'คำสั่งซื้อ',
    total: 'รวม',
    noOrders: 'ไม่มีคำสั่งซื้อ',
    customer: 'ลูกค้า',
    items: 'รายการ',
    pickOrder: 'เลือกคำสั่งซื้อเพื่อเริ่ม',
    community: 'ชุมชน',
    phone: 'โทร',
    useOrderedQty: 'ใช้จำนวนที่สั่งทั้งหมด',
    completeBtn: 'เสร็จ + เก็บเงิน',
    orderedKg: 'สั่ง (กก.)',
    weighedKg: 'ชั่ง (กก.)',
    orderedPrice: 'ราคาสั่ง (₪)',
    weighedPrice: 'ราคาชั่ง (₪)',
    itemsLabel: (a, t2) => `รายการ (${a}/${t2})`,
    ordered: 'สั่ง',
    weighed: 'ชั่งแล้ว',
    notWeighed: 'ยังไม่ชั่ง',
    notConfirmed: 'ยังไม่ยืนยัน',
    next: 'ถัดไป',
    removedLabel: 'ลบแล้ว',
    remove: 'ลบ',
    restore: 'กู้คืน',
    edit: 'แก้ไข',
    save: 'บันทึก',
    cancel: 'ยกเลิก',
    kg: 'กก.',
    unitLbl: 'ชิ้น',
    pkgLbl: 'แพ็ก',
    perKg: '₪/กก.',
    perPkg: '₪/แพ็ก',
    liveWt: 'น้ำหนักสด',
    placeOnScale: 'วางบนตาชั่ง...',
    scaleOn: 'ตาชั่งเชื่อมต่อแล้ว',
    scaleOff: 'ตาชั่งไม่ได้เชื่อมต่อ',
    autoSaved: (w) => `บันทึก ${w} กก.`,
    reset: 'รีเซ็ต',
    srcManual: 'กรอกเอง',
    srcScale: 'ตาชั่ง (BEP)',
    srcPlaceholder: 'ตาชั่ง',
    srcOrdered: 'จำนวนที่สั่ง',
    srcPackage: 'แพ็ก (ยืนยัน)',
    stPending: 'รอ',
    stInProgress: 'กำลังทำ',
    stWeighed: 'ชั่งแล้ว',
    stSettling: 'เก็บเงิน…',
    stCompleted: 'เสร็จแล้ว',
    noPermission: 'ไม่มีสิทธิ์เข้าถึง',
    failWeeks: 'โหลดสัปดาห์ล้มเหลว',
    failOrders: 'โหลดคำสั่งซื้อล้มเหลว',
    unitOrderedBadge: 'สั่งเป็นหน่วย',
    underOneKgBadge: 'น้อยกว่า 1 กก.',
    largeDiffWarn: (exp, act, pct) => `ค่าน้ำหนักต่างจากที่สั่ง ${pct}%\nสั่ง: ${exp}\nที่กรอก: ${act}\nยืนยันดำเนินการต่อหรือไม่?`,
    claim: 'จองออเดอร์',
    release: 'ปล่อย',
    transferDelivery: 'ย้ายวันจัดส่ง',
    claimedBy: 'กำลังทำโดย',
    busyElsewhere: 'คำสั่งซื้อนี้เปิดอยู่ที่สถานีอื่น',
    workersOnline: 'พนักงานออนไลน์',
    searchProduct: 'ค้นหาสินค้าเพื่อเพิ่ม',
    addProduct: 'เพิ่มสินค้า',
    qty: 'จำนวน',
    price: 'ราคา',
    savePrice: 'บันทึกราคา',
    realtimeDraft: 'ฉบับร่างชั่งน้ำหนักแบบเรียลไทม์',
    orderClaimedOk: 'จองคำสั่งซื้อนี้แล้ว',
    orderReleasedOk: 'ปล่อยคำสั่งซื้อแล้ว',
    addItemOk: 'เพิ่มสินค้าแล้ว',
    priceUpdatedOk: 'อัปเดตราคาแล้ว',
    deleteLine: 'ลบบรรทัด',
    deleteLineConfirm: (n) => `ลบ "${n}" ออกจากคำสั่งซื้อถาวร? ไม่สามารถย้อนกลับได้`,
    advancedActions: 'การดำเนินการขั้นสูง',
    confirmWait: (s) => `ยืนยัน (${s})`,
    offlineReady: 'ทำงานจากแคชในเครื่อง',
    onlineReady: 'เชื่อมต่อเรียลไทม์',
    pendingSync: (n) => `รอซิงก์: ${n}`,
    syncingNow: 'กำลังซิงก์การเปลี่ยนแปลงในเครื่อง...',
    syncDone: 'ซิงก์เสร็จแล้ว',
    syncConflicts: (n) => `ซิงก์มีความขัดแย้ง: ${n}`,
    offlineLoaded: 'โหลดจากแคชในเครื่องแล้ว',
    offlineNoCache: 'ไม่มีแคชในเครื่องสำหรับช่วงนี้',
    offlineDraftSaved: 'บันทึกในเครื่องแล้ว จะซิงก์เมื่อมีอินเทอร์เน็ต',
    offlineOnlyCached: 'โหมดออฟไลน์ใช้ได้เฉพาะออเดอร์ที่เคยโหลดไว้แล้ว',
    offlineClaimDisabled: 'ไม่สามารถจองหรือปล่อยออเดอร์เมื่อไม่มีอินเทอร์เน็ต',
    offlineChargeBlocked: 'ไม่สามารถเก็บเงินแบบออฟไลน์ได้ ซิงก์ก่อนแล้วลองใหม่',
    syncBlockedByPending: 'ยังมีการเปลี่ยนแปลงในเครื่องที่รอซิงก์หรือมีความขัดแย้ง',
    offlineEditOnlineOnly: 'การกระทำนี้ใช้งานได้เฉพาะตอนออนไลน์',
    conflictTitle: 'ความขัดแย้งล่าสุด',
    conflictHelp: 'เกิดเมื่อคลาวด์เปลี่ยนระหว่างบันทึกในเครื่อง เลือกค่าที่ต้องการเก็บ',
    conflictSameValues: 'น้ำหนักเท่ากัน — ล้างการแจ้งเตือนได้',
    acceptCloud: 'ใช้ค่าคลาวด์',
    keepLocal: 'บันทึกค่าในเครื่องขึ้นคลาวด์',
    dismissConflict: 'ล้างการแจ้งเตือน',
    localAttempt: 'ค่าที่พยายามบันทึก',
    cloudValue: 'ค่าในคลาวด์',
    conflictLine: 'บรรทัด',
    conflictStatus: 'สถานะ',
    reusableCartonBadge: 'กล่องใช้ซ้ำ',
    reusableCartonBannerTitle: 'ลูกค้าขอกล่องเกษตรกรใช้ซ้ำ',
    reusableCartonBannerBody: 'แพ็กออเดอร์นี้ในกล่องเกษตรกรที่สะอาดและสภาพดี ถ้ามีพร้อมใช้งานที่จุดแพ็ก',
  },
};

function BilingualDialog({ open, title, heText, thText, type, confirmButtonDelay = 0, onConfirm, onCancel }) {
  const [confirmCountdown, setConfirmCountdown] = React.useState(0);

  React.useEffect(() => {
    if (!open || type !== 'confirm' || !confirmButtonDelay) {
      setConfirmCountdown(0);
      return undefined;
    }
    setConfirmCountdown(confirmButtonDelay);
    const interval = setInterval(() => {
      setConfirmCountdown((prev) => {
        if (prev <= 1000) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1000;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [open, type, confirmButtonDelay]);

  if (!open) return null;
  const isConfirm = type === 'confirm';
  const confirmDisabled = confirmCountdown > 0;
  const confirmSeconds = Math.ceil(confirmCountdown / 1000);

  const palette = title === 'error'
    ? { grad: 'from-red-500 to-red-600', bg: 'bg-red-50', ring: 'ring-red-200', iconBg: 'bg-red-100', iconColor: 'text-red-600' }
    : title === 'success'
      ? { grad: 'from-emerald-500 to-emerald-600', bg: 'bg-emerald-50', ring: 'ring-emerald-200', iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600' }
      : title === 'warning'
        ? { grad: 'from-amber-500 to-amber-600', bg: 'bg-amber-50', ring: 'ring-amber-200', iconBg: 'bg-amber-100', iconColor: 'text-amber-600' }
        : { grad: 'from-blue-500 to-blue-600', bg: 'bg-blue-50', ring: 'ring-blue-200', iconBg: 'bg-blue-100', iconColor: 'text-blue-600' };

  const iconMap = {
    error: <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>,
    success: <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>,
    warning: <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86l-8.58 14.86A1.98 1.98 0 003.43 21h17.14a1.98 1.98 0 001.72-2.99L13.71 3.86a2 2 0 00-3.42 0z" /></svg>,
    info: <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" /></svg>,
  };
  const icon = iconMap[title] || iconMap.info;

  return (
    <>
      <style>{`
        @keyframes dialogFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes dialogSlideUp { from { opacity: 0; transform: scale(0.95) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
      `}</style>
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center p-4"
        style={{ animation: 'dialogFadeIn 0.2s ease-out', backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
        onClick={onCancel}
      >
        <div
          className={`w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden ring-1 ${palette.ring}`}
          style={{ animation: 'dialogSlideUp 0.25s ease-out' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={`flex justify-center pt-6 pb-2 ${palette.bg}`}>
            <div className={`w-14 h-14 rounded-full flex items-center justify-center ${palette.iconBg} ${palette.iconColor}`}>
              {icon}
            </div>
          </div>
          <div className={`px-6 pb-4 pt-2 ${palette.bg}`}>
            <div dir="rtl" className="text-center mb-2">
              <p className="text-[15px] font-bold text-gray-900 leading-relaxed">{heText}</p>
            </div>
            <div className="flex items-center gap-2 my-2">
              <div className="flex-1 border-t border-gray-200" />
              <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">TH</span>
              <div className="flex-1 border-t border-gray-200" />
            </div>
            <div dir="ltr" className="text-center">
              <p className="text-[14px] font-semibold text-gray-600 leading-relaxed">{thText}</p>
            </div>
          </div>
          <div className="px-5 pb-5 pt-1 flex gap-3 bg-white">
            {isConfirm ? (
              <>
                <button
                  autoFocus
                  onClick={onConfirm}
                  disabled={confirmDisabled}
                  className={`flex-1 py-3 rounded-xl font-black text-white text-sm transition-all bg-gradient-to-r ${palette.grad} hover:shadow-lg active:scale-[0.98] focus:outline-none focus:ring-2 ${palette.ring} disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {confirmDisabled ? `✓ אישור (${confirmSeconds}) / ตกลง (${confirmSeconds})` : '✓ אישור / ตกลง'}
                </button>
                <button
                  onClick={onCancel}
                  className="flex-1 py-3 rounded-xl font-bold text-gray-600 text-sm bg-gray-100 hover:bg-gray-200 active:scale-[0.98] transition-all focus:outline-none"
                >
                  ✕&ensp;ביטול / ยกเลิก
                </button>
              </>
            ) : (
              <button
                autoFocus
                onClick={onCancel}
                className={`flex-1 py-3 rounded-xl font-black text-white text-sm transition-all bg-gradient-to-r ${palette.grad} hover:shadow-lg active:scale-[0.98] focus:outline-none focus:ring-2 ${palette.ring}`}
              >
                ✓&ensp;אישור / ตกลง
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function sourceLabel(src, t) {
  const map = {
    manual: t.srcManual,
    scale: t.srcScale,
    scale_placeholder: t.srcPlaceholder,
    ordered_default: t.srcOrdered,
    package: t.srcPackage,
  };
  return map[src] || t.srcManual;
}

function formatOrderedExpectation(it, expectedQtyForCompare, t) {
  const measurementType = it?.measurementType || 'kg';
  if (measurementType === 'package') {
    return `${Math.floor(expectedQtyForCompare)} ${t.pkgLbl}`;
  }
  if (measurementType === 'unit') {
    const unitQty = Number(it?.requestedQuantity || 0);
    return `${Number(expectedQtyForCompare).toFixed(3)} ${t.kg} (~${Math.floor(unitQty)} ${t.unitLbl})`;
  }
  return `${Number(expectedQtyForCompare).toFixed(3)} ${t.kg}`;
}

function parseOrderDeliveryDate(order) {
  return getOrderDeliveryDate(order?.rawData || order);
}

function parseLocalDateKey(dateKey) {
  return parseDateSafe(dateKey);
}

function buildDeliveryDayOptions(weekKey, lang) {
  const weekStart = parseLocalDateKey(weekKey);
  if (!weekStart) return [];
  const locale = lang === 'th' ? 'th-TH' : 'he-IL';

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    const dateKey = toLocalDateKey(date);
    return {
      value: dateKey,
      label: date.toLocaleDateString(locale, {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
      }),
    };
  });
}

function filterOrdersByDeliveryDates(orders = [], startStr, endStr) {
  const range = normalizeDateRange(startStr, endStr);
  if (!range) return orders;
  return (orders || []).filter((order) => {
    const deliveryDate = parseOrderDeliveryDate(order);
    if (!deliveryDate) return false;
    return deliveryDate >= range.start && deliveryDate <= range.end;
  });
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeWeightSnapshot(entry) {
  if (!entry || entry.actualQuantity == null) return null;
  return {
    actualQuantity: Number(entry.actualQuantity),
    source: entry.source || '',
  };
}

const WEIGHT_COMPARE_EPSILON = 0.0005;

function extractWeightSnapshot(snapshot) {
  if (!snapshot) return null;
  if (Object.prototype.hasOwnProperty.call(snapshot, 'weight')) {
    return normalizeWeightSnapshot(snapshot.weight);
  }
  return normalizeWeightSnapshot(snapshot);
}

function areWeightSnapshotsEqual(a, b) {
  const left = extractWeightSnapshot(a);
  const right = extractWeightSnapshot(b);
  if (!left && !right) return true;
  if (!left || !right) return false;
  if (left.actualQuantity == null && right.actualQuantity == null) return true;
  if (left.actualQuantity == null || right.actualQuantity == null) return false;
  return Math.abs(left.actualQuantity - right.actualQuantity) <= WEIGHT_COMPARE_EPSILON;
}

function areOpSnapshotsEqual(a, b) {
  if (areWeightSnapshotsEqual(a, b)) return true;
  if (Object.prototype.hasOwnProperty.call(a || {}, 'removed') || Object.prototype.hasOwnProperty.call(b || {}, 'removed')) {
    return Boolean(a?.removed) === Boolean(b?.removed);
  }
  if (Object.prototype.hasOwnProperty.call(a || {}, 'status') || Object.prototype.hasOwnProperty.call(b || {}, 'status')) {
    return String(a?.status || '') === String(b?.status || '');
  }
  return JSON.stringify(a || null) === JSON.stringify(b || null);
}

function filterResolvedConflicts(conflicts = []) {
  return (conflicts || []).filter((conflict) => {
    const localSnapshot = conflictLocalSnapshot(conflict);
    return !areOpSnapshotsEqual(localSnapshot, conflict.cloudValue);
  });
}

function conflictLocalSnapshot(conflict) {
  if (!conflict) return null;
  if (conflict.type === 'setWeight' || conflict.type === 'clearWeight') {
    return { weight: normalizeWeightSnapshot(conflict.localValue) };
  }
  if (conflict.type === 'removeLine') return { removed: true };
  if (conflict.type === 'restoreLine') return { removed: false };
  return { status: conflict.localValue?.status || '' };
}

function applyCloudSnapshotToDraft(draft, conflict) {
  const next = {
    ...(draft || {}),
    weightsByLineId: { ...((draft || {}).weightsByLineId || {}) },
    removedLineIds: { ...((draft || {}).removedLineIds || {}) },
  };
  if (conflict.type === 'setWeight' || conflict.type === 'clearWeight') {
    const cloudWeight = conflict.cloudValue?.weight;
    next.weightsByLineId[conflict.lineId] = cloudWeight?.actualQuantity != null
      ? cloudWeight
      : { actualQuantity: null, source: cloudWeight?.source || 'manual' };
  } else if (conflict.type === 'removeLine') {
    next.removedLineIds[conflict.lineId] = true;
  } else if (conflict.type === 'restoreLine') {
    delete next.removedLineIds[conflict.lineId];
  } else if (conflict.type === 'setStatus') {
    next.status = conflict.cloudValue?.status || next.status || '';
  }
  return next;
}

function isDelayedOrderSettledData(data = {}) {
  const delayedStatus = String(data.delayedOrderStatus || '').toLowerCase();
  const paymentStatus = String(data.paymentStatus || '').toLowerCase();
  return (
    ['settled', 'completed', 'charged'].includes(delayedStatus)
    || ['charged', 'completed', 'settled'].includes(paymentStatus)
  );
}

function isOrderSettledForSync(order) {
  if (!order) return false;
  return order.status === 'completed'
    || isDelayedOrderSettledData(order.rawData || {})
    || isDelayedOrderSettledData(order.delayedMeta || {});
}

function formatConflictValue(snapshot, langPack) {
  if (!snapshot) return '-';
  if (Object.prototype.hasOwnProperty.call(snapshot, 'removed')) {
    return snapshot.removed ? langPack.removedLabel : langPack.restore;
  }
  if (Object.prototype.hasOwnProperty.call(snapshot, 'status')) {
    return snapshot.status || '-';
  }
  if (Object.prototype.hasOwnProperty.call(snapshot, 'weight')) {
    const weight = normalizeWeightSnapshot(snapshot.weight);
    return weight ? `${Number(weight.actualQuantity).toFixed(3)} ${langPack.kg}` : langPack.reset;
  }
  return '-';
}

function normalizeSupplierOption(opt) {
  if (!opt) return '';
  const trimmed = String(opt).trim();
  if (trimmed === 'ללא אופציות' || trimmed === 'None') return '';
  return trimmed;
}

function getMissingLineDetails(item, weights = {}, removed = {}) {
  if (!item?.lineId || item.catalogNumber === BUFFER_LINE_CATALOG_NUMBER) return null;
  const measurementType = item.measurementType || 'kg';
  const requested = Number(item.requestedQuantity || 0);
  if (requested <= 0) return null;

  const avg = Number(item.averageWeightKg || 1) || 1;
  const unitSize = Number(item.unitSize || 1) || 1;
  const expected = measurementType === 'unit' ? requested * avg : requested;
  const actual = removed[item.lineId] ? 0 : Number(weights[item.lineId]?.actualQuantity || 0);
  const missing = Math.max(0, expected - actual);
  if (missing <= 0.0005) return null;

  const fulfillmentRatio = expected > 0 ? actual / expected : 1;
  const isFullyMissing = actual <= 0.0005;
  const isPartialUnderHalf = !isFullyMissing && fulfillmentRatio < 0.5;
  if (!isFullyMissing && !isPartialUnderHalf) return null;

  const unitQty = measurementType === 'unit'
    ? missing / avg
    : measurementType === 'package'
      ? missing
      : missing / unitSize;

  return {
    measurementType,
    avg,
    unitSize,
    expected,
    actual,
    missing,
    unitQty,
    isFullyMissing,
    isPartialUnderHalf,
  };
}

function getOrderCopyDate(selectedWeek, endDate) {
  const date = endDate ? new Date(endDate) : new Date(selectedWeek);
  if (!endDate && selectedWeek && !Number.isNaN(date.getTime())) date.setDate(date.getDate() + 5);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '.');
}

function copyTextToClipboard(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
  return Promise.resolve();
}

function getDisplayName(user) {
  return user?.displayName || user?.email || user?.phoneNumber || 'Admin';
}

function getEffectiveOrderStatus(order, draft) {
  if (!order) return 'pending';
  if (order.status === 'completed') return 'completed';
  return draft?.status || order.status || 'pending';
}

function getPersistedCompletedDraft(order) {
  const raw = order?.rawData || {};
  const weighing = raw.weighing || {};
  const weightsByLineId = {
    ...(raw.weightsByLineId || {}),
    ...(weighing.weightsByLineId || {}),
  };
  const removedLineIds = {
    ...(raw.removedLineIds || {}),
    ...(weighing.removedLineIds || {}),
  };
  const finalInvoiceLines = Array.isArray(weighing.finalInvoiceLines)
    ? weighing.finalInvoiceLines
    : (Array.isArray(raw.finalInvoiceLines) ? raw.finalInvoiceLines : []);

  finalInvoiceLines.forEach((line) => {
    if (!line?.lineId || line.actualQuantity == null) return;
    weightsByLineId[line.lineId] = {
      actualQuantity: Number(line.actualQuantity),
      source: line.weighSource || line.source || 'completed',
    };
  });

  return {
    orderId: order?.id || raw.id || '',
    status: raw.delayedOrderStatus || order?.status || '',
    weightsByLineId,
    removedLineIds,
    finalSum: weighing.finalSum ?? raw.finalSum,
    finalInvoiceLines,
  };
}

function mergeOrderDraftWithPersistedCompletion(order, draft = {}) {
  const persisted = getPersistedCompletedDraft(order);
  return {
    ...persisted,
    ...draft,
    weightsByLineId: {
      ...(persisted.weightsByLineId || {}),
      ...(draft.weightsByLineId || {}),
    },
    removedLineIds: {
      ...(persisted.removedLineIds || {}),
      ...(draft.removedLineIds || {}),
    },
    status: draft.status || persisted.status || '',
  };
}

export default function DeliveryManagementV7() {
  const { currentUser, userRole } = useAuth();

  const [lang, setLang] = useState(() => localStorage.getItem(LANG_STORAGE_KEY) || 'he');
  const [expandedAdvancedLineId, setExpandedAdvancedLineId] = useState(null);
  const [pickupSpotsList, setPickupSpotsList] = useState(() => getPickupSpotsSync().pickupSpots);
  const t = TR[lang] || TR.he;
  const tRef = useRef(t);
  const isRTL = lang === 'he';
  useEffect(() => subscribePickupSpots((snap) => setPickupSpotsList(snap.pickupSpots)), []);

  const toggleLang = () => {
    const next = lang === 'he' ? 'th' : 'he';
    setLang(next);
    localStorage.setItem(LANG_STORAGE_KEY, next);
  };

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const stationId = useMemo(() => getOrCreateStationIdV7(), []);
  const session = useMemo(() => ({
    stationId,
    userId: currentUser?.uid || '',
    userName: getDisplayName(currentUser),
    sessionId: buildSessionIdV7({ userId: currentUser?.uid, stationId }),
  }), [currentUser, stationId]);
  const initialSetup = useMemo(() => readLastSetupV7(), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [availableWeeks, setAvailableWeeks] = useState([]);
  const [tempSelectedWeek, setTempSelectedWeek] = useState(initialSetup.weekKey || '');
  const [selectedWeek, setSelectedWeek] = useState(initialSetup.weekKey || '');
  const [tempSpecificStartDate, setTempSpecificStartDate] = useState(initialSetup.startDate || '');
  const [tempSpecificEndDate, setTempSpecificEndDate] = useState(initialSetup.endDate || '');
  const [selectedSpecificStartDate, setSelectedSpecificStartDate] = useState(initialSetup.startDate || '');
  const [selectedSpecificEndDate, setSelectedSpecificEndDate] = useState(initialSetup.endDate || '');
  const [showCommunityDropdown, setShowCommunityDropdown] = useState(false);
  const communityDropdownRef = useRef(null);
  const [tempSelectedCommunities, setTempSelectedCommunities] = useState(new Set(Array.isArray(initialSetup.communities) ? initialSetup.communities : []));
  const [selectedCommunities, setSelectedCommunities] = useState(new Set(Array.isArray(initialSetup.communities) ? initialSetup.communities : []));

  const [orders, setOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [activeItemIndex, setActiveItemIndex] = useState(-1);
  const [productDetails, setProductDetails] = useState({});
  const productDetailsRef = useRef({});
  const [isOnline, setIsOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [remoteDraftsByOrder, setRemoteDraftsByOrder] = useState({});
  const [localDraftsByOrder, setLocalDraftsByOrder] = useState({});
  const [pendingOps, setPendingOps] = useState([]);
  const pendingOpsRef = useRef([]);
  const applyingOpsOnlineRef = useRef(false);
  const [syncConflicts, setSyncConflicts] = useState([]);
  const [syncingOffline, setSyncingOffline] = useState(false);
  const imageMemoryCacheRef = useRef({});
  const [permanentNumbersMap, setPermanentNumbersMap] = useState({});
  const permanentNumbersMapRef = useRef({});
  const currentScreenRef = useRef({ orders: [] });
  const [showScalePanel, setShowScalePanel] = useState(false);
  const { isElectron: isElectronEnv, isConnected: scaleConnected, weight: liveWeight, lastStableWeight } = useWeightScale();
  const [editingLineId, setEditingLineId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [editingPriceLineId, setEditingPriceLineId] = useState(null);
  const [editPriceValue, setEditPriceValue] = useState('');
  const prevStableRef = useRef(0);
  const autoWeighActiveRef = useRef(false);
  const [communityFilter, setCommunityFilter] = useState('__all__');
  const [showCompleted, setShowCompleted] = useState(false);
  const [communityOrder, setCommunityOrder] = useState(() => readCommunityOrder(COMMUNITY_ORDER_KEY));
  const [communityColorOverrides, setCommunityColorOverrides] = useState(() => readCommunityColorOverrides());
  const [pendingCommunityColors, setPendingCommunityColors] = useState({});
  const [showCommunityNumbering, setShowCommunityNumbering] = useState(() => readShowCommunityNumbering());
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = useCallback((msg, dur = 2500) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), dur);
  }, []);

  useEffect(() => {
    permanentNumbersMapRef.current = permanentNumbersMap;
    currentScreenRef.current = {
      orders,
      productDetails,
      permanentNumbersMap,
      remoteDraftsByOrder,
      localDraftsByOrder,
      pendingOps,
      syncConflicts,
    };
  }, [orders, productDetails, permanentNumbersMap, remoteDraftsByOrder, localDraftsByOrder, pendingOps, syncConflicts]);

  const [dialog, setDialog] = useState(null);
  const dialogResolveRef = useRef(null);
  const showDialog = useCallback(({ heText, thText, title = 'info', type = 'alert' }) => {
    return new Promise((resolve) => {
      dialogResolveRef.current = resolve;
      setDialog({ heText, thText, title, type });
    });
  }, []);
  const closeDialog = useCallback((result) => {
    if (dialogResolveRef.current) dialogResolveRef.current(result);
    dialogResolveRef.current = null;
    setDialog(null);
  }, []);
  const biConfirm = useCallback(({ heText, thText, title = 'warning', confirmButtonDelay = 0 }) => (
    showDialog({ heText, thText, title, type: 'confirm', confirmButtonDelay })
  ), [showDialog]);
  const biAlert = useCallback(({ heText, thText, title = 'info' }) => showDialog({ heText, thText, title, type: 'alert' }), [showDialog]);
  const preloadImageUrl = useCallback((url) => {
    if (!url || typeof Image === 'undefined') return Promise.resolve(url || '');
    const existing = imageMemoryCacheRef.current[url];
    if (existing?.loaded) return Promise.resolve(url);
    if (existing?.promise) return existing.promise;
    const img = new Image();
    img.decoding = 'async';
    const promise = new Promise((resolve) => {
      img.onload = () => {
        imageMemoryCacheRef.current[url] = { img, loaded: true };
        resolve(url);
      };
      img.onerror = () => {
        imageMemoryCacheRef.current[url] = { img: null, loaded: false, failed: true };
        resolve(url);
      };
    });
    imageMemoryCacheRef.current[url] = { img, loaded: false, promise };
    img.src = url;
    return promise;
  }, []);
  const prefetchProductImages = useCallback(async (detailsMap) => {
    const urls = Array.from(new Set(
      Object.values(detailsMap || {})
        .flatMap((pd) => (Array.isArray(pd?.images) ? pd.images : []))
        .filter(Boolean),
    ));
    if (urls.length === 0) return;
    await Promise.all(urls.map((url) => preloadImageUrl(url)));
  }, [preloadImageUrl]);
  const cachedImg = useCallback((url) => url, []);
  const itemRefs = useRef({});
  const draftPersistDebounceRef = useRef(null);
  const currentScopeKey = useMemo(() => buildOfflineScopeKey({
    weekKey: selectedWeek,
    communities: Array.from(selectedCommunities),
    startDate: selectedSpecificStartDate,
    endDate: selectedSpecificEndDate,
  }), [selectedWeek, selectedCommunities, selectedSpecificStartDate, selectedSpecificEndDate]);
  const deliveryDayOptions = useMemo(
    () => buildDeliveryDayOptions(tempSelectedWeek, lang),
    [tempSelectedWeek, lang],
  );
  const selectedDeliveryDayKey = tempSpecificStartDate
    && tempSpecificStartDate === tempSpecificEndDate
    ? tempSpecificStartDate
    : '';

  useEffect(() => {
    pendingOpsRef.current = pendingOps;
  }, [pendingOps]);

  const [presence, setPresence] = useState([]);
  const [claimsByOrder, setClaimsByOrder] = useState({});
  const [savingActionKey, setSavingActionKey] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [addQuantities, setAddQuantities] = useState({});
  const [missingModalOpen, setMissingModalOpen] = useState(false);
  const [missingModalItems, setMissingModalItems] = useState([]);
  const [missingModalCommunities, setMissingModalCommunities] = useState(new Set());
  const [missingModalView, setMissingModalView] = useState('items');
  const [missingModalIncludeCompleted, setMissingModalIncludeCompleted] = useState(false);

  const isAdmin = !!currentUser && (userRole === 'admin' || ADMIN_UIDS.includes(currentUser.uid));

  useEffect(() => {
    const handler = (e) => {
      if (communityDropdownRef.current && !communityDropdownRef.current.contains(e.target)) {
        setShowCommunityDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return () => {};
    const updateOnline = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  useEffect(() => {
    if (activeItemIndex >= 0 && itemRefs.current[activeItemIndex]) {
      itemRefs.current[activeItemIndex].scrollIntoView({ behavior: 'auto', block: 'nearest' });
    }
  }, [activeItemIndex]);

  useEffect(() => {
    if (!isAdmin) {
      setError(tRef.current.noPermission);
      setLoading(false);
      return;
    }
    let active = true;
    fetchAvailableDeliveryWeeksV7()
      .then((weeks) => {
        if (!active) return;
        setAvailableWeeks(weeks);
        if (weeks.length > 0) setTempSelectedWeek((prev) => prev || weeks[0]);
      })
      .catch((e) => {
        console.error(e);
        if (active && !isLikelyNetworkErrorV7(e)) setError(tRef.current.failWeeks);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [isAdmin]);

  const fetchPermanentCustomerNumbers = useCallback(async (customersList) => {
    if (!customersList || customersList.length === 0) return {};
    const uniqueCustomersById = new Map();
    customersList.forEach((customer) => {
      const id = customer?.id;
      if (!id) return;
      if (!uniqueCustomersById.has(id)) {
        uniqueCustomersById.set(id, { id, name: customer?.name || '' });
      }
    });
    const uniqueCustomers = Array.from(uniqueCustomersById.values());
    if (uniqueCustomers.length === 0) return {};
    const mapping = {};
    const missing = [];
    try {
      await Promise.all(uniqueCustomers.map(async (customer) => {
        const id = customer?.id;
        if (!id) return;
        const ref = doc(db, 'customerNumbers', id);
        const snap = await getDoc(ref);
        if (snap.exists()) mapping[id] = snap.data()?.number;
        else missing.push(customer);
      }));
      if (missing.length === 0) return mapping;
      const configRef = doc(db, 'customerNumbers', '_config');
      await runTransaction(db, async (tx) => {
        const configSnap = await tx.get(configRef);
        let currentMax = configSnap.exists() ? Number(configSnap.data()?.maxNumber || 0) : 0;
        let next = currentMax;
        for (const item of missing) {
          const id = item?.id;
          if (!id) continue;
          next += 1;
          tx.set(doc(db, 'customerNumbers', id), { number: next, name: item?.name || '', assignedAt: new Date() });
          mapping[id] = next;
        }
        tx.set(configRef, { maxNumber: next }, { merge: true });
      });
      return mapping;
    } catch (error) {
      if (!isLikelyNetworkErrorV7(error)) throw error;
      const cachedNumbers = permanentNumbersMapRef.current || {};
      uniqueCustomers.forEach((customer) => {
        if (customer?.id && cachedNumbers[customer.id] != null) {
          mapping[customer.id] = cachedNumbers[customer.id];
        }
      });
      return mapping;
    }
  }, []);

  useEffect(() => {
    if (!selectedWeek) {
      setPendingOps([]);
      setSyncConflicts([]);
      setRemoteDraftsByOrder({});
      setLocalDraftsByOrder({});
      return;
    }
    const cachedScope = getOfflineScope(readOfflineStore(), currentScopeKey);
    setPendingOps((cachedScope?.pendingOps || []).filter((op) => !op?.lineId || isCanonicalLineIdV7(op.lineId)));
    setSyncConflicts(cachedScope?.conflicts || []);
    if (!isOnline && cachedScope) {
      setRemoteDraftsByOrder(cachedScope.remoteDraftsByOrder || {});
      const filteredPendingOps = (cachedScope.pendingOps || []).filter((op) => !op?.lineId || isCanonicalLineIdV7(op.lineId));
      setLocalDraftsByOrder(cachedScope.workingDraftsByOrder || applyOpsToDrafts(cachedScope.remoteDraftsByOrder || {}, filteredPendingOps));
    }
  }, [currentScopeKey, isOnline, selectedWeek]);

  // Persist only the hot draft fields on every weight/draft change.
  // Static data (orders, productDetails, permanentNumbersMap) is persisted once at week load via writeStaticScopeData.
  useEffect(() => {
    if (!selectedWeek || !currentScopeKey) return undefined;
    if (draftPersistDebounceRef.current) clearTimeout(draftPersistDebounceRef.current);
    draftPersistDebounceRef.current = setTimeout(() => {
      draftPersistDebounceRef.current = null;
      writeDraftScopeData(currentScopeKey, {
        remoteDraftsByOrder,
        workingDraftsByOrder: localDraftsByOrder,
        pendingOps,
        conflicts: syncConflicts,
      });
    }, 300);
    return () => {
      if (draftPersistDebounceRef.current) clearTimeout(draftPersistDebounceRef.current);
    };
  }, [selectedWeek, currentScopeKey, remoteDraftsByOrder, localDraftsByOrder, pendingOps, syncConflicts]);

  const buildQueuedOp = useCallback((op) => {
    const baseDraft = remoteDraftsByOrder[op.orderId] || {};
    return {
      ...op,
      weekKey: selectedWeek,
      id: `${Date.now()}::${Math.random().toString(36).slice(2, 8)}`,
      localTimestamp: nowIso(),
      baseDraftUpdatedAtIso: baseDraft.updatedAtIso || '',
      baseSnapshot: buildBaseSnapshotForOp(baseDraft, op),
    };
  }, [remoteDraftsByOrder, selectedWeek]);

  const isLikelyNetworkError = useCallback(isLikelyNetworkErrorV7, []);

  const applyCachedScopeToScreen = useCallback((cachedScope, { toast = true } = {}) => {
    setOrders(cachedScope.orders || []);
    setProductDetails(cachedScope.productDetails || {});
    productDetailsRef.current = cachedScope.productDetails || {};
    setPermanentNumbersMap(cachedScope.permanentNumbersMap || {});
    setRemoteDraftsByOrder(cachedScope.remoteDraftsByOrder || {});
    const filteredPendingOps = (cachedScope.pendingOps || []).filter((op) => !op?.lineId || isCanonicalLineIdV7(op.lineId));
    setLocalDraftsByOrder(cachedScope.workingDraftsByOrder || applyOpsToDrafts(cachedScope.remoteDraftsByOrder || {}, filteredPendingOps));
    setPendingOps(filteredPendingOps);
    setSyncConflicts(filterResolvedConflicts(cachedScope.conflicts || []));
    setError(null);
    setCommunityFilter('__all__');
    setSelectedOrderId((prev) => {
      if (prev && (cachedScope.orders || []).some((o) => o.id === prev)) return prev;
      const firstPending = (cachedScope.orders || []).find((o) => o.status !== 'completed');
      return firstPending ? firstPending.id : (cachedScope.orders?.[0]?.id || null);
    });
    setLoading(false);
    if (toast) showToast(tRef.current.offlineLoaded);
  }, [showToast]);

  const preserveCurrentScreenOffline = useCallback((message = '') => {
    if ((currentScreenRef.current.orders || []).length === 0) return false;
    setError(null);
    setLoading(false);
    if (message) showToast(message);
    return true;
  }, [showToast]);

  const queueManyDraftOps = useCallback((ops) => {
    let nextPending = pendingOps;
    (ops || []).forEach((op) => {
      nextPending = mergePendingOps(nextPending, op);
    });
    setPendingOps(nextPending);
    setLocalDraftsByOrder(applyOpsToDrafts(remoteDraftsByOrder, nextPending));
    return nextPending;
  }, [pendingOps, remoteDraftsByOrder]);

  const rollbackQueuedDraftOps = useCallback(() => {
    setLocalDraftsByOrder(applyOpsToDrafts(remoteDraftsByOrder, pendingOps));
  }, [remoteDraftsByOrder, pendingOps]);

  const ackManyDraftOps = useCallback((ops, nextRemoteDrafts) => {
    const ackIds = new Set((ops || []).map((op) => op.id));
    const remaining = pendingOps.filter((op) => !ackIds.has(op.id));
    setRemoteDraftsByOrder(nextRemoteDrafts);
    setPendingOps(remaining);
    setLocalDraftsByOrder(applyOpsToDrafts(nextRemoteDrafts, remaining));
    return remaining;
  }, [pendingOps]);

  const applyQueuedOpsOnline = useCallback(async ({ ops, remoteWrite, successToast = '' }) => {
    const queuedOps = (ops || []).map(buildQueuedOp);
    if (queuedOps.length === 0) return [];
    queueManyDraftOps(queuedOps);
    if (!isOnline) {
      showToast(tRef.current.offlineDraftSaved);
      return queuedOps;
    }
    applyingOpsOnlineRef.current = true;
    try {
      await remoteWrite(queuedOps);
      const nextRemoteDrafts = { ...remoteDraftsByOrder };
      queuedOps.forEach((op) => {
        nextRemoteDrafts[op.orderId] = applyOpToDraft(nextRemoteDrafts[op.orderId] || {}, op);
      });
      ackManyDraftOps(queuedOps, nextRemoteDrafts);
      const ackKeys = new Set(queuedOps.map((op) => `${op.orderId}::${op.lineId || ''}::${op.type}`));
      setSyncConflicts((prev) => prev.filter((conflict) => !ackKeys.has(`${conflict.orderId}::${conflict.lineId || ''}::${conflict.type}`)));
      if (successToast) showToast(successToast);
      return queuedOps;
    } catch (error) {
      if (isLikelyNetworkError(error)) {
        showToast(tRef.current.offlineDraftSaved);
        return queuedOps;
      }
      setPendingOps((prev) => prev.filter((queued) => !queuedOps.some((op) => op.id === queued.id)));
      rollbackQueuedDraftOps();
      throw error;
    } finally {
      applyingOpsOnlineRef.current = false;
    }
  }, [
    ackManyDraftOps,
    buildQueuedOp,
    isLikelyNetworkError,
    isOnline,
    queueManyDraftOps,
    remoteDraftsByOrder,
    rollbackQueuedDraftOps,
    showToast,
  ]);

  const syncOfflineOpsNow = useCallback(async ({ quiet = false } = {}) => {
    if (!isOnline || syncingOffline) return { pending: pendingOps.length, conflicts: syncConflicts.length };
    // The draft store is canonical, but include live state for ops that have not
    // reached localStorage yet because draft persistence is debounced.
    const draftStore = readDraftStore();
    const currentScreen = currentScreenRef.current || {};
    const statePendingOps = Array.isArray(currentScreen.pendingOps) ? currentScreen.pendingOps : [];
    const syncScopes = { ...(draftStore.scopes || {}) };
    if (currentScopeKey && statePendingOps.length > 0) {
      const currentDraftScope = syncScopes[currentScopeKey] || {};
      syncScopes[currentScopeKey] = {
        ...currentDraftScope,
        remoteDraftsByOrder: Object.keys(currentDraftScope.remoteDraftsByOrder || {}).length > 0
          ? currentDraftScope.remoteDraftsByOrder
          : (currentScreen.remoteDraftsByOrder || {}),
        workingDraftsByOrder: Object.keys(currentDraftScope.workingDraftsByOrder || {}).length > 0
          ? currentDraftScope.workingDraftsByOrder
          : (currentScreen.localDraftsByOrder || {}),
        pendingOps: statePendingOps,
      };
    }
    let nextDraftStore = draftStore;
    let currentScopeConflicts = [];
    let currentScopePending = statePendingOps.length || pendingOps.length;
    setSyncingOffline(true);
    try {
      for (const [scopeKey, scope] of Object.entries(syncScopes)) {
        const scopePending = Array.isArray(scope?.pendingOps) ? scope.pendingOps : [];
        if (scopePending.length === 0) continue;
        const byOrder = {};
        scopePending.forEach((op) => {
          if (op?.lineId && !isCanonicalLineIdV7(op.lineId)) {
            return;
          }
          if (!byOrder[op.orderId]) byOrder[op.orderId] = [];
          byOrder[op.orderId].push(op);
        });
        const resolvedConflicts = [];
        const remoteDrafts = { ...(scope.remoteDraftsByOrder || {}) };
        for (const [orderId, orderOps] of Object.entries(byOrder)) {
          const screenOrder = scopeKey === currentScopeKey
            ? (currentScreen.orders || []).find((order) => order.id === orderId)
            : null;
          if (isOrderSettledForSync(screenOrder)) {
            delete remoteDrafts[orderId];
            continue;
          }

          const orderSnap = await getDoc(doc(db, 'customerOrdersDelayed', orderId));
          if (orderSnap.exists() && isDelayedOrderSettledData(orderSnap.data() || {})) {
            delete remoteDrafts[orderId];
            continue;
          }

          const draftSnap = await getDoc(doc(db, 'deliveryRealtimeV7', orderOps[0].weekKey, 'drafts', orderId));
          let currentRemoteDraft = draftSnap.exists() ? ({ id: draftSnap.id, ...draftSnap.data() }) : {};
          orderOps.sort((a, b) => String(a.localTimestamp || '').localeCompare(String(b.localTimestamp || '')));
          for (const op of orderOps) {
            const currentFieldValue = getCurrentFieldValueForOp(currentRemoteDraft, op);
            const desiredFieldValue = getDesiredFieldValueForOp(op);
            const cloudChangedSinceBase = !areOpSnapshotsEqual(currentFieldValue, op.baseSnapshot);
            const cloudAlreadyMatchesDesired = areOpSnapshotsEqual(currentFieldValue, desiredFieldValue);
            if (cloudChangedSinceBase && !cloudAlreadyMatchesDesired) {
              resolvedConflicts.push({
                id: op.id,
                orderId: op.orderId,
                lineId: op.lineId || '',
                type: op.type,
                localValue: op.value,
                cloudValue: currentFieldValue,
                localTimestamp: op.localTimestamp,
              });
              continue;
            }
            if (cloudChangedSinceBase && cloudAlreadyMatchesDesired) {
              currentRemoteDraft = applyOpToDraft(currentRemoteDraft, op);
              continue;
            }
            if (op.type === 'setWeight') {
              await setDraftLineWeightV7({
                weekKey: op.weekKey,
                orderId: op.orderId,
                lineId: op.lineId,
                actualQuantity: op.value?.actualQuantity,
                source: op.value?.source,
                status: op.value?.status,
                session,
              });
            } else if (op.type === 'clearWeight') {
              await clearDraftLineWeightV7({
                weekKey: op.weekKey,
                orderId: op.orderId,
                lineId: op.lineId,
                status: op.value?.status,
                session,
              });
            } else if (op.type === 'removeLine' || op.type === 'restoreLine') {
              await setDraftLineRemovedV7({
                weekKey: op.weekKey,
                orderId: op.orderId,
                lineId: op.lineId,
                removed: op.type === 'removeLine',
                session,
              });
            } else if (op.type === 'setStatus') {
              await saveOrderDraftV7({
                weekKey: op.weekKey,
                orderId: op.orderId,
                draftPatch: { status: op.value?.status || '' },
                session,
              });
            }
            currentRemoteDraft = applyOpToDraft(currentRemoteDraft, op);
          }
          remoteDrafts[orderId] = currentRemoteDraft;
        }
        const remainingPending = [];
        const workingDraftsByOrder = applyOpsToDrafts(remoteDrafts, remainingPending);
        // Write updated draft data back into the in-memory draft store.
        nextDraftStore = {
          ...nextDraftStore,
          scopes: {
            ...nextDraftStore.scopes,
            [scopeKey]: {
              ...nextDraftStore.scopes[scopeKey],
              remoteDraftsByOrder: remoteDrafts,
              workingDraftsByOrder,
              pendingOps: remainingPending,
              conflicts: filterResolvedConflicts(resolvedConflicts),
            },
          },
        };
        if (scopeKey === currentScopeKey) {
          setRemoteDraftsByOrder(remoteDrafts);
          setLocalDraftsByOrder(workingDraftsByOrder);
          setPendingOps(remainingPending);
          const activeConflicts = filterResolvedConflicts(resolvedConflicts);
          setSyncConflicts(activeConflicts);
          currentScopeConflicts = activeConflicts;
          currentScopePending = remainingPending.length;
        }
      }
      writeDraftStore(nextDraftStore);
      if (!quiet && pendingOps.length > 0 && currentScopeConflicts.length === 0) {
        showToast(tRef.current.syncDone);
      }
      return { pending: currentScopePending, conflicts: currentScopeConflicts.length };
    } finally {
      setSyncingOffline(false);
    }
  }, [currentScopeKey, isOnline, pendingOps.length, session, showToast, syncConflicts.length, syncingOffline]);

  useEffect(() => {
    if (!isOnline || pendingOps.length === 0) return undefined;
    const timer = setTimeout(() => {
      if (applyingOpsOnlineRef.current || syncingOffline) return;
      syncOfflineOpsNow({ quiet: true }).catch(console.error);
    }, 600);
    return () => clearTimeout(timer);
  }, [isOnline, pendingOps.length, syncOfflineOpsNow, syncingOffline]);

  useEffect(() => {
    if (!selectedWeek) return () => {};
    if (!isOnline) {
      const cachedScope = getOfflineScope(readOfflineStore(), currentScopeKey);
      if (!cachedScope) {
        setClaimsByOrder({});
        setPresence([]);
        if (!preserveCurrentScreenOffline(tRef.current.offlineLoaded)) {
          setOrders([]);
          setProductDetails({});
          productDetailsRef.current = {};
          setPermanentNumbersMap({});
          setRemoteDraftsByOrder({});
          setLocalDraftsByOrder({});
          setPendingOps([]);
          setSyncConflicts([]);
          setError(tRef.current.offlineNoCache);
        }
        setLoading(false);
        return () => {};
      }
      applyCachedScopeToScreen(cachedScope);
      return () => {};
    }
    setLoading(true);
    setError(null);
    const unsubscribe = subscribeDelayedOrdersForWeekV7({
      weekKey: selectedWeek,
      communities: Array.from(selectedCommunities),
      startDate: selectedSpecificStartDate,
      endDate: selectedSpecificEndDate,
      onOrders: async ({ allOrders }) => {
        try {
          const dateFilteredOrders = filterOrdersByDeliveryDates(
            allOrders,
            selectedSpecificStartDate,
            selectedSpecificEndDate,
          );
          const productIdSet = new Set();
          const customersList = [];
          dateFilteredOrders.forEach((order) => {
            (order.items || []).forEach((it) => {
              if (it?.productId) productIdSet.add(it.productId);
            });
            const cid = order?.customerDetails?.phone || order?.customerDetails?.email || null;
            if (cid) customersList.push({ id: cid, name: order?.customerDetails?.name || '' });
          });
          const missingProductIds = Array.from(productIdSet).filter((id) => !productDetailsRef.current[id]);
          const [newPd, nums] = await Promise.all([
            missingProductIds.length > 0
              ? fetchProductDetailsV7(missingProductIds).catch((error) => {
                if (!isLikelyNetworkError(error)) throw error;
                return {};
              })
              : {},
            fetchPermanentCustomerNumbers(customersList),
          ]);
          const mergedProductDetails = Object.keys(newPd).length > 0
            ? { ...productDetailsRef.current, ...newPd }
            : productDetailsRef.current;
          if (Object.keys(newPd).length > 0) {
            productDetailsRef.current = mergedProductDetails;
            setProductDetails(mergedProductDetails);
          }
          setPermanentNumbersMap(nums);
          setOrders(dateFilteredOrders);
          // Persist static data once — does not touch draft store.
          writeStaticScopeData(currentScopeKey, {
            meta: {
              weekKey: selectedWeek,
              communities: Array.from(selectedCommunities),
              startDate: selectedSpecificStartDate,
              endDate: selectedSpecificEndDate,
            },
            orders: dateFilteredOrders,
            productDetails: mergedProductDetails,
            permanentNumbersMap: nums,
            cachedAtIso: nowIso(),
          });
          // Preload images in the background — do not block rendering.
          prefetchProductImages(mergedProductDetails).catch(() => {});
          setError(null);
          setCommunityFilter('__all__');
          setSelectedOrderId((prev) => {
            if (prev && dateFilteredOrders.some((o) => o.id === prev)) return prev;
            const firstPending = dateFilteredOrders.find((o) => o.status !== 'completed');
            return firstPending ? firstPending.id : (dateFilteredOrders[0]?.id || null);
          });
        } catch (e) {
          console.error(e);
          if (isLikelyNetworkError(e)) {
            const browserOffline = isBrowserOffline();
            if (browserOffline) setIsOnline(false);
            const cachedScope = getOfflineScope(readOfflineStore(), currentScopeKey);
            if (cachedScope) {
              applyCachedScopeToScreen(cachedScope, { toast: browserOffline });
            } else if (!preserveCurrentScreenOffline(browserOffline ? tRef.current.offlineLoaded : '')) {
              setError(tRef.current.offlineNoCache);
            }
          } else {
            setError(tRef.current.failOrders);
          }
        } finally {
          setLoading(false);
        }
      },
      onError: (e) => {
        console.error(e);
        if (isLikelyNetworkError(e)) {
          const browserOffline = isBrowserOffline();
          if (browserOffline) setIsOnline(false);
          const cachedScope = getOfflineScope(readOfflineStore(), currentScopeKey);
          if (cachedScope) {
            applyCachedScopeToScreen(cachedScope, { toast: browserOffline });
          } else if (!preserveCurrentScreenOffline(browserOffline ? tRef.current.offlineLoaded : '')) {
            setError(tRef.current.offlineNoCache);
          }
        } else {
          setError(tRef.current.failOrders);
        }
        setLoading(false);
      },
    });
    return unsubscribe;
  }, [
    selectedWeek,
    selectedCommunities,
    selectedSpecificStartDate,
    selectedSpecificEndDate,
    applyCachedScopeToScreen,
    fetchPermanentCustomerNumbers,
    currentScopeKey,
    isLikelyNetworkError,
    isOnline,
    preserveCurrentScreenOffline,
  ]);

  useEffect(() => {
    if (!selectedWeek || !isOnline) return () => {};
    const unsubPresence = subscribePresenceV7({ weekKey: selectedWeek, onData: setPresence, onError: console.error });
    const unsubClaims = subscribeClaimsV7({ weekKey: selectedWeek, onData: setClaimsByOrder, onError: console.error });
    const unsubDrafts = subscribeDraftsV7({
      weekKey: selectedWeek,
      onData: (nextDrafts) => {
        setRemoteDraftsByOrder(nextDrafts);
        setLocalDraftsByOrder((prev) => {
          const localPending = pendingOpsRef.current || [];
          const overlay = applyOpsToDrafts(nextDrafts, localPending);
          return Object.keys(prev || {}).length > 0 && localPending.length === 0 ? nextDrafts : overlay;
        });
      },
      onError: console.error,
    });
    return () => {
      unsubPresence();
      unsubClaims();
      unsubDrafts();
    };
  }, [selectedWeek, isOnline]);

  useEffect(() => {
    if (!selectedWeek || !session.sessionId || !isOnline) return () => {};
    const tick = async () => {
      try {
        await upsertPresenceV7({ weekKey: selectedWeek, session, selectedOrderId: selectedOrderId || '' });
      } catch (e) {
        console.error(e);
      }
    };
    tick();
    const id = setInterval(tick, 15000);
    return () => {
      clearInterval(id);
      clearPresenceV7({ weekKey: selectedWeek, session }).catch(() => {});
    };
  }, [selectedWeek, selectedOrderId, session, isOnline]);

  useEffect(() => {
    if (!selectedWeek || !selectedOrderId || !session.sessionId || !isOnline) return;
    let cancelled = false;
    (async () => {
      try {
        await claimOrderV7({ weekKey: selectedWeek, orderId: selectedOrderId, session });
      } catch (e) {
        if (!cancelled && e?.code !== 'already-claimed') console.error(e);
      }
    })();
    return () => {
      cancelled = true;
      releaseOrderClaimV7({ weekKey: selectedWeek, orderId: selectedOrderId, session }).catch(() => {});
    };
  }, [selectedWeek, selectedOrderId, session, isOnline]);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      setSearchingProducts(false);
      return undefined;
    }
    let active = true;
    setSearchingProducts(true);
    const id = setTimeout(() => {
      searchProductsV7({ term: searchTerm.trim(), limit: 12 })
        .then((rows) => { if (active) setSearchResults(rows); })
        .catch((e) => { console.error(e); if (active) setSearchResults([]); })
        .finally(() => { if (active) setSearchingProducts(false); });
    }, 250);
    return () => {
      active = false;
      clearTimeout(id);
    };
  }, [searchTerm]);
  useEffect(() => () => {
    imageMemoryCacheRef.current = {};
  }, []);

  const selectedOrder = useMemo(() => orders.find((o) => o.id === selectedOrderId) || null, [orders, selectedOrderId]);
  const effectiveDraftsByOrder = useMemo(
    () => localDraftsByOrder || remoteDraftsByOrder || {},
    [localDraftsByOrder, remoteDraftsByOrder]
  );
  const selectedOrderSaved = useMemo(() => (
    selectedWeek && selectedOrderId
      ? sanitizeDraftForItems(
        mergeOrderDraftWithPersistedCompletion(selectedOrder, effectiveDraftsByOrder[selectedOrderId] || {}),
        selectedOrder?.items || [],
      )
      : {}
  ), [effectiveDraftsByOrder, selectedOrder?.items, selectedWeek, selectedOrderId]);
  const weightsByLineId = selectedOrderSaved.weightsByLineId || {};
  const removedLineIds = selectedOrderSaved.removedLineIds || {};
  const selectedClaim = selectedOrderId ? claimsByOrder[selectedOrderId] : null;
  const claimedByOther = isOnline && !!(selectedClaim && selectedClaim.sessionId !== session.sessionId && !isClaimStaleV7(selectedClaim));

  const items = useMemo(() => {
    const base = selectedOrder?.items || [];
    const merged = mergeProductDetailsIntoItems(base, productDetails);
    return [...merged].sort((a, b) => {
      const nameA = (a.productName || a.name || '').toLowerCase();
      const nameB = (b.productName || b.name || '').toLowerCase();
      if (nameA !== nameB) return nameA.localeCompare(nameB);
      return (a.lineId || '').localeCompare(b.lineId || '');
    });
  }, [selectedOrder, productDetails]);

  const activeItems = useMemo(() => items.filter((it) => !removedLineIds[it.lineId]), [items, removedLineIds]);
  const nextIdx = useMemo(() => getNextUnweighedIndex(items, weightsByLineId, removedLineIds, 0), [items, weightsByLineId, removedLineIds]);
  const canComplete = activeItems.length > 0 && nextIdx === -1;
  const selectedOrderStatus = getEffectiveOrderStatus(selectedOrder, selectedOrderSaved);
  const selectedOrderCompleted = selectedOrderStatus === 'completed';
  const completeDisabled = !isOnline || syncingOffline || !canComplete || selectedOrderCompleted || claimedByOther;
  const selectedOrderConflicts = useMemo(() => (
    selectedOrder ? syncConflicts.filter((conflict) => conflict.orderId === selectedOrder.id) : []
  ), [selectedOrder, syncConflicts]);

  const persistConflictResolution = useCallback((nextConflicts, orderId, alignedDraft) => {
    const nextRemote = { ...remoteDraftsByOrder, [orderId]: alignedDraft };
    const nextLocal = { ...localDraftsByOrder, [orderId]: alignedDraft };
    setSyncConflicts(nextConflicts);
    setRemoteDraftsByOrder(nextRemote);
    setLocalDraftsByOrder(nextLocal);
    if (currentScopeKey) {
      writeDraftScopeData(currentScopeKey, {
        remoteDraftsByOrder: nextRemote,
        workingDraftsByOrder: nextLocal,
        pendingOps,
        conflicts: nextConflicts,
      });
    }
  }, [currentScopeKey, localDraftsByOrder, pendingOps, remoteDraftsByOrder]);

  const resolveConflictAcceptCloud = useCallback(async (conflict) => {
    if (!conflict?.orderId) return;
    const baseDraft = remoteDraftsByOrder[conflict.orderId]
      || localDraftsByOrder[conflict.orderId]
      || {};
    const alignedDraft = applyCloudSnapshotToDraft(baseDraft, conflict);
    const nextConflicts = syncConflicts.filter((entry) => entry.id !== conflict.id);
    persistConflictResolution(nextConflicts, conflict.orderId, alignedDraft);
    showToast(tRef.current.syncDone);
  }, [localDraftsByOrder, persistConflictResolution, remoteDraftsByOrder, showToast, syncConflicts]);

  const resolveConflictKeepLocal = useCallback(async (conflict) => {
    if (!conflict?.orderId || !selectedWeek) return;
    if (!isOnline) {
      showToast(tRef.current.offlineEditOnlineOnly);
      return;
    }
    try {
      if (conflict.type === 'setWeight') {
        await setDraftLineWeightV7({
          weekKey: selectedWeek,
          orderId: conflict.orderId,
          lineId: conflict.lineId,
          actualQuantity: conflict.localValue?.actualQuantity,
          source: conflict.localValue?.source,
          status: conflict.localValue?.status,
          session,
        });
      } else if (conflict.type === 'clearWeight') {
        await clearDraftLineWeightV7({
          weekKey: selectedWeek,
          orderId: conflict.orderId,
          lineId: conflict.lineId,
          status: conflict.localValue?.status,
          session,
        });
      } else if (conflict.type === 'removeLine' || conflict.type === 'restoreLine') {
        await setDraftLineRemovedV7({
          weekKey: selectedWeek,
          orderId: conflict.orderId,
          lineId: conflict.lineId,
          removed: conflict.type === 'removeLine',
          session,
        });
      } else if (conflict.type === 'setStatus') {
        await saveOrderDraftV7({
          weekKey: selectedWeek,
          orderId: conflict.orderId,
          draftPatch: { status: conflict.localValue?.status || '' },
          session,
        });
      }
      const alignedDraft = applyOpToDraft(remoteDraftsByOrder[conflict.orderId] || {}, {
        type: conflict.type,
        orderId: conflict.orderId,
        lineId: conflict.lineId,
        value: conflict.localValue,
      });
      const nextConflicts = syncConflicts.filter((entry) => entry.id !== conflict.id);
      persistConflictResolution(nextConflicts, conflict.orderId, alignedDraft);
      showToast(tRef.current.syncDone);
    } catch (error) {
      console.error('Failed to resolve conflict with local value:', error);
      showToast(tRef.current.syncBlockedByPending);
    }
  }, [
    isOnline,
    localDraftsByOrder,
    persistConflictResolution,
    remoteDraftsByOrder,
    selectedWeek,
    session,
    showToast,
    syncConflicts,
  ]);

  const orderCommunities = useMemo(() => {
    const set = new Set();
    orders.forEach((o) => {
      const c = o?.customerDetails?.pickupSpot || o?.pickupSpot;
      if (c) set.add(c);
    });
    const all = Array.from(set);
    const orderMap = {};
    communityOrder.forEach((c, i) => { orderMap[c] = i; });
    all.sort((a, b) => {
      const ia = orderMap[a] ?? 9999;
      const ib = orderMap[b] ?? 9999;
      if (ia !== ib) return ia - ib;
      return a.localeCompare(b);
    });
    return all;
  }, [orders, communityOrder]);

  const orderCountByCommunity = useMemo(() => {
    const counts = {};
    orders.forEach((o) => {
      const c = o?.customerDetails?.pickupSpot || o?.pickupSpot;
      if (c) counts[c] = (counts[c] || 0) + 1;
    });
    return counts;
  }, [orders]);

  const orderStatusCounts = useMemo(() => {
    let pending = 0;
    let done = 0;
    orders.forEach((o) => {
      if (getEffectiveOrderStatus(o, effectiveDraftsByOrder[o.id]) === 'completed') done += 1;
      else pending += 1;
    });
    return { pending, done };
  }, [orders, effectiveDraftsByOrder]);

  useEffect(() => {
    if (orderCommunities.length === 0) return;
    const saved = communityOrder.filter((c) => orderCommunities.includes(c));
    const newOnes = orderCommunities.filter((c) => !saved.includes(c));
    const merged = [...saved, ...newOnes];
    if (JSON.stringify(merged) !== JSON.stringify(communityOrder)) {
      setCommunityOrder(merged);
      saveCommunityOrder(COMMUNITY_ORDER_KEY, merged, currentScopeKey ? [currentScopeKey] : []);
    }
  }, [orderCommunities, communityOrder, currentScopeKey]);

  const moveCommunity = useCallback((community, direction) => {
    setCommunityOrder((prev) => {
      const arr = [...prev];
      const idx = arr.indexOf(community);
      if (idx < 0) return arr;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= arr.length) return arr;
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      saveCommunityOrder(COMMUNITY_ORDER_KEY, arr, currentScopeKey ? [currentScopeKey] : []);
      return arr;
    });
  }, [currentScopeKey]);

  const getEffectiveCommunityColor = useCallback((communityName) => {
    if (pendingCommunityColors[communityName]) return pendingCommunityColors[communityName];
    if (communityColorOverrides[communityName]) return communityColorOverrides[communityName];
    return getCommunityColor(communityName);
  }, [communityColorOverrides, pendingCommunityColors]);

  const acceptCommunityColor = useCallback((communityName) => {
    const color = pendingCommunityColors[communityName];
    if (!color) return;
    saveCommunityColorOverride(communityName, color);
    setCommunityColorOverrides((prev) => ({ ...prev, [communityName]: color }));
    setPendingCommunityColors((prev) => {
      const next = { ...prev };
      delete next[communityName];
      return next;
    });
    showToast(lang === 'th' ? 'สีถูกบันทึก' : 'צבע הקהילה נשמר');
  }, [lang, pendingCommunityColors, showToast]);

  const cancelCommunityColor = useCallback((communityName) => {
    setPendingCommunityColors((prev) => {
      const next = { ...prev };
      delete next[communityName];
      return next;
    });
  }, []);

  const computedCommunityOrderNumbers = useMemo(() => (
    computeCommunityOrderNumbers({
      orders,
      communities: orderCommunities,
      customerNumbersMap: permanentNumbersMap,
    })
  ), [orders, orderCommunities, permanentNumbersMap]);

  const toggleCommunityNumbering = useCallback(() => {
    setShowCommunityNumbering((prev) => {
      const next = !prev;
      saveShowCommunityNumbering(next);
      return next;
    });
  }, []);

  const filteredOrders = useMemo(() => {
    const rankMap = {};
    orderCommunities.forEach((c, i) => { rankMap[c] = i; });
    let list = communityFilter === '__all__'
      ? [...orders]
      : orders.filter((o) => (o?.customerDetails?.pickupSpot || o?.pickupSpot) === communityFilter);

    if (!showCompleted) {
      list = list.filter((o) => getEffectiveOrderStatus(o, effectiveDraftsByOrder[o.id]) !== 'completed');
    }

    list.sort((a, b) => {
      const ca = a?.customerDetails?.pickupSpot || a?.pickupSpot || '';
      const cb = b?.customerDetails?.pickupSpot || b?.pickupSpot || '';
      const ra = rankMap[ca] ?? 9999;
      const rb = rankMap[cb] ?? 9999;
      if (ra !== rb) return ra - rb;
      const aDone = getEffectiveOrderStatus(a, effectiveDraftsByOrder[a.id]) === 'completed' ? 1 : 0;
      const bDone = getEffectiveOrderStatus(b, effectiveDraftsByOrder[b.id]) === 'completed' ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      const aCid = a?.customerDetails?.phone || a?.customerDetails?.email || '';
      const bCid = b?.customerDetails?.phone || b?.customerDetails?.email || '';
      const aNum = Number(permanentNumbersMap[aCid]);
      const bNum = Number(permanentNumbersMap[bCid]);
      const aHasNum = Number.isFinite(aNum) && aNum > 0;
      const bHasNum = Number.isFinite(bNum) && bNum > 0;
      if (aHasNum && bHasNum && aNum !== bNum) return aNum - bNum;
      if (aHasNum !== bHasNum) return aHasNum ? -1 : 1;
      return (a.customerDetails?.name || '').localeCompare(b.customerDetails?.name || '');
    });
    return list;
  }, [orders, communityFilter, orderCommunities, showCompleted, permanentNumbersMap, effectiveDraftsByOrder]);

  const missingOrderItems = useMemo(() => {
    const map = {};
    const selectedMissingCommunities = missingModalOpen
      ? missingModalCommunities
      : new Set(orderCommunities);

    orders.forEach((order) => {
      const community = order?.customerDetails?.pickupSpot || order?.pickupSpot || 'לא צוין';
      if (!selectedMissingCommunities.has(community)) return;

      const mergedItems = mergeProductDetailsIntoItems(order.items || [], productDetails);
      const persistedDraft = mergeOrderDraftWithPersistedCompletion(order, effectiveDraftsByOrder[order.id] || {});
      if (!missingModalIncludeCompleted && getEffectiveOrderStatus(order, persistedDraft) === 'completed') return;

      const draft = sanitizeDraftForItems(persistedDraft, mergedItems);
      const weights = draft.weightsByLineId || {};
      const removed = draft.removedLineIds || {};

      mergedItems.forEach((item) => {
        const missingDetails = getMissingLineDetails(item, weights, removed);
        if (!missingDetails) return;
        const {
          measurementType,
          avg,
          unitSize,
          expected,
          actual,
          missing,
          unitQty,
          isFullyMissing,
        } = missingDetails;
        const key = [
          item.businessId || '',
          item.productId || item.productName || '',
          item.selectedOption || '',
          measurementType,
          unitSize,
          avg,
        ].join('::');

        if (!map[key]) {
          map[key] = {
            key,
            businessName: item.businessName || '',
            productName: item.productName || item.name || 'Item',
            selectedOption: normalizeSupplierOption(item.selectedOption),
            measurementType,
            rawQuantity: 0,
            unitQuantity: 0,
            expectedQuantity: 0,
            actualQuantity: 0,
            fullMissingCount: 0,
            partialMissingCount: 0,
            communities: new Set(),
            canUseKg: measurementType !== 'package',
            included: true,
            mode: 'unit',
            quantity: 0,
          };
        }
        map[key].rawQuantity += missing;
        map[key].unitQuantity += unitQty;
        map[key].expectedQuantity += expected;
        map[key].actualQuantity += actual;
        map[key].communities.add(community);
        if (isFullyMissing) {
          map[key].fullMissingCount += 1;
        } else {
          map[key].partialMissingCount += 1;
        }
      });
    });

    return Object.values(map)
      .map((item) => ({
        ...item,
        rawQuantity: Math.round(item.rawQuantity * 10) / 10,
        unitQuantity: Math.round(item.unitQuantity * 1000) / 1000,
        expectedQuantity: Math.round(item.expectedQuantity * 10) / 10,
        actualQuantity: Math.round(item.actualQuantity * 10) / 10,
        communities: Array.from(item.communities).sort(),
        hasPartialMissing: item.partialMissingCount > 0,
        hasFullMissing: item.fullMissingCount > 0,
        quantity: Math.max(1, Math.round(item.unitQuantity)),
      }))
      .sort((a, b) => {
        const businessCompare = (a.businessName || '').localeCompare(b.businessName || '');
        if (businessCompare !== 0) return businessCompare;
        return (a.productName || '').localeCompare(b.productName || '');
      });
  }, [orders, productDetails, effectiveDraftsByOrder, missingModalCommunities, missingModalIncludeCompleted, missingModalOpen, orderCommunities]);

  const missingOrdersByCustomer = useMemo(() => {
    const selectedMissingCommunities = missingModalOpen
      ? missingModalCommunities
      : new Set(orderCommunities);

    return orders
      .map((order) => {
        const community = order?.customerDetails?.pickupSpot || order?.pickupSpot || 'לא צוין';
        if (!selectedMissingCommunities.has(community)) return null;

        const mergedItems = mergeProductDetailsIntoItems(order.items || [], productDetails);
        const persistedDraft = mergeOrderDraftWithPersistedCompletion(order, effectiveDraftsByOrder[order.id] || {});
        if (!missingModalIncludeCompleted && getEffectiveOrderStatus(order, persistedDraft) === 'completed') return null;

        const draft = sanitizeDraftForItems(persistedDraft, mergedItems);
        const weights = draft.weightsByLineId || {};
        const removed = draft.removedLineIds || {};
        const missingLines = mergedItems
          .map((item) => {
            const missingDetails = getMissingLineDetails(item, weights, removed);
            if (!missingDetails) return null;
            return {
              key: item.lineId,
              productName: item.productName || item.name || 'Item',
              selectedOption: normalizeSupplierOption(item.selectedOption),
              businessName: item.businessName || '',
              measurementType: missingDetails.measurementType,
              missingQuantity: Math.round(missingDetails.missing * 10) / 10,
              unitQuantity: Math.round(missingDetails.unitQty * 1000) / 1000,
              expectedQuantity: Math.round(missingDetails.expected * 10) / 10,
              actualQuantity: Math.round(missingDetails.actual * 10) / 10,
              isFullyMissing: missingDetails.isFullyMissing,
              isPartialUnderHalf: missingDetails.isPartialUnderHalf,
            };
          })
          .filter(Boolean)
          .sort((a, b) => {
            const businessCompare = (a.businessName || '').localeCompare(b.businessName || '');
            if (businessCompare !== 0) return businessCompare;
            return (a.productName || '').localeCompare(b.productName || '');
          });

        if (missingLines.length === 0) return null;

        const customerId = order?.customerDetails?.phone || order?.customerDetails?.email || '';
        const customerNumber = permanentNumbersMap[customerId];
        return {
          id: order.id,
          orderLabel: order.id ? String(order.id).slice(0, 8) : '',
          customerName: order?.customerDetails?.name || 'לקוח לא ידוע',
          customerPhone: order?.customerDetails?.phone || '',
          customerNumber: customerNumber || '',
          community,
          missingLines,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const aNum = Number(a.customerNumber);
        const bNum = Number(b.customerNumber);
        const aHasNum = Number.isFinite(aNum) && aNum > 0;
        const bHasNum = Number.isFinite(bNum) && bNum > 0;
        if (aHasNum && bHasNum && aNum !== bNum) return aNum - bNum;
        if (aHasNum !== bHasNum) return aHasNum ? -1 : 1;
        return (a.customerName || '').localeCompare(b.customerName || '');
      });
  }, [orders, productDetails, effectiveDraftsByOrder, missingModalCommunities, missingModalIncludeCompleted, missingModalOpen, orderCommunities, permanentNumbersMap]);

  useEffect(() => {
    if (!selectedOrderId) {
      setActiveItemIndex(-1);
      return;
    }
    const firstUnweighed = getNextUnweighedIndex(items, weightsByLineId, removedLineIds);
    const suggested = firstUnweighed >= 0 ? firstUnweighed : 0;
    setActiveItemIndex(suggested);
    autoWeighActiveRef.current = false;
    prevStableRef.current = 0;
  }, [selectedOrderId]);

  const totals = useMemo(() => {
    let requestedTotal = 0;
    let actualTotal = 0;
    let requestedSum = 0;
    let actualSum = 0;
    for (const it of items) {
      if (removedLineIds[it.lineId]) continue;
      const req = Number(it.requestedQuantity || 0);
      const price = Number(it.pricePerUnit || 0);
      const reqForPricing = getEstimatedChargeableQuantity({
        measurementType: it.measurementType || 'kg',
        quantity: req,
        averageWeightKg: it.averageWeightKg || 1,
      });
      requestedTotal += reqForPricing;
      requestedSum += getEstimatedLineTotal({
        measurementType: it.measurementType || 'kg',
        quantity: req,
        averageWeightKg: it.averageWeightKg || 1,
        price,
      });
      const actual = Number(weightsByLineId?.[it.lineId]?.actualQuantity || 0);
      actualTotal += actual;
      actualSum += actual * price;
    }
    return { requestedTotal, actualTotal, requestedSum, actualSum };
  }, [items, weightsByLineId, removedLineIds]);

  const saveDraftPatch = useCallback(async (patch) => {
    if (!selectedWeek || !selectedOrder) return;
    await applyQueuedOpsOnline({
      ops: [{
        orderId: selectedOrder.id,
        type: 'setStatus',
        value: { status: patch.status || '' },
      }],
      remoteWrite: async () => {
        await saveOrderDraftV7({
          weekKey: selectedWeek,
          orderId: selectedOrder.id,
          draftPatch: patch,
          session,
        });
      },
    });
  }, [applyQueuedOpsOnline, selectedOrder, selectedWeek, session]);

  const selectItemForWeighing = useCallback(async (idx) => {
    if (idx < 0 || idx >= items.length || claimedByOther) return;
    const it = items[idx];
    if (!it || removedLineIds[it.lineId]) return;
    if (idx !== activeItemIndex) {
      setEditingLineId(null);
      setEditValue('');
      setEditingPriceLineId(null);
      setEditPriceValue('');
    }
    setActiveItemIndex(idx);

    if (!weightsByLineId[it.lineId]?.actualQuantity && it.measurementType !== 'package') {
      autoWeighActiveRef.current = true;
      if (idx !== activeItemIndex) prevStableRef.current = 0;
    } else {
      autoWeighActiveRef.current = false;
    }

    if (selectedOrder && getEffectiveOrderStatus(selectedOrder, selectedOrderSaved) !== 'completed') {
      await saveDraftPatch({ status: 'in_progress' });
    }
  }, [items, claimedByOther, removedLineIds, activeItemIndex, weightsByLineId, selectedOrder, selectedOrderSaved, saveDraftPatch]);

  const saveWeightAndAdvance = useCallback(async (weightValue, src = 'scale') => {
    if (!selectedOrder || activeItemIndex < 0 || claimedByOther) return;
    const it = items[activeItemIndex];
    if (!it?.lineId) return;
    const rounded = Math.round(weightValue * 1000) / 1000;
    const predictedWeights = { ...(weightsByLineId || {}), [it.lineId]: { actualQuantity: rounded, source: src } };
    const newStatus = getNextUnweighedIndex(items, predictedWeights, removedLineIds) === -1 ? 'weighed' : 'in_progress';
    await applyQueuedOpsOnline({
      ops: [{
        orderId: selectedOrder.id,
        lineId: it.lineId,
        type: 'setWeight',
        value: { actualQuantity: rounded, source: src, status: newStatus },
      }],
      remoteWrite: async () => {
        await setDraftLineWeightV7({
          weekKey: selectedWeek,
          orderId: selectedOrder.id,
          lineId: it.lineId,
          actualQuantity: rounded,
          source: src,
          status: newStatus,
          session,
        });
      },
      successToast: t.autoSaved(rounded.toFixed(3)),
    });
    autoWeighActiveRef.current = false;
    const nextSequential = Math.min(activeItemIndex + 1, Math.max(0, items.length - 1));
    setActiveItemIndex(nextSequential);
  }, [activeItemIndex, applyQueuedOpsOnline, claimedByOther, items, removedLineIds, selectedOrder, selectedWeek, session, t, weightsByLineId]);

  useEffect(() => {
    if (!scaleConnected || !autoWeighActiveRef.current || claimedByOther) return;
    const stableVal = lastStableWeight?.value ?? 0;
    if (stableVal > WEIGHT_ON_THRESHOLD) {
      prevStableRef.current = stableVal;
    }
  }, [lastStableWeight, scaleConnected, claimedByOther]);

  const saveManualWeight = useCallback(async (lineId, value, src = 'manual') => {
    if (!selectedOrder || !lineId || claimedByOther) return;
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return;

    const it = items.find((i) => i.lineId === lineId);
    const isPackage = it?.measurementType === 'package';
    const actual = isPackage ? Math.floor(n) : Math.round(n * 1000) / 1000;
    const requestedQty = Number(it?.requestedQuantity || 0);
    const expectedQtyForCompare = getEstimatedChargeableQuantity({
      measurementType: it?.measurementType || 'kg',
      quantity: requestedQty,
      averageWeightKg: it?.averageWeightKg || 1,
    });
    if (expectedQtyForCompare > 0) {
      const diffRatio = Math.abs(actual - expectedQtyForCompare) / expectedQtyForCompare;
      if (diffRatio >= 0.2) {
        const pct = Math.round(diffRatio * 100);
        const ok = await biConfirm({
          heText: TR.he.largeDiffWarn(
            formatOrderedExpectation(it, expectedQtyForCompare, TR.he),
            formatOrderedExpectation(it, actual, TR.he),
            pct,
          ),
          thText: TR.th.largeDiffWarn(
            formatOrderedExpectation(it, expectedQtyForCompare, TR.th),
            formatOrderedExpectation(it, actual, TR.th),
            pct,
          ),
          title: 'warning',
        });
        if (!ok) return;
      }
    }

    const predictedWeights = { ...(weightsByLineId || {}), [lineId]: { actualQuantity: actual, source: src } };
    const newStatus = getNextUnweighedIndex(items, predictedWeights, removedLineIds) === -1 ? 'weighed' : 'in_progress';
    setSavingActionKey(`weight:${lineId}`);
    try {
      await applyQueuedOpsOnline({
        ops: [{
          orderId: selectedOrder.id,
          lineId,
          type: 'setWeight',
          value: { actualQuantity: actual, source: src, status: newStatus },
        }],
        remoteWrite: async () => {
          await setDraftLineWeightV7({
            weekKey: selectedWeek,
            orderId: selectedOrder.id,
            lineId,
            actualQuantity: actual,
            source: src,
            status: newStatus,
            session,
          });
        },
        successToast: t.autoSaved(actual.toFixed ? actual.toFixed(3) : String(actual)),
      });
      setEditingLineId(null);
      setEditValue('');
      autoWeighActiveRef.current = false;
      const savedIdx = items.findIndex((i) => i.lineId === lineId);
      if (savedIdx >= 0) {
        setActiveItemIndex(Math.min(savedIdx + 1, Math.max(0, items.length - 1)));
      }
    } finally {
      setSavingActionKey('');
    }
  }, [applyQueuedOpsOnline, biConfirm, claimedByOther, items, removedLineIds, selectedOrder, selectedWeek, session, t, weightsByLineId]);

  const startEdit = (lineId, currentValue) => {
    setEditingLineId(lineId);
    setEditValue(currentValue != null ? String(currentValue) : '');
  };

  const cancelEdit = () => {
    setEditingLineId(null);
    setEditValue('');
  };

  const startPriceEdit = (lineId, currentValue) => {
    setEditingPriceLineId(lineId);
    setEditPriceValue(currentValue != null ? String(currentValue) : '');
  };

  const cancelPriceEdit = () => {
    setEditingPriceLineId(null);
    setEditPriceValue('');
  };

  const useOrderedQuantities = async () => {
    if (!selectedOrder || !items.length || claimedByOther) return;
    const ok = await biConfirm({
      heText: 'למלא הכל לפי הכמות שהוזמנה? ידרוס שקילות קיימות.',
      thText: 'ใช้จำนวนที่สั่งทั้งหมด? จะแทนที่ค่าที่ชั่ง',
      title: 'warning',
    });
    if (!ok) return;
    const nextWeights = {};
    for (const it of items) {
      if (!it?.lineId) continue;
      const requestedQty = Number(it.requestedQuantity || 0);
      const requestedForWeight = getEstimatedChargeableQuantity({
        measurementType: it.measurementType || 'kg',
        quantity: requestedQty,
        averageWeightKg: it.averageWeightKg || 1,
      });
      nextWeights[it.lineId] = { actualQuantity: requestedForWeight, source: 'ordered_default' };
    }
    const queuedOps = Object.entries(nextWeights).map(([lineId, value]) => ({
      orderId: selectedOrder.id,
      lineId,
      type: 'setWeight',
      value: { ...value, status: 'weighed' },
    }));
    await applyQueuedOpsOnline({
      ops: queuedOps,
      remoteWrite: async () => {
        await bulkSetDraftWeightsV7({
          weekKey: selectedWeek,
          orderId: selectedOrder.id,
          weightsByLineId: nextWeights,
          status: 'weighed',
          session,
        });
      },
    });
  };

  const removeItem = async (lineId) => {
    if (!selectedOrder || !lineId || claimedByOther) return;
    await applyQueuedOpsOnline({
      ops: [{
        orderId: selectedOrder.id,
        lineId,
        type: 'removeLine',
        value: { removed: true },
      }],
      remoteWrite: async () => {
        await setDraftLineRemovedV7({
          weekKey: selectedWeek,
          orderId: selectedOrder.id,
          lineId,
          removed: true,
          session,
        });
      },
    });
  };

  const restoreItem = async (lineId) => {
    if (!selectedOrder || !lineId || claimedByOther) return;
    await applyQueuedOpsOnline({
      ops: [{
        orderId: selectedOrder.id,
        lineId,
        type: 'restoreLine',
        value: { removed: false },
      }],
      remoteWrite: async () => {
        await setDraftLineRemovedV7({
          weekKey: selectedWeek,
          orderId: selectedOrder.id,
          lineId,
          removed: false,
          session,
        });
      },
    });
  };

  const resetItem = useCallback(async (lineId) => {
    if (!selectedOrder || !lineId || claimedByOther) return;
    const predictedWeights = { ...(weightsByLineId || {}) };
    predictedWeights[lineId] = { actualQuantity: null, source: 'manual' };
    const hasAnyWeight = Object.keys(predictedWeights).some((k) => predictedWeights[k]?.actualQuantity);
    const newStatus = getNextUnweighedIndex(items, predictedWeights, removedLineIds) === -1 && hasAnyWeight
      ? 'weighed'
      : 'in_progress';
    await applyQueuedOpsOnline({
      ops: [{
        orderId: selectedOrder.id,
        lineId,
        type: 'clearWeight',
        value: { status: newStatus, source: 'manual' },
      }],
      remoteWrite: async () => {
        await clearDraftLineWeightV7({
          weekKey: selectedWeek,
          orderId: selectedOrder.id,
          lineId,
          status: newStatus,
          session,
        });
      },
    });
    const it = items.find((i) => i.lineId === lineId);
    if (it && it.measurementType !== 'package') {
      autoWeighActiveRef.current = true;
      prevStableRef.current = 0;
    }
  }, [applyQueuedOpsOnline, claimedByOther, weightsByLineId, items, removedLineIds, selectedOrder, selectedWeek, session]);

  const claimSelectedOrder = useCallback(async () => {
    if (!selectedOrder || !selectedWeek) return;
    if (!isOnline) {
      await biAlert({ heText: TR.he.offlineClaimDisabled, thText: TR.th.offlineClaimDisabled, title: 'warning' });
      return;
    }
    setSavingActionKey(`claim:${selectedOrder.id}`);
    try {
      await claimOrderV7({ weekKey: selectedWeek, orderId: selectedOrder.id, session, force: true });
      showToast(t.orderClaimedOk);
    } catch (e) {
      console.error(e);
      await biAlert({
        heText: e?.message || 'שגיאה בתפיסת ההזמנה',
        thText: e?.message || 'เกิดข้อผิดพลาดในการจองคำสั่งซื้อ',
        title: 'error',
      });
    } finally {
      setSavingActionKey('');
    }
  }, [selectedOrder, selectedWeek, session, showToast, t.orderClaimedOk, biAlert, isOnline]);

  const releaseSelectedOrder = useCallback(async () => {
    if (!selectedOrder || !selectedWeek) return;
    if (!isOnline) {
      await biAlert({ heText: TR.he.offlineClaimDisabled, thText: TR.th.offlineClaimDisabled, title: 'warning' });
      return;
    }
    setSavingActionKey(`release:${selectedOrder.id}`);
    try {
      await releaseOrderClaimV7({ weekKey: selectedWeek, orderId: selectedOrder.id, session });
      showToast(t.orderReleasedOk);
    } catch (e) {
      console.error(e);
    } finally {
      setSavingActionKey('');
    }
  }, [selectedOrder, selectedWeek, session, showToast, t.orderReleasedOk, biAlert, isOnline]);

  const savePriceEdit = useCallback(async (item) => {
    if (!selectedOrder || claimedByOther) return;
    if (!isOnline) {
      await biAlert({ heText: TR.he.offlineEditOnlineOnly, thText: TR.th.offlineEditOnlineOnly, title: 'warning' });
      return;
    }
    const nextPrice = Number(editPriceValue);
    if (!Number.isFinite(nextPrice) || nextPrice < 0) return;
    setSavingActionKey(`price:${item.lineId}`);
    try {
      await updateDelayedOrderLineV7({
        orderId: selectedOrder.id,
        lineId: item.lineId,
        changes: { price: nextPrice },
        session,
      });
      setEditingPriceLineId(null);
      setEditPriceValue('');
      showToast(t.priceUpdatedOk);
    } catch (e) {
      console.error(e);
      await biAlert({
        heText: e?.message || 'שגיאה בעדכון מחיר',
        thText: e?.message || 'เกิดข้อผิดพลาดในการอัปเดตราคา',
        title: 'error',
      });
    } finally {
      setSavingActionKey('');
    }
  }, [selectedOrder, claimedByOther, editPriceValue, session, showToast, t.priceUpdatedOk, biAlert, isOnline]);

  const addProductToOrder = useCallback(async (product) => {
    if (!selectedOrder || claimedByOther) return;
    if (!isOnline) {
      await biAlert({ heText: TR.he.offlineEditOnlineOnly, thText: TR.th.offlineEditOnlineOnly, title: 'warning' });
      return;
    }
    const fallbackQty = product.measurementType === 'kg' ? Number(product.unitSize || 1) : 1;
    const quantity = Number(addQuantities[product.id] || fallbackQty);
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    setSavingActionKey(`add:${product.id}`);
    try {
      await addItemToDelayedOrderV7({
        orderId: selectedOrder.id,
        product,
        quantity,
        session,
      });
      setSearchTerm('');
      setSearchResults([]);
      showToast(t.addItemOk);
    } catch (e) {
      console.error(e);
      await biAlert({
        heText: e?.message || 'שגיאה בהוספת מוצר',
        thText: e?.message || 'เกิดข้อผิดพลาดในการเพิ่มสินค้า',
        title: 'error',
      });
    } finally {
      setSavingActionKey('');
    }
  }, [selectedOrder, claimedByOther, addQuantities, session, showToast, t.addItemOk, biAlert, isOnline]);

  const deleteLine = useCallback(async (item) => {
    if (!selectedOrder || claimedByOther || !isAdmin) return;
    if (!isOnline) {
      await biAlert({ heText: TR.he.offlineEditOnlineOnly, thText: TR.th.offlineEditOnlineOnly, title: 'warning' });
      return;
    }
    const displayName = (lang === 'th' && item.thaiName) ? item.thaiName : item.productName;
    const ok = await biConfirm({
      heText: TR.he.deleteLineConfirm(displayName),
      thText: TR.th.deleteLineConfirm(displayName),
      title: 'warning',
      confirmButtonDelay: 2000,
    });
    if (!ok) return;
    setSavingActionKey(`delete:${item.lineId}`);
    try {
      await removeDelayedOrderLineV7({
        orderId: selectedOrder.id,
        lineId: item.lineId,
        session,
      });
    } catch (e) {
      console.error(e);
      await biAlert({
        heText: e?.message || 'שגיאה במחיקת שורה',
        thText: e?.message || 'เกิดข้อผิดพลาดในการลบบรรทัด',
        title: 'error',
      });
    } finally {
      setSavingActionKey('');
    }
  }, [selectedOrder, claimedByOther, session, biConfirm, biAlert, isOnline, isAdmin, lang]);

  const completeOrder = async () => {
    if (!selectedOrder) return;
    if (!isOnline) {
      await biAlert({ heText: TR.he.offlineChargeBlocked, thText: TR.th.offlineChargeBlocked, title: 'error' });
      return;
    }
    if (pendingOps.length > 0) {
      const syncResult = await syncOfflineOpsNow({ quiet: false });
      if (syncResult.pending > 0 || syncResult.conflicts > 0) {
        await biAlert({ heText: TR.he.syncBlockedByPending, thText: TR.th.syncBlockedByPending, title: 'warning' });
        return;
      }
    }
    if (selectedOrderConflicts.length > 0) {
      await biAlert({ heText: TR.he.syncBlockedByPending, thText: TR.th.syncBlockedByPending, title: 'warning' });
      return;
    }
    if (!canComplete) {
      await biAlert({ heText: 'יש פריטים שלא נשקלו עדיין.', thText: 'ยังมีรายการที่ยังไม่ชั่ง', title: 'warning' });
      return;
    }
    if (claimedByOther) {
      await biAlert({ heText: 'הזמנה זו פתוחה בתחנה אחרת.', thText: 'คำสั่งซื้อนี้เปิดอยู่ที่สถานีอื่น', title: 'warning' });
      return;
    }
    const ok = await biConfirm({
      heText: 'לסמן כהושלם ולחייב את הלקוח?',
      thText: 'ยืนยันเสร็จสิ้นและเรียกเก็บเงิน?',
      title: 'info',
    });
    if (!ok) return;

    setLoading(true);
    try {
      await saveOrderDraftV7({
        weekKey: selectedWeek,
        orderId: selectedOrder.id,
        draftPatch: { status: 'settling' },
        session,
      });
      const settlingDraft = {
        ...selectedOrderSaved,
        status: 'settling',
      };
      setRemoteDraftsByOrder((prev) => ({ ...prev, [selectedOrder.id]: settlingDraft }));
      setLocalDraftsByOrder((prev) => ({ ...prev, [selectedOrder.id]: settlingDraft }));
      const payload = buildSettlementPayload({
        selectedOrder,
        items,
        draft: settlingDraft,
      });
      await handleSuspendedPaymentV7(payload);
      const completedWeighing = {
        weightsByLineId: payload.weightsByLineId || {},
        removedLineIds: payload.removedLineIds || {},
        finalInvoiceLines: payload.finalInvoiceLines || [],
        finalSum: payload.finalSum,
        completedAtIso: nowIso(),
      };
      setOrders((prev) => prev.map((order) => (
        order.id === selectedOrder.id
          ? {
            ...order,
            status: 'completed',
            delayedMeta: {
              ...(order.delayedMeta || {}),
              paymentStatus: 'completed',
              delayedOrderStatus: 'completed',
            },
            rawData: {
              ...(order.rawData || {}),
              paymentStatus: 'completed',
              delayedOrderStatus: 'completed',
              weighing: {
                ...((order.rawData || {}).weighing || {}),
                ...completedWeighing,
              },
            },
          }
          : order
      )));
      await clearOrderDraftV7({ weekKey: selectedWeek, orderId: selectedOrder.id });
      setRemoteDraftsByOrder((prev) => {
        const next = { ...prev };
        delete next[selectedOrder.id];
        return next;
      });
      setLocalDraftsByOrder((prev) => {
        const next = { ...prev };
        delete next[selectedOrder.id];
        return next;
      });
      if (selectedClaim?.sessionId === session.sessionId) {
        await releaseOrderClaimV7({ weekKey: selectedWeek, orderId: selectedOrder.id, session });
      }
    } catch (e) {
      console.error(e);
      try {
        await saveOrderDraftV7({
          weekKey: selectedWeek,
          orderId: selectedOrder.id,
          draftPatch: { status: 'weighed' },
          session,
        });
        const weighedDraft = {
          ...selectedOrderSaved,
          status: 'weighed',
        };
        setRemoteDraftsByOrder((prev) => ({ ...prev, [selectedOrder.id]: weighedDraft }));
        setLocalDraftsByOrder((prev) => ({ ...prev, [selectedOrder.id]: weighedDraft }));
      } catch (draftErr) {
        console.error('Failed to revert draft status:', draftErr);
      }
      const isNetworkError = (typeof navigator !== 'undefined' && !navigator.onLine) || !e?.response;
      if (isNetworkError) {
        await biAlert({
          heText: 'לא ניתן לחייב כרגע — אין חיבור לאינטרנט.\nההזמנה נשארה במצב "נשקל" — נסה שוב כשהאינטרנט יחזור.',
          thText: 'ไม่สามารถเรียกเก็บเงินได้ — ไม่มีอินเทอร์เน็ต\nคำสั่งซื้อยังอยู่ในสถานะ "ชั่งแล้ว" — ลองอีกครั้งเมื่อมีเน็ต',
          title: 'error',
        });
      } else {
        await biAlert({
          heText: 'שגיאה בחיוב. ההזמנה נשארה במצב "נשקל" — אפשר לנסות שוב.',
          thText: 'เกิดข้อผิดพลาดในการเรียกเก็บเงิน — ลองอีกครั้ง',
          title: 'error',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleCommunity = (community) => {
    setTempSelectedCommunities((prev) => {
      const next = new Set(prev);
      if (next.has(community)) next.delete(community);
      else next.add(community);
      return next;
    });
  };

  const selectAllCommunities = () => setTempSelectedCommunities(new Set(pickupSpotsList));
  const clearAllCommunities = () => setTempSelectedCommunities(new Set());
  const applyDeliveryFilters = ({ weekKey, communitiesSet, startDate, endDate }) => {
    const communities = Array.from(communitiesSet);
    writeLastSetupV7({
      weekKey,
      communities,
      startDate,
      endDate,
    });

    setTempSelectedWeek(weekKey);
    setSelectedWeek(weekKey);
    setSelectedCommunities(new Set(communitiesSet));
    setTempSpecificStartDate(startDate);
    setTempSpecificEndDate(endDate);
    setSelectedSpecificStartDate(startDate);
    setSelectedSpecificEndDate(endDate);
  };

  const handleDeliveryTransferred = useCallback(({ newDeliveryDateKey }) => {
    setSelectedOrderId(null);
    if (!newDeliveryDateKey) return;
    applyDeliveryFilters({
      weekKey: getWeekKey(newDeliveryDateKey),
      communitiesSet: selectedCommunities,
      startDate: newDeliveryDateKey,
      endDate: newDeliveryDateKey,
    });
  }, [selectedCommunities]);

  const handleLoad = () => {
    applyDeliveryFilters({
      weekKey: tempSelectedWeek,
      communitiesSet: tempSelectedCommunities,
      startDate: tempSpecificStartDate,
      endDate: tempSpecificEndDate,
    });
  };

  const handleDeliveryDayChange = (dateKey) => {
    if (!dateKey) {
      setTempSpecificStartDate('');
      setTempSpecificEndDate('');
      return;
    }

    setTempSelectedWeek(getWeekKey(dateKey));
    setTempSpecificStartDate(dateKey);
    setTempSpecificEndDate(dateKey);
  };

  const statusBadge = (status) => {
    const s = status || 'pending';
    const map = {
      pending: { label: t.stPending, cls: 'bg-gray-100 text-gray-800 border-gray-300' },
      in_progress: { label: t.stInProgress, cls: 'bg-blue-100 text-blue-800 border-blue-300' },
      weighed: { label: t.stWeighed, cls: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
      settling: { label: t.stSettling, cls: 'bg-purple-100 text-purple-800 border-purple-300' },
      completed: { label: t.stCompleted, cls: 'bg-green-100 text-green-800 border-green-300' },
    };
    const m = map[s] || map.pending;
    return <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${m.cls}`}>{m.label}</span>;
  };

  const itemDisplayName = (it) => (lang === 'th' && it.thaiName) ? it.thaiName : it.productName;
  const itemSecondaryName = (it) => (lang === 'th' && it.thaiName) ? it.productName : it.thaiName;

  const openMissingOrderModal = () => {
    const initialCommunities = communityFilter !== '__all__' ? [communityFilter] : [];
    setMissingModalCommunities(new Set(initialCommunities));
    setMissingModalItems([]);
    setMissingModalOpen(true);
  };

  const closeMissingOrderModal = () => {
    setMissingModalOpen(false);
    setMissingModalItems([]);
  };

  const updateMissingItem = (idx, field, value) => {
    setMissingModalItems((prev) => {
      const next = [...prev];
      const item = { ...next[idx] };
      if (field === 'mode') {
        item.mode = value;
        item.quantity = value === 'kg'
          ? Number(item.rawQuantity.toFixed(1))
          : Math.max(1, Math.round(item.unitQuantity));
      } else if (field === 'quantity') {
        item.quantity = value === '' ? '' : Number(value);
      } else if (field === 'included') {
        item.included = value;
      }
      next[idx] = item;
      return next;
    });
  };

  const toggleMissingModalCommunity = (community) => {
    setMissingModalCommunities((prev) => {
      const next = new Set(prev);
      if (next.has(community)) next.delete(community);
      else next.add(community);
      return next;
    });
  };

  const selectAllMissingModalCommunities = () => {
    setMissingModalCommunities(new Set(orderCommunities));
  };

  const clearMissingModalCommunities = () => {
    setMissingModalCommunities(new Set());
  };

  useEffect(() => {
    if (!missingModalOpen) return;
    setMissingModalItems(missingOrderItems);
  }, [missingModalOpen, missingOrderItems]);

  const setAllMissingMode = (mode) => {
    setMissingModalItems((prev) => prev.map((item) => {
      if (mode === 'kg' && !item.canUseKg) return item;
      return {
        ...item,
        mode,
        quantity: mode === 'kg'
          ? Number(item.rawQuantity.toFixed(1))
          : Math.max(1, Math.round(item.unitQuantity)),
      };
    }));
  };

  const buildMissingOrderText = () => {
    const included = missingModalItems.filter((item) => item.included && (Number(item.quantity) || 0) > 0);
    const dateForHeader = getOrderCopyDate(selectedWeek, selectedSpecificEndDate || selectedSpecificStartDate);
    const parts = [`צהריים טובים, הזמנה ל${dateForHeader}:`, ''];
    const formatLine = (item) => {
      const isKgMode = item.mode === 'kg' && item.canUseKg;
      const optPart = item.selectedOption && !isKgMode ? ` *${item.selectedOption}*` : '';
      const qty = Number(item.quantity) || 0;
      const qtyDisplay = isKgMode ? qty.toFixed(1) : String(Math.round(qty));
      const suffix = isKgMode ? 'ק"ג' : "יח'";
      return `* ${item.productName}${optPart} – ${qtyDisplay} ${suffix}`;
    };
    const kgItems = included.filter((item) => item.mode === 'kg' && item.canUseKg);
    const unitItems = included.filter((item) => item.mode !== 'kg' || !item.canUseKg);

    if (kgItems.length > 0) {
      parts.push('הזמנה סיטונאית לא ארוז:');
      parts.push(...kgItems.map(formatLine));
    }
    if (kgItems.length > 0 && unitItems.length > 0) parts.push('');
    if (unitItems.length > 0) {
      parts.push('הזמנה ארוז:');
      parts.push(...unitItems.map(formatLine));
    }
    return parts.join('\n');
  };

  const handleCopyMissingOrder = async () => {
    try {
      const text = buildMissingOrderText();
      if (!text) return;
      await copyTextToClipboard(text);
      showToast('הזמנת החוסרים הועתקה');
      closeMissingOrderModal();
    } catch (e) {
      console.error('Failed to copy missing order text', e);
      showToast('שגיאה בהעתקת ההזמנה');
    }
  };

  if (loading && orders.length === 0) return <LoadingSpinner />;
  if (error && orders.length === 0) return <div className="p-8 text-center text-red-600 text-lg font-bold">{error}</div>;

  return (
    <div className={`min-h-screen bg-gray-100 ${isRTL ? 'text-right' : 'text-left'}`} dir={isRTL ? 'rtl' : 'ltr'}>
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-gray-900 text-white px-6 py-3 rounded-xl shadow-2xl text-sm font-bold animate-bounce">
          {toast}
        </div>
      )}

      <div className="bg-white border-b shadow-sm px-4 py-3">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-gray-900">{t.title}</h1>
            <p className="text-xs text-gray-500">{t.subtitle}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="px-3 py-2 bg-violet-100 text-violet-800 rounded-lg text-sm font-bold">
              {t.workersOnline}: {presence.length}
            </div>
            <div className="px-3 py-2 bg-sky-100 text-sky-800 rounded-lg text-sm font-bold">
              {stationId}
            </div>
            <div className={`px-3 py-2 rounded-lg text-sm font-bold ${
              isOnline ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
            }`}>
              {isOnline ? t.onlineReady : t.offlineReady}
            </div>
            {pendingOps.length > 0 && (
              <div className="px-3 py-2 bg-amber-100 text-amber-800 rounded-lg text-sm font-bold">
                {t.pendingSync(pendingOps.length)}
              </div>
            )}
            {syncConflicts.length > 0 && (
              <div className="px-3 py-2 bg-red-100 text-red-800 rounded-lg text-sm font-bold">
                {t.syncConflicts(syncConflicts.length)}
              </div>
            )}
            {syncingOffline && (
              <div className="px-3 py-2 bg-blue-100 text-blue-800 rounded-lg text-sm font-bold">
                {t.syncingNow}
              </div>
            )}
            <button
              onClick={toggleLang}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-sm transition-colors"
            >
              {t.switchLang}
            </button>
            <button
              onClick={() => setShowScalePanel(!showScalePanel)}
              className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${
                showScalePanel ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {showScalePanel ? t.hideScale : t.showScale}
            </button>
          </div>
        </div>
      </div>

      {showScalePanel && (
        <div className="bg-white border-b px-4 py-3">
          <div className="max-w-[1600px] mx-auto">
            <ScaleConnectionPanel className="max-w-md" />
          </div>
        </div>
      )}

      <div className="bg-white border-b px-4 py-4">
        <div className="max-w-[1600px] mx-auto">
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[200px]">
              <label className="block text-xs font-bold text-gray-600 mb-1">{t.week}</label>
              <select
                value={tempSelectedWeek}
                onChange={(e) => setTempSelectedWeek(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                {tempSelectedWeek && !availableWeeks.includes(tempSelectedWeek) && (
                  <option value={tempSelectedWeek}>{weekKeyToRangeLabel(tempSelectedWeek)}</option>
                )}
                {availableWeeks.map((wk) => (
                  <option key={wk} value={wk}>{weekKeyToRangeLabel(wk)}</option>
                ))}
              </select>
            </div>

            <div className="min-w-[200px]" ref={communityDropdownRef}>
              <label className="block text-xs font-bold text-gray-600 mb-1">{t.communities}</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowCommunityDropdown((o) => !o)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  {tempSelectedCommunities.size === 0 ? t.allCommunities : t.nSelected(tempSelectedCommunities.size)}
                </button>
                {showCommunityDropdown && (
                  <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl p-2 max-h-72 overflow-auto">
                    <div className="flex gap-2 mb-2 pb-2 border-b">
                      <button onClick={selectAllCommunities} className="text-xs px-2 py-1 bg-blue-500 text-white rounded">{t.selectAll}</button>
                      <button onClick={clearAllCommunities} className="text-xs px-2 py-1 bg-gray-300 text-gray-700 rounded">{t.clearSel}</button>
                    </div>
                    {pickupSpotsList.map((spot) => (
                      <label key={spot} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          checked={tempSelectedCommunities.has(spot)}
                          onChange={() => toggleCommunity(spot)}
                        />
                        {spot}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="min-w-[210px]">
              <label className="block text-xs font-bold text-gray-600 mb-1">{t.deliveryDay}</label>
              <select
                value={selectedDeliveryDayKey}
                onChange={(e) => handleDeliveryDayChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
              >
                <option value="">{t.allDeliveryDays}</option>
                {deliveryDayOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <div className="min-w-[170px]">
              <label className="block text-xs font-bold text-gray-600 mb-1">{t.fromDate}</label>
              <input
                type="date"
                value={tempSpecificStartDate}
                onChange={(e) => setTempSpecificStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div className="min-w-[170px]">
              <label className="block text-xs font-bold text-gray-600 mb-1">{t.toDate}</label>
              <input
                type="date"
                value={tempSpecificEndDate}
                onChange={(e) => setTempSpecificEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                handleDeliveryDayChange('');
              }}
              className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg text-sm border transition-colors"
            >
              {t.clearDates}
            </button>

            <button
              onClick={handleLoad}
              disabled={loading}
              className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-sm shadow transition-colors disabled:opacity-50"
            >
              {loading ? '...' : t.load}
            </button>

            <button
              type="button"
              onClick={openMissingOrderModal}
              disabled={missingOrderItems.length === 0}
              className="px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-lg text-sm shadow transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="הצג והעתק הזמנת חוסרים"
            >
              חוסרים להזמנה ({missingOrderItems.length})
            </button>
          </div>

          {selectedWeek && (
            <div className="mt-2 text-xs text-gray-500">
              {t.weekLabel} <span className="font-bold">{weekKeyToRangeLabel(selectedWeek)}</span>
              {selectedCommunities.size > 0 && (
                <> — {t.commLabel} <span className="font-bold">{Array.from(selectedCommunities).join(', ')}</span></>
              )}
              {(selectedSpecificStartDate || selectedSpecificEndDate) && (
                <> — <span className="font-bold">{selectedSpecificStartDate || selectedSpecificEndDate}</span> → <span className="font-bold">{selectedSpecificEndDate || selectedSpecificStartDate}</span></>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="lg:w-[340px] flex-shrink-0">
            <div className="bg-white rounded-xl shadow-sm overflow-hidden sticky top-4">
              <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
                <span className="font-bold text-gray-900">{t.orders}</span>
                <div className="flex items-center gap-2">
                  {(() => {
                    const { pending: pendingCount, done: doneCount } = orderStatusCounts;
                    return (
                      <>
                        <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">{pendingCount}</span>
                        {doneCount > 0 && (
                          <button
                            onClick={() => setShowCompleted((v) => !v)}
                            className={`text-xs font-bold px-2 py-0.5 rounded-full border transition-colors ${
                              showCompleted
                                ? 'bg-green-600 text-white border-green-600'
                                : 'bg-green-100 text-green-700 border-green-300 hover:bg-green-200'
                            }`}
                          >
                            {doneCount} &#10003;
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>

              {orderCommunities.length > 0 && (
                <div className="px-3 py-2 border-b">
                  <div className="flex flex-wrap gap-1 items-center mb-2">
                    <button
                      type="button"
                      onClick={toggleCommunityNumbering}
                      className={`px-3 py-1 rounded-full text-xs font-bold transition-colors border ${
                        showCommunityNumbering
                          ? 'bg-indigo-600 text-white border-indigo-700'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      מספר לפי קהילה {showCommunityNumbering ? 'פעיל' : 'כבוי'}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1 items-center">
                    <button
                      onClick={() => setCommunityFilter('__all__')}
                      className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                        communityFilter === '__all__' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      All ({orders.length})
                    </button>
                    {orderCommunities.map((c, ci) => {
                      const count = orderCountByCommunity[c] || 0;
                      const isFirst = ci === 0;
                      const isLast = ci === orderCommunities.length - 1;
                      return (
                        <div key={c} className="flex items-center gap-0.5">
                          {!isFirst && (
                            <button
                              onClick={(e) => { e.stopPropagation(); moveCommunity(c, -1); }}
                              className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors text-xs"
                            >
                              {isRTL ? '\u25B6' : '\u25C0'}
                            </button>
                          )}
                          <input
                            type="color"
                            value={getEffectiveCommunityColor(c)}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              e.stopPropagation();
                              setPendingCommunityColors((prev) => ({ ...prev, [c]: e.target.value }));
                            }}
                            className="w-5 h-5 rounded border border-gray-300 cursor-pointer shrink-0 p-0"
                            title={lang === 'th' ? 'เปลี่ยนสี' : 'שנה צבע קהילה'}
                          />
                          {pendingCommunityColors[c] && pendingCommunityColors[c] !== (communityColorOverrides[c] || getCommunityColor(c)) && (
                            <>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); acceptCommunityColor(c); }}
                                className="w-5 h-5 flex items-center justify-center text-[10px] font-black text-white bg-green-600 hover:bg-green-700 rounded"
                                title={lang === 'th' ? 'אשר צבע' : 'אשר צבע'}
                              >
                                ✓
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); cancelCommunityColor(c); }}
                                className="w-5 h-5 flex items-center justify-center text-[10px] font-black text-gray-600 bg-gray-100 hover:bg-gray-200 rounded"
                                title={lang === 'th' ? 'בטל' : 'בטל'}
                              >
                                ✕
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => setCommunityFilter(c)}
                            className={`px-3 py-1 rounded-full text-xs font-bold transition-colors border-r-[6px] ${
                              communityFilter === c ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                            style={{ borderRightColor: getEffectiveCommunityColor(c) }}
                          >
                            <span className="inline-block w-4 h-4 rounded-full mr-1" style={{ backgroundColor: getEffectiveCommunityColor(c) }} />
                            <span className="font-black mr-1 text-[10px] opacity-60">{ci + 1}.</span>{c} ({count})
                          </button>
                          {!isLast && (
                            <button
                              onClick={(e) => { e.stopPropagation(); moveCommunity(c, 1); }}
                              className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors text-xs"
                            >
                              {isRTL ? '\u25C0' : '\u25B6'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="divide-y max-h-[calc(100vh-280px)] overflow-y-auto">
                {filteredOrders.length === 0 && (
                  <div className="p-6 text-center text-gray-400 text-sm">{t.noOrders}</div>
                )}
                {filteredOrders.map((o) => {
                  const effectiveStatus = getEffectiveOrderStatus(o, effectiveDraftsByOrder[o.id]);
                  const isActive = o.id === selectedOrderId;
                  const cid = o?.customerDetails?.phone || o?.customerDetails?.email || null;
                  const custNum = cid && permanentNumbersMap[cid] ? permanentNumbersMap[cid] : '-';
                  const orderCommunity = o?.customerDetails?.pickupSpot || o?.pickupSpot || '';
                  const communityNum = showCommunityNumbering && orderCommunity
                    ? computedCommunityOrderNumbers[orderCommunity]?.[o.id]
                    : null;
                  const oItems = Array.isArray(o.items) ? o.items.length : 0;
                  const isDone = effectiveStatus === 'completed';
                  const claim = claimsByOrder[o.id];
                  const takenByOther = claim && claim.sessionId !== session.sessionId && !isClaimStaleV7(claim);
                  const wantsReusableCartons = o?.customerDetails?.packagingPreference?.useReusableFarmerCartons === true;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setSelectedOrderId(o.id)}
                      className={`w-full p-3 transition-colors relative ${isRTL ? 'text-right' : 'text-left'} ${
                        isDone
                          ? `bg-green-50 ${isRTL ? 'border-r-4 border-green-500' : 'border-l-4 border-green-500'} opacity-60`
                          : isActive
                            ? `bg-blue-100 ${isRTL ? 'border-r-4 border-blue-600' : 'border-l-4 border-blue-600'} shadow-sm`
                            : 'bg-white hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative flex-shrink-0">
                          <div className={`relative w-10 h-10 rounded-full font-black flex items-center justify-center text-lg ${
                            isDone ? 'bg-green-500 text-white' : isActive ? 'bg-blue-600 text-white ring-2 ring-blue-300' : 'bg-yellow-500 text-white'
                          }`}>
                            {isDone ? <span className="text-xl leading-none">&#10003;</span> : custNum}
                          </div>
                          {communityNum && (
                            <span className="absolute -bottom-1 -left-1 min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-600 text-white text-[9px] font-black flex items-center justify-center leading-none">
                              #{communityNum}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`font-bold text-sm truncate ${isDone ? 'text-green-800 line-through' : isActive ? 'text-blue-900' : 'text-gray-900'}`}>
                            {o.customerDetails?.name || t.customer}
                          </div>
                          <div className={`text-[11px] truncate flex items-center gap-1 ${isDone ? 'text-green-600' : isActive ? 'text-blue-700' : 'text-gray-500'}`}>
                            <span className="inline-block w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: getEffectiveCommunityColor(o.customerDetails?.pickupSpot || o.pickupSpot) }} />
                            <span className="truncate">{o.customerDetails?.pickupSpot || o.pickupSpot || ''} {o.customerDetails?.phone ? `• ${o.customerDetails.phone}` : ''}</span>
                          </div>
                          {wantsReusableCartons && (
                            <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black text-white shadow">
                              <span>🌱</span>
                              <span>{t.reusableCartonBadge}</span>
                            </div>
                          )}
                          {claim && (
                            <div className={`text-[10px] truncate mt-1 ${takenByOther ? 'text-red-600' : 'text-violet-600'}`}>
                              {t.claimedBy}: {claim.stationId}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {statusBadge(effectiveStatus)}
                          <span className={`text-[11px] ${isDone ? 'text-green-500' : 'text-gray-400'}`}>{oItems} {t.items}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            {!selectedOrder ? (
              <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400 text-lg">{t.pickOrder}</div>
            ) : (
              <div className="space-y-4">
                <div className="bg-white rounded-xl shadow-sm p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {(() => {
                        const cid = selectedOrder?.customerDetails?.phone || selectedOrder?.customerDetails?.email || null;
                        const num = cid && permanentNumbersMap[cid] ? permanentNumbersMap[cid] : '-';
                        return (
                          <div className="w-12 h-12 rounded-full bg-yellow-500 text-white font-black flex items-center justify-center text-xl">
                            {num}
                          </div>
                        );
                      })()}
                      <div>
                        <div className="text-lg font-black text-gray-900">{selectedOrder.customerDetails?.name}</div>
                        <div className="text-[9px] text-gray-400 font-mono leading-tight mt-0.5 select-all" title="Order ID">
                          {selectedOrder.id}
                        </div>
                        <div className="text-xs text-gray-500">
                          {t.community}: <span className="font-bold">{selectedOrder.customerDetails?.pickupSpot || selectedOrder.pickupSpot}</span>
                          {selectedOrder.customerDetails?.phone && <> • {t.phone}: <span className="font-bold">{selectedOrder.customerDetails.phone}</span></>}
                        </div>
                        {selectedClaim && (
                          <div className={`text-xs mt-1 ${claimedByOther ? 'text-red-600' : 'text-violet-600'}`}>
                            {t.claimedBy}: {selectedClaim.userName || selectedClaim.stationId} ({selectedClaim.stationId})
                          </div>
                        )}
                      </div>
                      <div className="ml-2">{statusBadge(selectedOrderStatus)}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={claimSelectedOrder}
                        disabled={!isOnline || savingActionKey === `claim:${selectedOrder.id}` || selectedOrderCompleted}
                        className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-lg text-sm shadow transition-colors disabled:opacity-50"
                      >
                        {t.claim}
                      </button>
                      <button
                        onClick={releaseSelectedOrder}
                        disabled={!isOnline || selectedClaim?.sessionId !== session.sessionId || savingActionKey === `release:${selectedOrder.id}`}
                        className="px-4 py-2 bg-violet-100 hover:bg-violet-200 text-violet-700 font-bold rounded-lg text-sm shadow transition-colors disabled:opacity-50"
                      >
                        {t.release}
                      </button>
                      <CustomerOrderDeliveryTransferControl
                        orderId={selectedOrder.id}
                        source="customerOrdersDelayed"
                        orderData={selectedOrder.rawData}
                        currentDeliveryDateKey={toLocalDateKey(parseOrderDeliveryDate(selectedOrder))}
                        adminUid={currentUser?.uid || null}
                        onTransferred={handleDeliveryTransferred}
                        buttonLabel={t.transferDelivery}
                        disabled={claimedByOther}
                        buttonClassName="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-sm shadow transition-colors disabled:opacity-50"
                      />
                      <button
                        onClick={useOrderedQuantities}
                        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-lg text-sm border transition-colors"
                        disabled={claimedByOther}
                      >
                        {t.useOrderedQty}
                      </button>
                      <button
                        onClick={completeOrder}
                        disabled={completeDisabled}
                        className={`px-5 py-2 font-bold rounded-lg text-sm transition-colors ${
                          completeDisabled
                            ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                            : 'bg-green-600 hover:bg-green-700 text-white shadow'
                        }`}
                      >
                        {t.completeBtn}
                      </button>
                    </div>
                  </div>

                  {claimedByOther && (
                    <div className="mt-3 px-3 py-2 rounded-lg bg-red-50 text-red-700 text-sm font-bold">
                      {t.busyElsewhere}
                    </div>
                  )}

                  {selectedOrder.customerDetails?.packagingPreference?.useReusableFarmerCartons === true && (
                    <div className="mt-3 rounded-2xl border-4 border-emerald-500 bg-emerald-50 p-4 shadow-lg">
                      <div className="flex items-start gap-3">
                        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-emerald-600 text-2xl shadow text-white">
                          🌱
                        </div>
                        <div>
                          <div className="text-xl font-black text-emerald-950">
                            {t.reusableCartonBannerTitle}
                          </div>
                          <div className="mt-1 text-sm font-bold text-emerald-800">
                            {t.reusableCartonBannerBody}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedOrderConflicts.length > 0 && (
                    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
                      <div className="font-bold text-sm text-red-800 mb-1">{t.conflictTitle}</div>
                      <p className="text-xs text-red-700 mb-2">{t.conflictHelp}</p>
                      <div className="space-y-2">
                        {selectedOrderConflicts.map((conflict) => {
                          const item = items.find((entry) => entry.lineId === conflict.lineId);
                          const itemLabel = item ? itemDisplayName(item) : (conflict.lineId || t.conflictStatus);
                          const localSnapshot = conflictLocalSnapshot(conflict);
                          const valuesMatch = areOpSnapshotsEqual(localSnapshot, conflict.cloudValue);
                          return (
                            <div key={conflict.id} className="rounded-lg bg-white border border-red-100 p-2 text-xs text-red-900">
                              <div className="font-bold">{itemLabel}</div>
                              <div>{t.localAttempt}: {formatConflictValue(localSnapshot, t)}</div>
                              <div>{t.cloudValue}: {formatConflictValue(conflict.cloudValue, t)}</div>
                              {valuesMatch && (
                                <p className="mt-1 text-emerald-800 font-semibold">{t.conflictSameValues}</p>
                              )}
                              <div className="mt-2 flex flex-wrap gap-2">
                                {valuesMatch ? (
                                  <button
                                    type="button"
                                    onClick={() => resolveConflictAcceptCloud(conflict)}
                                    className="px-2.5 py-1.5 rounded-md bg-emerald-600 text-white font-bold hover:bg-emerald-700"
                                  >
                                    {t.dismissConflict}
                                  </button>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => resolveConflictAcceptCloud(conflict)}
                                      className="px-2.5 py-1.5 rounded-md bg-white border border-red-300 text-red-900 font-bold hover:bg-red-50"
                                    >
                                      {t.acceptCloud}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => resolveConflictKeepLocal(conflict)}
                                      disabled={!isOnline}
                                      className="px-2.5 py-1.5 rounded-md bg-red-700 text-white font-bold hover:bg-red-800 disabled:bg-gray-400"
                                    >
                                      {t.keepLocal}
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {isElectronEnv && (
                    <div className={`mt-3 flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
                      scaleConnected ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
                    }`}>
                      <span className={`w-2.5 h-2.5 rounded-full ${scaleConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                      <span className="font-bold">{scaleConnected ? t.scaleOn : t.scaleOff}</span>
                      {scaleConnected && liveWeight?.value != null && (
                        <span className="font-black text-base ml-2">
                          {liveWeight.value.toFixed(3)} kg
                          {!liveWeight.stable && <span className="text-yellow-600 ml-1">(~)</span>}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {items.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm p-3 flex flex-wrap items-center gap-4 text-sm">
                    <span className="font-bold text-gray-800">{items.length} {lang === 'th' ? 'รายการ' : 'פריטים'}</span>
                    <span className="text-green-700 font-semibold">
                      {items.filter((it) => weightsByLineId[it.lineId]?.value > 0).length} {lang === 'th' ? 'ชั่งแล้ว' : 'נשקלו'}
                    </span>
                    <span className="text-red-700 font-semibold">
                      {items.filter((it) => getMissingLineDetails(it, weightsByLineId, removedLineIds)).length} {lang === 'th' ? 'ขาด' : 'חסרים'}
                    </span>
                    <span className="text-gray-600">
                      {Object.keys(removedLineIds || {}).filter((id) => removedLineIds[id]).length} {lang === 'th' ? 'ลบแล้ว' : 'הוסרו'}
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-white rounded-xl shadow-sm p-3">
                    <div className="text-[11px] text-gray-500 font-bold">{t.orderedKg}</div>
                    <div className="text-xl font-black text-gray-900">{totals.requestedTotal.toFixed(3)}</div>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm p-3">
                    <div className="text-[11px] text-gray-500 font-bold">{t.weighedKg}</div>
                    <div className="text-xl font-black text-blue-700">{totals.actualTotal.toFixed(3)}</div>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm p-3">
                    <div className="text-[11px] text-gray-500 font-bold">{t.orderedPrice}</div>
                    <div className="text-xl font-black text-gray-900">{totals.requestedSum.toFixed(2)}</div>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm p-3">
                    <div className="text-[11px] text-gray-500 font-bold">{t.weighedPrice}</div>
                    <div className="text-xl font-black text-green-700">{totals.actualSum.toFixed(2)}</div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm p-4">
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="font-black text-gray-800">{t.addProduct}</h2>
                        <p className="text-xs text-gray-500">{t.realtimeDraft}</p>
                      </div>
                      <div className="text-xs text-gray-500">{searchingProducts ? '...' : ''}</div>
                    </div>
                    <input
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder={t.searchProduct}
                      disabled={claimedByOther}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-gray-100"
                    />
                    {searchResults.length > 0 && (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {searchResults.map((product) => (
                          <div key={product.id} className="border border-gray-200 rounded-xl p-3 bg-gray-50 flex items-center gap-3">
                            <div className="w-16 h-16 rounded-lg overflow-hidden border border-gray-200 bg-white flex-shrink-0">
                              {Array.isArray(product.images) && product.images[0] ? (
                                <img src={cachedImg(product.images[0])} alt={product.name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-300 text-xl">?</div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-sm text-gray-900 truncate">{product.name}</div>
                              {product.thaiName && (
                                <div className="text-xs text-blue-600 truncate">{product.thaiName}</div>
                              )}
                              <div className="text-xs text-gray-500 truncate">{product.businessName || '-'}</div>
                              <div className="text-xs font-bold text-gray-700">{Number(product.price || 0).toFixed(2)} ₪</div>
                            </div>
                            <input
                              value={addQuantities[product.id] ?? (product.measurementType === 'kg' ? String(product.unitSize || 1) : '1')}
                              onChange={(e) => setAddQuantities((prev) => ({ ...prev, [product.id]: e.target.value }))}
                              className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm font-bold"
                              inputMode={product.measurementType === 'kg' ? 'decimal' : 'numeric'}
                            />
                            <button
                              onClick={() => addProductToOrder(product)}
                              disabled={claimedByOther || savingActionKey === `add:${product.id}`}
                              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold disabled:opacity-50"
                            >
                              {t.addProduct}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <h2 className="font-black text-gray-800">
                    {t.itemsLabel(activeItems.length, items.length)}
                  </h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {items.map((it, idx) => {
                    const weighed = weightsByLineId?.[it.lineId];
                    const weighedQty = weighed?.actualQuantity;
                    const isRemoved = !!removedLineIds[it.lineId];
                    const isNext = nextIdx === idx;
                    const isActive = activeItemIndex === idx;
                    const isEditing = editingLineId === it.lineId;
                    const isPriceEditing = editingPriceLineId === it.lineId;
                    const displayName = itemDisplayName(it);
                    const secondaryName = itemSecondaryName(it);
                    const isPackage = it.measurementType === 'package';
                    const isUnit = it.measurementType === 'unit';
                    const reqQty = Number(it.requestedQuantity || 0);
                    const reqEstimatedKg = getEstimatedChargeableQuantity({
                      measurementType: it.measurementType || 'kg',
                      quantity: reqQty,
                      averageWeightKg: it.averageWeightKg || 1,
                    });
                    const hasProductImage = it.images && it.images.length > 0;
                    const showQtyBadge = reqQty > 1;
                    const showUnderOneKgBadge = !isPackage && reqEstimatedKg > 0 && reqEstimatedKg < 1;
                    const contentTopPadding = hasProductImage
                      ? (showQtyBadge ? '8.5rem' : '6rem')
                      : (showQtyBadge ? '4.25rem' : '0.75rem');
                    const compactActionStyle = { flex: '0 0 auto', minWidth: 0, width: 'fit-content' };

                    return (
                      <div
                        key={it.lineId || idx}
                        ref={(el) => { itemRefs.current[idx] = el; }}
                        onClick={() => !isRemoved && selectItemForWeighing(idx)}
                        className={`
                          relative rounded-xl border-2 overflow-hidden cursor-pointer transition-all
                          ${isRemoved
                            ? 'border-red-200 bg-red-50 opacity-60 cursor-default'
                            : isActive
                              ? 'border-blue-500 bg-blue-50 shadow-lg ring-2 ring-blue-200'
                              : isNext
                                ? 'border-yellow-400 bg-yellow-50 shadow'
                                : weighedQty
                                  ? 'border-green-300 bg-green-50'
                                  : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow'
                          }
                        `}
                      >
                        {hasProductImage && (
                          <>
                            <img
                              src={cachedImg(it.images[0])}
                              alt=""
                              aria-hidden="true"
                              className={`pointer-events-none absolute inset-0 h-full w-full object-contain p-2 ${isRemoved ? 'grayscale opacity-40' : 'opacity-100'}`}
                            />
                            <div
                              className={`pointer-events-none absolute inset-0 ${
                                isRemoved
                                  ? 'bg-red-50 opacity-70'
                                  : isActive
                                    ? 'bg-blue-200 opacity-25'
                                    : isNext
                                      ? 'bg-yellow-100 opacity-25'
                                      : weighedQty
                                        ? 'bg-green-100 opacity-20'
                                        : 'bg-black opacity-5'
                              }`}
                            />
                            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black via-transparent to-black opacity-10" />
                          </>
                        )}
                        {showQtyBadge && !isRemoved && (
                          <div className="absolute top-3 right-3 z-30">
                            <div className="absolute inset-0 rounded-full bg-red-500 opacity-30 animate-ping" />
                            <div className="relative bg-red-700 text-white font-black rounded-full min-w-[52px] h-12 flex items-center justify-center px-3 text-2xl shadow-2xl border-4 border-white ring-4 ring-red-300 animate-pulse">
                              x{isPackage || isUnit ? Math.floor(reqQty) : reqQty}
                            </div>
                          </div>
                        )}
                        {showUnderOneKgBadge && !isRemoved && (
                          <div className={`absolute top-2 ${showQtyBadge ? 'left-2' : 'right-2'} z-20`}>
                            <span className="bg-orange-500 text-white font-black text-[11px] px-2 py-0.5 rounded-full shadow-lg border border-white">
                              {t.underOneKgBadge}
                            </span>
                          </div>
                        )}
                        {!isRemoved && isNext && !isActive && (
                          <div className={`absolute top-2 ${showQtyBadge ? (isRTL ? 'right-12' : 'left-2') : (isRTL ? 'right-2' : 'left-2')} z-20`}>
                            <span className="bg-yellow-400 text-yellow-900 font-bold text-[11px] px-2 py-0.5 rounded-full shadow border border-white">{t.next}</span>
                          </div>
                        )}
                        {isRemoved && (
                          <div className="absolute top-2 left-2 z-20">
                            <span className="bg-red-500 text-white font-bold text-[11px] px-2 py-0.5 rounded-full">{t.removedLabel}</span>
                          </div>
                        )}

                        <div className="relative z-10 p-3 space-y-2" style={{ paddingTop: contentTopPadding }}>
                        <div
                          className="p-2"
                          style={hasProductImage ? { textShadow: '0 1px 2px rgba(255,255,255,0.95), 0 0 8px rgba(255,255,255,0.85)' } : undefined}
                        >
                          <div className={`inline rounded-md px-1.5 py-0.5 font-black text-sm leading-tight shadow-sm ${isRemoved ? 'bg-gray-100 text-gray-400 line-through' : 'bg-cyan-100 text-cyan-950'}`}>
                            {displayName}
                          </div>
                          {secondaryName && (
                            <div className="mt-1">
                              <span className={`inline rounded px-1.5 py-0.5 text-[11px] font-bold shadow-sm ${isRemoved ? 'bg-gray-100 text-gray-300' : 'bg-violet-100 text-violet-800'}`}>{secondaryName}</span>
                            </div>
                          )}
                          <div className={`mt-2 inline-block rounded-md px-1.5 py-0.5 text-xs font-semibold shadow-sm ${isRemoved ? 'bg-gray-100 text-gray-400' : 'bg-amber-100 text-amber-950'}`}>
                            <span className="font-bold">{t.ordered}: </span>
                            {isPackage ? (
                              <><span className="font-black text-base">{Math.floor(reqQty)}</span> {t.pkgLbl}</>
                            ) : isUnit ? (
                              <>
                                <span className="font-black text-xl text-purple-700">{Math.floor(reqQty)}</span> <span className="font-black text-lg text-purple-700">{t.unitLbl}</span>
                              </>
                            ) : (
                              <>
                                <span className={`font-black text-base ${reqQty < 1 ? 'text-orange-600' : ''}`}>{reqQty.toFixed(3)}</span> {t.kg}
                              </>
                            )}
                          </div>
                          {isUnit && !isRemoved && (
                            <div className="mt-1 inline-block bg-purple-100 text-purple-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                              {t.unitOrderedBadge}
                            </div>
                          )}
                        </div>

                        <div
                          className="p-2"
                          style={hasProductImage ? { textShadow: '0 1px 2px rgba(255,255,255,0.95), 0 0 8px rgba(255,255,255,0.85)' } : undefined}
                        >
                          {isRemoved ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); restoreItem(it.lineId); }}
                              className="w-full py-1 px-2 text-[11px] font-bold rounded-md bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                            >
                              {t.restore}
                            </button>
                          ) : (
                            <div onClick={(e) => e.stopPropagation()}>
                              {isActive && scaleConnected && !isPackage && (
                                <div className="text-center mb-2 bg-blue-50 rounded-lg py-2">
                                  <div className="text-[10px] text-blue-500 font-bold">{t.liveWt}</div>
                                  <div className="text-2xl font-black text-blue-700 tabular-nums">
                                    {liveWeight?.value != null ? liveWeight.value.toFixed(3) : '0.000'}
                                    <span className="text-xs font-bold ml-1">{t.kg}</span>
                                  </div>
                                  {liveWeight?.value != null && liveWeight.value < WEIGHT_ON_THRESHOLD && !weighedQty && (
                                    <div className="text-[10px] text-gray-400">{t.placeOnScale}</div>
                                  )}
                                </div>
                              )}

                              {weighedQty && !isEditing && (
                                <div className="flex items-center justify-between mb-2">
                                  <div className="space-y-1">
                                    <div>
                                      <span className="inline rounded px-1.5 py-0.5 text-[11px] font-black text-green-900 bg-green-100 shadow-sm">{t.weighed}:</span>
                                    </div>
                                    <div>
                                      <span className="inline rounded-md px-1.5 py-0.5 text-lg font-black text-green-950 bg-emerald-100 shadow-sm">
                                        {isPackage
                                          ? `${Math.floor(weighedQty)} ${t.pkgLbl}`
                                          : `${Number(weighedQty).toFixed(3)} ${t.kg}`}
                                      </span>
                                    </div>
                                    {weighed?.source && (
                                      <div>
                                        <span className="inline rounded px-1.5 py-0.5 text-[10px] font-bold text-slate-700 bg-slate-100 shadow-sm">{sourceLabel(weighed.source, t)}</span>
                                      </div>
                                    )}
                                  </div>
                                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-700 text-xl font-black shadow-sm">&#10003;</span>
                                </div>
                              )}

                              {!weighedQty && !isActive && !isEditing && (
                                <div className="mb-2 space-y-1">
                                  <div>
                                    <span className="inline rounded px-1.5 py-0.5 text-[11px] font-black text-slate-700 bg-slate-100 shadow-sm">{t.weighed}:</span>
                                  </div>
                                  <div>
                                    <span className="inline rounded-md px-1.5 py-0.5 text-lg font-black text-gray-700 bg-gray-100 shadow-sm">
                                      {isPackage ? t.notConfirmed : t.notWeighed}
                                    </span>
                                  </div>
                                </div>
                              )}

                              {isEditing ? (
                                <div className="flex items-center gap-2 mb-2">
                                  <input
                                    autoFocus
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') saveManualWeight(it.lineId, editValue, 'manual');
                                      if (e.key === 'Escape') cancelEdit();
                                    }}
                                    inputMode={isPackage ? 'numeric' : 'decimal'}
                                    className="flex-1 border-2 border-blue-400 rounded-lg px-3 py-2 text-base font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder={isPackage ? '2' : '1.500'}
                                  />
                                  <button
                                    onClick={() => saveManualWeight(it.lineId, editValue, 'manual')}
                                    className="px-3 py-1.5 bg-green-600 text-white rounded-md text-xs font-bold hover:bg-green-700"
                                  >
                                    {t.save}
                                  </button>
                                  <button
                                    onClick={cancelEdit}
                                    className="px-2.5 py-1.5 bg-gray-200 text-gray-700 rounded-md text-xs font-bold hover:bg-gray-300"
                                  >
                                    {t.cancel}
                                  </button>
                                </div>
                              ) : isActive && !weighedQty && !isPackage ? (
                                <div className="flex items-center gap-2 mb-2">
                                  <input
                                    autoFocus={!scaleConnected}
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && editValue) saveManualWeight(it.lineId, editValue, 'manual');
                                    }}
                                    inputMode="decimal"
                                    className="flex-1 border-2 border-blue-400 rounded-lg px-3 py-2 text-base font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder={scaleConnected ? t.placeOnScale : '1.500'}
                                    onFocus={() => { setEditingLineId(it.lineId); }}
                                  />
                                  <button
                                    onClick={() => {
                                      if (editValue) {
                                        saveManualWeight(it.lineId, editValue, 'manual');
                                        return;
                                      }
                                      if (scaleConnected) {
                                        const stableVal = (liveWeight?.stable && liveWeight.value > WEIGHT_ON_THRESHOLD)
                                          ? liveWeight.value
                                          : (lastStableWeight?.value ?? 0);
                                        if (stableVal > WEIGHT_ON_THRESHOLD) {
                                          saveManualWeight(it.lineId, stableVal, 'scale');
                                        }
                                      }
                                    }}
                                    disabled={!editValue && !(scaleConnected && ((liveWeight?.stable && liveWeight.value > WEIGHT_ON_THRESHOLD) || (lastStableWeight?.value > WEIGHT_ON_THRESHOLD)))}
                                    className={`px-3 py-1.5 rounded-md text-xs font-bold ${
                                      (editValue || (scaleConnected && ((liveWeight?.stable && liveWeight.value > WEIGHT_ON_THRESHOLD) || (lastStableWeight?.value > WEIGHT_ON_THRESHOLD))))
                                        ? 'bg-green-600 text-white hover:bg-green-700'
                                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                    }`}
                                  >
                                    OK
                                  </button>
                                </div>
                              ) : null}

                              <div className="mb-2">
                                {isPriceEditing ? (
                                  <div className="flex items-center gap-2">
                                    <input
                                      autoFocus
                                      value={editPriceValue}
                                      onChange={(e) => setEditPriceValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') savePriceEdit(it);
                                        if (e.key === 'Escape') cancelPriceEdit();
                                      }}
                                      inputMode="decimal"
                                      className="flex-1 border-2 border-amber-400 rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                                    />
                                    <button
                                      onClick={() => savePriceEdit(it)}
                                      className="px-2.5 py-1.5 bg-amber-500 text-white rounded-md text-[11px] font-bold hover:bg-amber-600"
                                    >
                                      {t.savePrice}
                                    </button>
                                    <button
                                      onClick={cancelPriceEdit}
                                      className="px-2.5 py-1.5 bg-gray-200 text-gray-700 rounded-md text-[11px] font-bold hover:bg-gray-300"
                                    >
                                      {t.cancel}
                                    </button>
                                  </div>
                                ) : (
                                  <div>
                                    <span className="inline rounded-md px-1.5 py-0.5 text-xs font-bold text-indigo-950 bg-indigo-100 shadow-sm">
                                      {t.price}: ₪{Number(it.pricePerUnit || 0).toFixed(2)}
                                    </span>
                                  </div>
                                )}
                              </div>

                              <div className="flex gap-1.5 flex-wrap justify-end">
                                {isPackage && !weighedQty && (
                                  <button
                                    onClick={() => saveManualWeight(it.lineId, reqQty, 'package')}
                                    className="text-xs font-bold py-1.5 px-2 rounded-md bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors"
                                    style={compactActionStyle}
                                  >
                                    {t.ordered}: {Math.floor(reqQty)} {t.pkgLbl}
                                  </button>
                                )}
                                {!isEditing && !(isActive && !weighedQty && !isPackage) && (
                                  <button
                                    onClick={() => startEdit(it.lineId, weighedQty)}
                                    className="text-xs font-bold py-1.5 px-2 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                                    style={compactActionStyle}
                                  >
                                    {t.edit}
                                  </button>
                                )}
                                {!isPriceEditing && (
                                  <button
                                    onClick={() => startPriceEdit(it.lineId, it.pricePerUnit)}
                                    className="text-xs font-bold py-1.5 px-2 rounded-md bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors"
                                    style={compactActionStyle}
                                  >
                                    {t.price}
                                  </button>
                                )}
                                {weighedQty && !isEditing && (
                                  <button
                                    onClick={() => resetItem(it.lineId)}
                                    className="text-xs font-bold py-1.5 px-2 rounded-md bg-orange-100 text-orange-600 hover:bg-orange-200 transition-colors"
                                    style={compactActionStyle}
                                  >
                                    {t.reset}
                                  </button>
                                )}
                                <button
                                  onClick={async () => {
                                    const ok = await biConfirm({
                                      heText: `להסיר "${displayName}" מההזמנה?`,
                                      thText: `ลบ "${displayName}" ออก?`,
                                      title: 'warning',
                                    });
                                    if (ok) removeItem(it.lineId);
                                  }}
                                  className="text-xs font-bold py-1.5 px-2 rounded-md bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
                                  style={compactActionStyle}
                                >
                                  {t.remove}
                                </button>
                                {lang === 'he' && isAdmin && (
                                  expandedAdvancedLineId === it.lineId ? (
                                    <button
                                      onClick={() => deleteLine(it)}
                                      className="text-xs font-bold py-1.5 px-2 rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors"
                                      style={compactActionStyle}
                                    >
                                      {t.deleteLine}
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => setExpandedAdvancedLineId(it.lineId)}
                                      className="text-xs font-bold py-1.5 px-2 rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
                                      style={compactActionStyle}
                                    >
                                      {t.advancedActions}
                                    </button>
                                  )
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {missingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black bg-opacity-50" onClick={closeMissingOrderModal}></div>
          <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:w-11/12 max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center px-5 py-4 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-800">
                {lang === 'th' ? 'สั่งซื้อสินค้าที่ขาด' : 'הזמנת חוסרים'}
                <span className="block text-sm font-normal text-gray-500">สั่งซื้อสินค้าที่ขาด / Missing order</span>
              </h3>
              <button type="button" onClick={closeMissingOrderModal} className="text-2xl text-gray-400 hover:text-gray-700 leading-none">✕</button>
            </div>

            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 space-y-3">
              <div>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="text-sm font-bold text-gray-700">קהילות להצגת חוסרים:</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={selectAllMissingModalCommunities}
                      className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                    >
                      הכל
                    </button>
                    <button
                      type="button"
                      onClick={clearMissingModalCommunities}
                      className="px-3 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
                    >
                      נקה
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {orderCommunities.map((community) => (
                    <label
                      key={community}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm cursor-pointer transition-colors ${
                        missingModalCommunities.has(community)
                          ? 'bg-green-100 text-green-800 border-green-300'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={missingModalCommunities.has(community)}
                        onChange={() => toggleMissingModalCommunity(community)}
                        className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                      />
                      <span className="inline-block w-3.5 h-3.5 rounded-full" style={{ backgroundColor: getEffectiveCommunityColor(community) }} />
                      {community}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <span className="text-sm text-gray-600 self-center ml-2">{lang === 'th' ? 'มุมมอง:' : 'תצוגה:'}</span>
                <button
                  type="button"
                  onClick={() => setMissingModalView('items')}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    missingModalView === 'items'
                      ? 'bg-orange-500 text-white'
                      : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  לפי מוצר
                </button>
                <button
                  type="button"
                  onClick={() => setMissingModalView('orders')}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    missingModalView === 'orders'
                      ? 'bg-orange-500 text-white'
                      : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  לפי שם/מספר
                </button>
              </div>

              <div className="flex gap-2">
                <span className="text-sm text-gray-600 self-center ml-2">הזמנות הושלמו:</span>
                <button
                  type="button"
                  onClick={() => setMissingModalIncludeCompleted((prev) => !prev)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    missingModalIncludeCompleted
                      ? 'bg-green-600 text-white'
                      : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {missingModalIncludeCompleted ? 'כולל הושלמו' : 'ללא הושלמו'}
                </button>
              </div>

              {missingModalView === 'items' && (
              <div className="flex gap-2">
                <span className="text-sm text-gray-600 self-center ml-2">הכל:</span>
                <button
                  type="button"
                  onClick={() => setAllMissingMode('unit')}
                  className="px-4 py-1.5 rounded-full text-sm font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                >
                  יח'
                </button>
                <button
                  type="button"
                  onClick={() => setAllMissingMode('kg')}
                  className="px-4 py-1.5 rounded-full text-sm font-medium bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors"
                >
                  ק"ג
                </button>
              </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {missingModalCommunities.size === 0 && (
                <div className="text-center text-gray-500 py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  בחר קהילה אחת או יותר כדי לראות חוסרים.
                </div>
              )}

              {missingModalCommunities.size > 0
                && ((missingModalView === 'items' && missingModalItems.length === 0)
                  || (missingModalView === 'orders' && missingOrdersByCustomer.length === 0)) && (
                <div className="text-center text-gray-500 py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  אין חוסרים מלאים או חוסרים מתחת ל-50% בקהילות שנבחרו
                  {missingModalIncludeCompleted ? '.' : ' בהזמנות שעדיין לא הושלמו.'}
                </div>
              )}

              {missingModalCommunities.size > 0 && missingModalView === 'items' && missingModalItems.map((it, idx) => (
                <div
                  key={it.key}
                  className={`flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl border transition-all ${
                    it.included ? 'bg-white border-gray-200 shadow-sm' : 'bg-gray-50 border-gray-100 opacity-50'
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={it.included}
                      onChange={(e) => updateMissingItem(idx, 'included', e.target.checked)}
                      className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-gray-800 text-base block truncate">{it.productName}</span>
                        {it.hasPartialMissing && (
                          <span className="text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full">
                            חוסר חלקי (פחות מ-50%)
                          </span>
                        )}
                        {it.hasFullMissing && (
                          <span className="text-xs font-bold bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full">
                            חסר מלא
                          </span>
                        )}
                      </div>
                      {it.selectedOption && <span className="text-sm text-gray-500">{it.selectedOption}</span>}
                      {it.businessName && <span className="text-xs text-gray-400 block truncate">{it.businessName}</span>}
                      <span className="text-xs text-gray-500 block truncate">
                        קהילות: {it.communities.join(', ')}
                      </span>
                      {it.hasPartialMissing && (
                        <span className="text-xs text-amber-700 block">
                          הוזמן {it.expectedQuantity} / נשקל {it.actualQuantity} / חסר {it.rawQuantity}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pr-8 sm:pr-0">
                    {it.canUseKg ? (
                      <div className="inline-flex rounded-full overflow-hidden border border-gray-300">
                        <button
                          type="button"
                          onClick={() => updateMissingItem(idx, 'mode', 'unit')}
                          className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                            it.mode === 'unit' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          יח'
                        </button>
                        <button
                          type="button"
                          onClick={() => updateMissingItem(idx, 'mode', 'kg')}
                          className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                            it.mode === 'kg' ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          ק"ג
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 w-[88px] text-center">יח' (קבוע)</span>
                    )}

                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        step={it.mode === 'kg' && it.canUseKg ? '0.1' : '1'}
                        value={it.quantity}
                        onChange={(e) => updateMissingItem(idx, 'quantity', e.target.value)}
                        disabled={!it.included}
                        className="w-20 px-2 py-1.5 border border-gray-300 rounded-lg text-center text-base font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                      />
                      <span className="text-sm text-gray-500 w-8">
                        {it.mode === 'kg' && it.canUseKg ? 'ק"ג' : "יח'"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              {missingModalCommunities.size > 0 && missingModalView === 'orders' && missingOrdersByCustomer.map((order) => (
                <div key={order.id} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex flex-wrap justify-between gap-2">
                    <div>
                      <div className="font-bold text-gray-800">
                        {order.customerNumber ? `#${order.customerNumber} · ` : ''}
                        {order.customerName}
                      </div>
                      <div className="text-xs text-gray-500">
                        {order.community}
                        {order.customerPhone ? ` · ${order.customerPhone}` : ''}
                        {order.orderLabel ? ` · הזמנה ${order.orderLabel}` : ''}
                      </div>
                    </div>
                    <span className="text-xs font-bold bg-orange-100 text-orange-800 px-2 py-1 rounded-full self-start">
                      {order.missingLines.length} חוסרים
                    </span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {order.missingLines.map((line) => {
                      const isKgLike = line.measurementType !== 'package';
                      const missingDisplay = isKgLike
                        ? `${line.missingQuantity} ק"ג`
                        : `${Math.round(line.unitQuantity)} יח'`;
                      return (
                        <div key={line.key} className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-gray-800">{line.productName}</span>
                            {line.selectedOption && <span className="text-sm text-gray-500">{line.selectedOption}</span>}
                            {line.isPartialUnderHalf && (
                              <span className="text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full">
                                חוסר חלקי (פחות מ-50%)
                              </span>
                            )}
                            {line.isFullyMissing && (
                              <span className="text-xs font-bold bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full">
                                חסר מלא
                              </span>
                            )}
                          </div>
                          {line.businessName && <div className="text-xs text-gray-400">{line.businessName}</div>}
                          <div className="text-xs text-gray-600 mt-1">
                            הוזמן {line.expectedQuantity} / נשקל {line.actualQuantity} / חסר {missingDisplay}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-200 px-5 py-4 bg-gray-50 rounded-b-2xl">
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                <span className="text-sm text-gray-500">
                  {missingModalView === 'items'
                    ? `${missingModalItems.filter((it) => it.included && (Number(it.quantity) || 0) > 0).length} מוצרים נבחרו`
                    : `${missingOrdersByCustomer.length} לקוחות עם חוסרים`}
                </span>
                <button
                  type="button"
                  onClick={handleCopyMissingOrder}
                  disabled={missingModalItems.filter((it) => it.included && (Number(it.quantity) || 0) > 0).length === 0}
                  className="w-full sm:w-auto px-6 py-3 bg-orange-500 text-white font-bold rounded-xl text-lg hover:bg-orange-600 active:bg-orange-700 transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  העתק הזמנה
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <BilingualDialog
        open={!!dialog}
        title={dialog?.title}
        heText={dialog?.heText}
        thText={dialog?.thText}
        type={dialog?.type}
        confirmButtonDelay={dialog?.confirmButtonDelay || 0}
        onConfirm={() => closeDialog(true)}
        onCancel={() => closeDialog(dialog?.type === 'alert' ? undefined : false)}
      />
    </div>
  );
}