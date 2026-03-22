import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, getDoc, getDocs, runTransaction } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '../../../firebase/firebase';
import { useAuth } from '../../../contexts/authContext';
import LoadingSpinner from '../../LoadingSpinner';
import { pickupSpots } from '../../../data/pickupSpots';
import { fetchDelayedOrdersForDeliveryV5, fetchCompletedOrdersForWeek, handleSuspendedPaymentV5 } from './api';
import { loadWeighingState, upsertOrderWeighing } from './storage';
import { useWeightScale } from '../../../hooks/useWeightScale';
import ScaleConnectionPanel from '../../scale/ScaleConnectionPanel';

/* ═══════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════ */
const ADMIN_UIDS = ['rfHOLhNoJOW8ByNypCtm3hlSNKs2'];
const BUFFER_LINE_CATALOG_NUMBER = process.env.REACT_APP_BUFFER_LINE_CATALOG_NUMBER || '999003';
const WEIGHT_ON_THRESHOLD = 0.020;
const WEIGHT_OFF_THRESHOLD = 0.010;
const LANG_STORAGE_KEY = 'deliveryV6::lang';
const OFFLINE_QUEUE_KEY = 'deliveryV6::offlineQueue';
const COMMUNITY_ORDER_KEY = 'deliveryV6::communityOrder';

/* ═══════════════════════════════════════════════════════════════
   Translations
   ═══════════════════════════════════════════════════════════════ */
const TR = {
  he: {
    title: 'ניהול משלוחים V6',
    subtitle: 'שקילת פריטים — גרסה משופרת',
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
    autoSaved: (w) => `נשמר ${w} ק"ג — עובר להבא`,
    srcManual: 'ידני',
    srcScale: 'משקל (BEP)',
    srcPlaceholder: 'סקייל (placeholder)',
    srcOrdered: 'כמות הזמנה',
    srcPackage: 'מארז (אושר)',
    stPending: 'ממתין',
    stInProgress: 'בהכנה',
    stWeighed: 'נשקל',
    stSettling: 'מחייב…',
    stCompleted: 'הושלם',
    stPendingSync: 'ממתין לסנכרון',
    confirmComplete: 'לסמן כהושלם ולחייב את הלקוח?',
    cannotComplete: 'יש פריטים שלא נשקלו עדיין.',
    completedOk: 'הושלם! השרת אישר.',
    errorComplete: 'שגיאה. אפשר לנסות שוב. בדוק קונסול.',
    savedOffline: 'נשמר אופליין — יסונכרן כשהאינטרנט יחזור.',
    confirmUseOrdered: 'למלא הכל לפי הכמות שהוזמנה? ידרוס שקילות קיימות.',
    confirmRemove: (n) => `להסיר "${n}" מההזמנה?`,
    offlineQ: 'ממתינים לסנכרון',
    syncNow: 'סנכרן עכשיו',
    syncingLabel: 'מסנכרן...',
    syncOk: (n) => `${n} הזמנות סונכרנו`,
    syncFail: (n) => `${n} נכשלו`,
    allFilter: 'הכל',
    qtyBadge: 'x',
    noPermission: 'אין הרשאות לצפות בדף זה',
    failWeeks: 'שגיאה בטעינת שבועות',
    failOrders: 'שגיאה בטעינת הזמנות',
    unitMeasure: 'יחידה (נשקל)',
    pkgMeasure: 'מארז',
    manualInput: 'ק"ג ידני:',
    reopenOrder: 'פתח מחדש לעריכה',
    reopenConfirm: 'להחזיר הזמנה זו למצב "בהכנה"?',
    manualInputPkg: 'כמות:',
  },
  th: {
    title: 'จัดการจัดส่ง V6',
    subtitle: 'ชั่งน้ำหนักสินค้า — เวอร์ชันปรับปรุง',
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
    autoSaved: (w) => `บันทึก ${w} กก. — ไปรายการถัดไป`,
    srcManual: 'กรอกเอง',
    srcScale: 'ตาชั่ง (BEP)',
    srcPlaceholder: 'ตาชั่ง (ชั่วคราว)',
    srcOrdered: 'จำนวนที่สั่ง',
    srcPackage: 'แพ็ก (ยืนยัน)',
    stPending: 'รอ',
    stInProgress: 'กำลังทำ',
    stWeighed: 'ชั่งแล้ว',
    stSettling: 'เก็บเงิน…',
    stCompleted: 'เสร็จแล้ว',
    stPendingSync: 'รอซิงค์',
    confirmComplete: 'ยืนยันเสร็จสิ้นและเรียกเก็บเงิน?',
    cannotComplete: 'ยังมีรายการที่ยังไม่ชั่ง',
    completedOk: 'เสร็จแล้ว! เซิร์ฟเวอร์ยืนยัน',
    errorComplete: 'เกิดข้อผิดพลาด — ลองอีกครั้ง',
    savedOffline: 'บันทึกออฟไลน์ — จะซิงค์เมื่อมีเน็ต',
    confirmUseOrdered: 'ใช้จำนวนที่สั่งทั้งหมด? จะแทนที่ค่าที่ชั่ง',
    confirmRemove: (n) => `ลบ "${n}" ออก?`,
    offlineQ: 'รอซิงค์',
    syncNow: 'ซิงค์ตอนนี้',
    syncingLabel: 'กำลังซิงค์...',
    syncOk: (n) => `ซิงค์สำเร็จ ${n} รายการ`,
    syncFail: (n) => `ล้มเหลว ${n} รายการ`,
    allFilter: 'ทั้งหมด',
    qtyBadge: 'x',
    noPermission: 'ไม่มีสิทธิ์เข้าถึง',
    failWeeks: 'โหลดสัปดาห์ล้มเหลว',
    failOrders: 'โหลดคำสั่งซื้อล้มเหลว',
    unitMeasure: 'ชิ้น (ชั่ง)',
    pkgMeasure: 'แพ็ก',
    manualInput: 'กก. กรอกเอง:',
    reopenOrder: 'เปิดใหม่เพื่อแก้ไข',
    reopenConfirm: 'เปลี่ยนคำสั่งซื้อนี้กลับเป็น "กำลังดำเนินการ"?',
    manualInputPkg: 'จำนวน:',
  },
};

/* ═══════════════════════════════════════════════════════════════
   Bilingual Dialog Component (replaces window.confirm / alert)
   ═══════════════════════════════════════════════════════════════ */
function BilingualDialog({ open, title, heText, thText, type, onConfirm, onCancel }) {
  if (!open) return null;
  const isConfirm = type === 'confirm';

  const palette = title === 'error'
    ? { grad: 'from-red-500 to-red-600', bg: 'bg-red-50', ring: 'ring-red-200', iconBg: 'bg-red-100', iconColor: 'text-red-600' }
    : title === 'success'
    ? { grad: 'from-emerald-500 to-emerald-600', bg: 'bg-emerald-50', ring: 'ring-emerald-200', iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600' }
    : title === 'warning'
    ? { grad: 'from-amber-500 to-amber-600', bg: 'bg-amber-50', ring: 'ring-amber-200', iconBg: 'bg-amber-100', iconColor: 'text-amber-600' }
    : { grad: 'from-blue-500 to-blue-600', bg: 'bg-blue-50', ring: 'ring-blue-200', iconBg: 'bg-blue-100', iconColor: 'text-blue-600' };

  const iconMap = {
    error:   <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>,
    success: <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>,
    warning: <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86l-8.58 14.86A1.98 1.98 0 003.43 21h17.14a1.98 1.98 0 001.72-2.99L13.71 3.86a2 2 0 00-3.42 0z" /></svg>,
    info:    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" /></svg>,
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
          {/* Icon header */}
          <div className={`flex justify-center pt-6 pb-2 ${palette.bg}`}>
            <div className={`w-14 h-14 rounded-full flex items-center justify-center ${palette.iconBg} ${palette.iconColor}`}>
              {icon}
            </div>
          </div>

          {/* Body */}
          <div className={`px-6 pb-4 pt-2 ${palette.bg}`}>
            {/* Hebrew (RTL) */}
            <div dir="rtl" className="text-center mb-2">
              <p className="text-[15px] font-bold text-gray-900 leading-relaxed">{heText}</p>
            </div>
            {/* Divider */}
            <div className="flex items-center gap-2 my-2">
              <div className="flex-1 border-t border-gray-200" />
              <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">TH</span>
              <div className="flex-1 border-t border-gray-200" />
            </div>
            {/* Thai (LTR) */}
            <div dir="ltr" className="text-center">
              <p className="text-[14px] font-semibold text-gray-600 leading-relaxed">{thText}</p>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 pb-5 pt-1 flex gap-3 bg-white">
            {isConfirm ? (
              <>
                <button
                  autoFocus
                  onClick={onConfirm}
                  className={`flex-1 py-3 rounded-xl font-black text-white text-sm transition-all bg-gradient-to-r ${palette.grad} hover:shadow-lg active:scale-[0.98] focus:outline-none focus:ring-2 ${palette.ring}`}
                >
                  ✓&ensp;אישור / ตกลง
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

/* ═══════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════ */
function weekKeyToRangeLabel(weekKey) {
  const sunday = new Date(weekKey);
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  return `${format(sunday, 'dd/MM/yyyy')} - ${format(saturday, 'dd/MM/yyyy')}`;
}

function getNextUnweighedIndex(items = [], weightsByLineId = {}, removedLineIds = {}, startFrom = 0) {
  // Search forward from startFrom, then wrap around from 0
  for (let offset = 0; offset < items.length; offset++) {
    const i = (startFrom + offset) % items.length;
    const lineId = items[i]?.lineId;
    if (!lineId) continue;
    if (removedLineIds[lineId]) continue;
    if (!weightsByLineId?.[lineId]?.actualQuantity) return i;
  }
  return -1;
}

function loadOfflineQueue() {
  try { return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]'); } catch { return []; }
}
function saveOfflineQueue(q) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q));
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

/* ═══════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════ */
export default function DeliveryManagementV6() {
  const { currentUser } = useAuth();

  /* ─── Language ─── */
  const [lang, setLang] = useState(() => localStorage.getItem(LANG_STORAGE_KEY) || 'he');
  const t = TR[lang] || TR.he;
  const isRTL = lang === 'he';
  const toggleLang = () => {
    const next = lang === 'he' ? 'th' : 'he';
    setLang(next);
    localStorage.setItem(LANG_STORAGE_KEY, next);
  };

  /* ─── Core state ─── */
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [availableWeeks, setAvailableWeeks] = useState([]);
  const [tempSelectedWeek, setTempSelectedWeek] = useState('');
  const [selectedWeek, setSelectedWeek] = useState('');

  const [showCommunityDropdown, setShowCommunityDropdown] = useState(false);
  const communityDropdownRef = useRef(null);
  const [tempSelectedCommunities, setTempSelectedCommunities] = useState(new Set());
  const [selectedCommunities, setSelectedCommunities] = useState(new Set());

  const [orders, setOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [weighingState, setWeighingState] = useState({ byOrderId: {} });
  const [activeItemIndex, setActiveItemIndex] = useState(-1);

  const [productDetails, setProductDetails] = useState({});
  const [permanentNumbersMap, setPermanentNumbersMap] = useState({});

  /* ─── Scale (inline — no modal) ─── */
  const [showScalePanel, setShowScalePanel] = useState(false);
  const {
    isElectron: isElectronEnv,
    isConnected: scaleConnected,
    weight: liveWeight,
    lastStableWeight,
  } = useWeightScale();

  /* ─── Inline edit ─── */
  const [editingLineId, setEditingLineId] = useState(null);
  const [editValue, setEditValue] = useState('');

  /* ─── Auto-weigh tracking ─── */
  const prevStableRef = useRef(0);
  const autoWeighActiveRef = useRef(false);

  /* ─── Community filter + custom order (post-load) ─── */
  const [communityFilter, setCommunityFilter] = useState('__all__');
  const [showCompleted, setShowCompleted] = useState(false);
  const [communityOrder, setCommunityOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem(COMMUNITY_ORDER_KEY) || '[]'); } catch { return []; }
  });

  /* ─── Toast ─── */
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = useCallback((msg, dur = 2500) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), dur);
  }, []);

  /* ─── Bilingual dialog state ─── */
  const [dialog, setDialog] = useState(null); // { heText, thText, title, type, resolve }
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

  const biConfirm = useCallback(({ heText, thText, title = 'warning' }) => {
    return showDialog({ heText, thText, title, type: 'confirm' });
  }, [showDialog]);

  const biAlert = useCallback(({ heText, thText, title = 'info' }) => {
    return showDialog({ heText, thText, title, type: 'alert' });
  }, [showDialog]);

  /* ─── Offline queue ─── */
  const [offlineQueue, setOfflineQueue] = useState(() => loadOfflineQueue());
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [syncing, setSyncing] = useState(false);

  /* ─── Scroll ref ─── */
  const itemRefs = useRef({});

  /* ═══════════════════════════════════════════════════════════
     Effects
     ═══════════════════════════════════════════════════════════ */

  // Close community dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (communityDropdownRef.current && !communityDropdownRef.current.contains(e.target)) {
        setShowCommunityDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Auth check
  useEffect(() => {
    if (!currentUser || !ADMIN_UIDS.includes(currentUser.uid)) {
      setError(t.noPermission);
      setLoading(false);
      return;
    }
    fetchAvailableWeeks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  // Load weighing state when week changes
  useEffect(() => {
    if (!selectedWeek) return;
    setWeighingState(loadWeighingState({ weekKey: selectedWeek }));
  }, [selectedWeek]);

  // Online/offline detection
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // Scroll active item into view
  useEffect(() => {
    if (activeItemIndex >= 0 && itemRefs.current[activeItemIndex]) {
      itemRefs.current[activeItemIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeItemIndex]);

  /* ═══════════════════════════════════════════════════════════
     Data fetching (same logic as V5)
     ═══════════════════════════════════════════════════════════ */

  const fetchPermanentCustomerNumbers = async (customersList) => {
    if (!customersList || customersList.length === 0) return {};
    const mapping = {};
    const missing = [];
    await Promise.all(customersList.map(async (c) => {
      const id = c?.id;
      if (!id) return;
      const ref = doc(db, 'customerNumbers', id);
      const snap = await getDoc(ref);
      if (snap.exists()) { mapping[id] = snap.data()?.number; } else { missing.push(c); }
    }));
    if (missing.length === 0) return mapping;
    const configRef = doc(db, 'customerNumbers', '_config');
    await runTransaction(db, async (tx) => {
      const configSnap = await tx.get(configRef);
      let currentMax = configSnap.exists() ? Number(configSnap.data()?.maxNumber || 0) : 0;
      let next = currentMax;
      for (const m of missing) {
        const id = m?.id; if (!id) continue;
        next += 1;
        tx.set(doc(db, 'customerNumbers', id), { number: next, name: m?.name || '', assignedAt: new Date() });
        mapping[id] = next;
      }
      tx.set(configRef, { maxNumber: next }, { merge: true });
    });
    return mapping;
  };

  const fetchProductDetails = async (productIds) => {
    const ids = Array.from(new Set((productIds || []).filter(Boolean)));
    if (ids.length === 0) return {};
    const map = {};
    await Promise.all(ids.map(async (productId) => {
      try {
        const ref = doc(db, 'Products', productId);
        const snap = await getDoc(ref);
        if (!snap.exists()) return;
        const d = snap.data() || {};
        map[productId] = {
          images: Array.isArray(d.images) ? d.images : [],
          thaiName: d.thaiName || '',
          name: d.name || '',
          measurementType: d.measurementType || 'kg',
          unitSize: d.unitSize || 1,
        };
      } catch { /* non-fatal */ }
    }));
    return map;
  };

  const fetchAvailableWeeks = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'Orders'));
      const weeksSet = new Set();
      snap.docs.forEach((d) => {
        const data = d.data();
        const endingTime = data.Ending_Time || data.endingTime;
        if (!endingTime) return;
        let endDate = endingTime?.toDate ? endingTime.toDate() : new Date(endingTime);
        if (!endDate || Number.isNaN(endDate.getTime())) return;
        const sunday = new Date(endDate);
        sunday.setDate(endDate.getDate() - endDate.getDay());
        sunday.setHours(0, 0, 0, 0);
        weeksSet.add(sunday.toISOString().split('T')[0]);
      });
      const sorted = Array.from(weeksSet).sort((a, b) => new Date(b) - new Date(a));
      setAvailableWeeks(sorted);
      if (sorted.length > 0) setTempSelectedWeek(sorted[0]);
    } catch (e) {
      console.error(e);
      setError(t.failWeeks);
    } finally {
      setLoading(false);
    }
  };

  // Load orders when week/communities change
  useEffect(() => {
    const run = async () => {
      if (!selectedWeek) return;
      setLoading(true);
      setError(null);
      try {
        const communities = Array.from(selectedCommunities);

        // Fetch pending AND completed orders in parallel
        const [fetched, completedFromDb] = await Promise.all([
          fetchDelayedOrdersForDeliveryV5({ weekKey: selectedWeek, communities }),
          fetchCompletedOrdersForWeek({ weekKey: selectedWeek, communities }).catch((err) => {
            console.warn('Failed to fetch completed orders (non-fatal):', err);
            return [];
          }),
        ]);

        const persisted = loadWeighingState({ weekKey: selectedWeek });
        setWeighingState(persisted);

        // Hydrate pending orders with local weighing state
        const hydratedPending = (Array.isArray(fetched) ? fetched : []).map((o) => {
          const saved = persisted.byOrderId?.[o.id] || {};
          return { ...o, status: saved.status || o.status || 'pending' };
        });

        // Completed orders from DB — mark as completed, skip any that are also in pending list
        const pendingIds = new Set(hydratedPending.map((o) => o.id));
        const hydratedCompleted = (Array.isArray(completedFromDb) ? completedFromDb : [])
          .filter((o) => !pendingIds.has(o.id))
          .map((o) => {
            // Also check local state — might have been marked completed locally
            const saved = persisted.byOrderId?.[o.id] || {};
            return { ...o, status: saved.status || 'completed' };
          });

        // Pending first, then completed at the bottom
        const allOrders = [...hydratedPending, ...hydratedCompleted];
        setOrders(allOrders);
        if (allOrders.length > 0 && (!selectedOrderId || !allOrders.some((o) => o.id === selectedOrderId))) {
          // Auto-select first non-completed order, or first order if all completed
          const firstPending = allOrders.find((o) => o.status !== 'completed' && o.status !== 'pending_sync');
          setSelectedOrderId(firstPending ? firstPending.id : allOrders[0].id);
        }
        setCommunityFilter('__all__');

        // Gather product IDs and customers from ALL orders (pending + completed)
        const productIdSet = new Set();
        const customersList = [];
        allOrders.forEach((o) => {
          (o.items || []).forEach((it) => { if (it?.productId) productIdSet.add(it.productId); });
          const cid = o?.customerDetails?.phone || o?.customerDetails?.email || null;
          if (cid) customersList.push({ id: cid, name: o?.customerDetails?.name || '' });
        });
        const [pd, nums] = await Promise.all([
          fetchProductDetails(Array.from(productIdSet)),
          fetchPermanentCustomerNumbers(customersList),
        ]);
        setProductDetails(pd);
        setPermanentNumbersMap(nums);
      } catch (e) {
        console.error(e);
        setError(t.failOrders);
      } finally {
        setLoading(false);
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWeek, selectedCommunities]);

  /* ═══════════════════════════════════════════════════════════
     Derived data
     ═══════════════════════════════════════════════════════════ */

  const selectedOrder = useMemo(() => orders.find((o) => o.id === selectedOrderId) || null, [orders, selectedOrderId]);
  const selectedOrderSaved = useMemo(
    () => (selectedWeek && selectedOrderId ? (weighingState.byOrderId?.[selectedOrderId] || {}) : {}),
    [weighingState, selectedWeek, selectedOrderId],
  );
  const weightsByLineId = selectedOrderSaved.weightsByLineId || {};
  const removedLineIds = selectedOrderSaved.removedLineIds || {};

  const items = useMemo(() => {
    const base = selectedOrder?.items || [];
    return base.map((it) => {
      const pd = it?.productId ? productDetails[it.productId] : null;
      return {
        ...it,
        thaiName: pd?.thaiName || it?.thaiName || '',
        images: pd?.images || it?.images || [],
        measurementType: pd?.measurementType || it?.measurementType || 'kg',
        unitSize: pd?.unitSize || it?.unitSize || 1,
      };
    });
  }, [selectedOrder, productDetails]);

  const activeItems = useMemo(() => items.filter((it) => !removedLineIds[it.lineId]), [items, removedLineIds]);
  const nextIdx = useMemo(() => getNextUnweighedIndex(items, weightsByLineId, removedLineIds), [items, weightsByLineId, removedLineIds]);
  const canComplete = activeItems.length > 0 && nextIdx === -1;

  // Communities present in loaded orders (respecting custom order)
  const orderCommunities = useMemo(() => {
    const set = new Set();
    orders.forEach((o) => {
      const c = o?.customerDetails?.pickupSpot || o?.pickupSpot;
      if (c) set.add(c);
    });
    const all = Array.from(set);
    // Sort by custom order first, then alphabetically for any new ones
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

  // Persist community order whenever orderCommunities changes (sync new communities into saved order)
  useEffect(() => {
    if (orderCommunities.length === 0) return;
    // Merge: keep saved order for known communities, append new ones at end
    const saved = communityOrder.filter((c) => orderCommunities.includes(c));
    const newOnes = orderCommunities.filter((c) => !saved.includes(c));
    const merged = [...saved, ...newOnes];
    if (JSON.stringify(merged) !== JSON.stringify(communityOrder)) {
      setCommunityOrder(merged);
      localStorage.setItem(COMMUNITY_ORDER_KEY, JSON.stringify(merged));
    }
  }, [orderCommunities]); // eslint-disable-line react-hooks/exhaustive-deps

  const moveCommunity = useCallback((community, direction) => {
    setCommunityOrder((prev) => {
      const arr = [...prev];
      const idx = arr.indexOf(community);
      if (idx < 0) return arr;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= arr.length) return arr;
      // Swap
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      localStorage.setItem(COMMUNITY_ORDER_KEY, JSON.stringify(arr));
      return arr;
    });
  }, []);

  // Filtered + sorted orders by community custom order
  const filteredOrders = useMemo(() => {
    const rankMap = {};
    orderCommunities.forEach((c, i) => { rankMap[c] = i; });

    let list = communityFilter === '__all__' ? [...orders] : orders.filter((o) => {
      const c = o?.customerDetails?.pickupSpot || o?.pickupSpot;
      return c === communityFilter;
    });

    // Hide completed if toggle is off
    if (!showCompleted) {
      list = list.filter((o) => o.status !== 'completed' && o.status !== 'pending_sync');
    }

    // Sort: pending orders first (by community order, then name), completed at bottom
    list.sort((a, b) => {
      const aDone = a.status === 'completed' || a.status === 'pending_sync' ? 1 : 0;
      const bDone = b.status === 'completed' || b.status === 'pending_sync' ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      const ca = a?.customerDetails?.pickupSpot || a?.pickupSpot || '';
      const cb = b?.customerDetails?.pickupSpot || b?.pickupSpot || '';
      const ra = rankMap[ca] ?? 9999;
      const rb = rankMap[cb] ?? 9999;
      if (ra !== rb) return ra - rb;
      return (a.customerDetails?.name || '').localeCompare(b.customerDetails?.name || '');
    });

    return list;
  }, [orders, communityFilter, orderCommunities, showCompleted]);

  // Set active item index when selected order changes
  useEffect(() => {
    if (!selectedOrder) { setActiveItemIndex(-1); return; }
    const suggested = nextIdx >= 0 ? nextIdx : 0;
    setActiveItemIndex(suggested);
    // Reset auto-weigh
    autoWeighActiveRef.current = false;
    prevStableRef.current = 0;
  }, [selectedOrderId, nextIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ═══════════════════════════════════════════════════════════
     Totals
     ═══════════════════════════════════════════════════════════ */
  const totals = useMemo(() => {
    let requestedTotal = 0, actualTotal = 0, requestedSum = 0, actualSum = 0;
    for (const it of items) {
      if (removedLineIds[it.lineId]) continue;
      const req = Number(it.requestedQuantity || 0);
      const price = Number(it.pricePerUnit || 0);
      requestedTotal += req;
      requestedSum += req * price;
      const actual = Number(weightsByLineId?.[it.lineId]?.actualQuantity || 0);
      actualTotal += actual;
      actualSum += actual * price;
    }
    return { requestedTotal, actualTotal, requestedSum, actualSum };
  }, [items, weightsByLineId, removedLineIds]);

  /* ═══════════════════════════════════════════════════════════
     Auto-weigh from scale (core V6 feature)
     When an active item is on the scale and then removed,
     automatically save the weight and advance to the next item.
     ═══════════════════════════════════════════════════════════ */

  // Select an item for weighing (user clicks a card)
  const selectItemForWeighing = useCallback((idx) => {
    if (idx < 0 || idx >= items.length) return;
    const it = items[idx];
    if (!it || removedLineIds[it.lineId]) return;

    // Only clear editing if switching to a DIFFERENT item
    if (idx !== activeItemIndex) {
      setEditingLineId(null);
      setEditValue('');
    }
    setActiveItemIndex(idx);

    // Enable auto-weigh for unweighed non-package items (even if re-clicking same item)
    if (!weightsByLineId[it.lineId]?.actualQuantity && it.measurementType !== 'package') {
      autoWeighActiveRef.current = true;
      // Only reset peak if switching items (keep tracking if re-clicking same)
      if (idx !== activeItemIndex) prevStableRef.current = 0;
    } else {
      autoWeighActiveRef.current = false;
    }

    // Mark order as in_progress — but NOT if already completed/pending_sync (don't regress)
    if (selectedOrder && selectedOrder.status !== 'completed' && selectedOrder.status !== 'pending_sync') {
      const updated = upsertOrderWeighing({
        weekKey: selectedWeek,
        orderId: selectedOrder.id,
        patch: { status: 'in_progress' },
      });
      setWeighingState(updated);
      setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? { ...o, status: 'in_progress' } : o)));
    }
  }, [items, removedLineIds, weightsByLineId, selectedOrder, selectedWeek]);

  // Save weight for the currently active item and advance
  const saveWeightAndAdvance = useCallback((weightValue, src = 'scale') => {
    if (!selectedOrder || activeItemIndex < 0) return;
    const it = items[activeItemIndex];
    if (!it?.lineId) return;

    const rounded = Math.round(weightValue * 1000) / 1000;
    const nextWeights = {
      ...(weightsByLineId || {}),
      [it.lineId]: { actualQuantity: rounded, source: src },
    };
    const newStatus = getNextUnweighedIndex(items, nextWeights, removedLineIds) === -1 ? 'weighed' : 'in_progress';
    const updated = upsertOrderWeighing({
      weekKey: selectedWeek,
      orderId: selectedOrder.id,
      patch: { status: newStatus, weightsByLineId: nextWeights },
    });
    setWeighingState(updated);
    setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? { ...o, status: newStatus } : o)));

    showToast(t.autoSaved(rounded.toFixed(3)));

    // Advance to next unweighed item AFTER the current one (not from the start)
    const nextUnweighed = getNextUnweighedIndex(items, nextWeights, removedLineIds, activeItemIndex + 1);
    if (nextUnweighed >= 0) {
      setActiveItemIndex(nextUnweighed);
      autoWeighActiveRef.current = true;
      prevStableRef.current = 0;
    } else {
      autoWeighActiveRef.current = false;
    }
  }, [selectedOrder, activeItemIndex, items, weightsByLineId, removedLineIds, selectedWeek, showToast, t]);

  // Watch scale for auto-save trigger
  useEffect(() => {
    if (!scaleConnected || !autoWeighActiveRef.current) return;

    const stableVal = lastStableWeight?.value ?? 0;

    if (stableVal > WEIGHT_ON_THRESHOLD) {
      // Something on the scale — record the peak
      prevStableRef.current = stableVal;
    } else if (prevStableRef.current > WEIGHT_ON_THRESHOLD && stableVal < WEIGHT_OFF_THRESHOLD) {
      // Item was removed — save
      const toSave = prevStableRef.current;
      prevStableRef.current = 0;
      autoWeighActiveRef.current = false;
      saveWeightAndAdvance(toSave, 'scale');
    }
  }, [lastStableWeight, scaleConnected, saveWeightAndAdvance]);

  /* ═══════════════════════════════════════════════════════════
     Manual weight actions
     ═══════════════════════════════════════════════════════════ */

  const saveManualWeight = useCallback((lineId, value, src = 'manual') => {
    if (!selectedOrder || !lineId) return;
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return;

    const it = items.find((i) => i.lineId === lineId);
    const isPackage = it?.measurementType === 'package';
    const actual = isPackage ? Math.floor(n) : Math.round(n * 1000) / 1000;

    const nextWeights = {
      ...(weightsByLineId || {}),
      [lineId]: { actualQuantity: actual, source: src },
    };
    const newStatus = getNextUnweighedIndex(items, nextWeights, removedLineIds) === -1 ? 'weighed' : 'in_progress';
    const updated = upsertOrderWeighing({
      weekKey: selectedWeek,
      orderId: selectedOrder.id,
      patch: { status: newStatus, weightsByLineId: nextWeights },
    });
    setWeighingState(updated);
    setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? { ...o, status: newStatus } : o)));
    setEditingLineId(null);
    setEditValue('');

    showToast(t.autoSaved(actual.toFixed ? actual.toFixed(3) : String(actual)));

    // Auto-advance to next unweighed item AFTER the current one
    const currentIdx = items.findIndex((i) => i.lineId === lineId);
    const nextUnweighed = getNextUnweighedIndex(items, nextWeights, removedLineIds, (currentIdx >= 0 ? currentIdx + 1 : 0));
    if (nextUnweighed >= 0) {
      setActiveItemIndex(nextUnweighed);
      // Enable auto-weigh on the next item if scale is connected
      const nextIt = items[nextUnweighed];
      if (nextIt && nextIt.measurementType !== 'package') {
        autoWeighActiveRef.current = true;
        prevStableRef.current = 0;
      }
    } else {
      autoWeighActiveRef.current = false;
    }
  }, [selectedOrder, items, weightsByLineId, removedLineIds, selectedWeek, showToast, t]);

  const startEdit = (lineId, currentValue) => {
    setEditingLineId(lineId);
    setEditValue(currentValue != null ? String(currentValue) : '');
  };

  const cancelEdit = () => {
    setEditingLineId(null);
    setEditValue('');
  };

  /* ─── Reopen a completed order for editing ─── */
  const reopenOrder = async () => {
    if (!selectedOrder) return;
    const ok = await biConfirm({
      heText: 'להחזיר הזמנה זו למצב "בהכנה"?',
      thText: 'เปลี่ยนคำสั่งซื้อนี้กลับเป็น "กำลังดำเนินการ"?',
      title: 'warning',
    });
    if (!ok) return;
    const updated = upsertOrderWeighing({
      weekKey: selectedWeek,
      orderId: selectedOrder.id,
      patch: { status: 'in_progress' },
    });
    setWeighingState(updated);
    setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? { ...o, status: 'in_progress' } : o)));
  };

  /* ─── Use ordered quantities for all items ─── */
  const useOrderedQuantities = async () => {
    if (!selectedOrder || !items.length) return;
    const ok = await biConfirm({
      heText: 'למלא הכל לפי הכמות שהוזמנה? ידרוס שקילות קיימות.',
      thText: 'ใช้จำนวนที่สั่งทั้งหมด? จะแทนที่ค่าที่ชั่ง',
      title: 'warning',
    });
    if (!ok) return;
    const nextWeights = {};
    for (const it of items) {
      if (!it?.lineId) continue;
      nextWeights[it.lineId] = { actualQuantity: Number(it.requestedQuantity || 0), source: 'ordered_default' };
    }
    const updated = upsertOrderWeighing({
      weekKey: selectedWeek,
      orderId: selectedOrder.id,
      patch: { status: 'weighed', weightsByLineId: nextWeights },
    });
    setWeighingState(updated);
    setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? { ...o, status: 'weighed' } : o)));
  };

  /* ─── Remove / restore item ─── */
  const removeItem = (lineId) => {
    if (!selectedOrder || !lineId) return;
    const updated = upsertOrderWeighing({
      weekKey: selectedWeek,
      orderId: selectedOrder.id,
      patch: { removedLineIds: { ...removedLineIds, [lineId]: true } },
    });
    setWeighingState(updated);
  };

  const restoreItem = (lineId) => {
    if (!selectedOrder || !lineId) return;
    const newRemoved = { ...removedLineIds };
    delete newRemoved[lineId];
    const updated = upsertOrderWeighing({
      weekKey: selectedWeek,
      orderId: selectedOrder.id,
      patch: { removedLineIds: newRemoved },
    });
    setWeighingState(updated);
  };

  /* ═══════════════════════════════════════════════════════════
     Complete order (preserved from V5 — full invoice logic)
     With offline queue support
     ═══════════════════════════════════════════════════════════ */
  const completeOrder = async () => {
    if (!selectedOrder) return;
    if (!canComplete) {
      await biAlert({ heText: 'יש פריטים שלא נשקלו עדיין.', thText: 'ยังมีรายการที่ยังไม่ชั่ง', title: 'warning' });
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
      // Mark settling
      const updSettling = upsertOrderWeighing({ weekKey: selectedWeek, orderId: selectedOrder.id, patch: { status: 'settling' } });
      setWeighingState(updSettling);
      setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? { ...o, status: 'settling' } : o)));

      // Build final invoice lines (same as V5)
      const finalInvoiceLines = items
        .filter((it) => it.catalogNumber !== BUFFER_LINE_CATALOG_NUMBER && !removedLineIds[it.lineId])
        .map((it) => {
          const weighed = weightsByLineId[it.lineId];
          const actualQty = weighed?.actualQuantity ?? it.requestedQuantity;
          const linePrice = actualQty * (it.pricePerUnit || 0);
          const measurementType = it.measurementType || 'kg';
          const weighSource = weighed?.source || 'manual';
          return {
            lineId: it.lineId, productId: it.productId, productName: it.productName,
            catalogNumber: it.catalogNumber || '', vatType: it.vatType ?? 3,
            requestedQuantity: it.requestedQuantity, actualQuantity: actualQty,
            pricePerUnit: it.pricePerUnit || 0, linePrice, measurementType, weighSource,
          };
        });

      const finalSum = finalInvoiceLines.reduce((acc, li) => acc + li.linePrice, 0);

      // Build productData for Grow receipt (same as V5)
      const productDataForGrow = {};
      finalInvoiceLines.forEach((li, idx) => {
        let descriptionWithQty;
        if (li.measurementType === 'package') {
          descriptionWithQty = `${li.productName} ${Number(li.actualQuantity)} מארז`;
        } else if (li.measurementType === 'unit') {
          descriptionWithQty = `${li.productName} ${Number(li.actualQuantity).toFixed(3)} ק"ג`;
        } else {
          const usedOrdered = li.weighSource === 'ordered_default' || li.weighSource === 'package';
          descriptionWithQty = usedOrdered ? li.productName : `${li.productName} ${Number(li.actualQuantity).toFixed(3)} ק"ג`;
        }
        productDataForGrow[`productData[${idx}][catalogNumber]`] = li.catalogNumber;
        productDataForGrow[`productData[${idx}][quantity]`] = 1;
        productDataForGrow[`productData[${idx}][price]`] = li.linePrice;
        productDataForGrow[`productData[${idx}][itemDescription]`] = descriptionWithQty;
        productDataForGrow[`productData[${idx}][vatType]`] = li.vatType;
      });

      const payload = {
        orderId: selectedOrder.id, weightsByLineId, removedLineIds,
        finalInvoiceLines, finalSum, productDataForGrow,
      };

      console.log('=== handleSuspendedPayment DEBUG ===');
      console.log('payload:', payload);

      try {
        const res = await handleSuspendedPaymentV5(payload);
        console.log('handleSuspendedPayment response', res);

        // Mark completed
        const updCompleted = upsertOrderWeighing({ weekKey: selectedWeek, orderId: selectedOrder.id, patch: { status: 'completed' } });
        setWeighingState(updCompleted);
        setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? { ...o, status: 'completed' } : o)));
        await biAlert({ heText: 'הושלם! השרת אישר.', thText: 'เสร็จแล้ว! เซิร์ฟเวอร์ยืนยัน', title: 'success' });
      } catch (apiErr) {
        console.error('API call failed, saving to offline queue', apiErr);
        console.error('Server response data:', apiErr?.response?.data);
        console.error('Server response status:', apiErr?.response?.status);
        // Save to offline queue
        const queue = loadOfflineQueue();
        queue.push({ ...payload, weekKey: selectedWeek, queuedAt: new Date().toISOString() });
        saveOfflineQueue(queue);
        setOfflineQueue([...queue]);

        // Mark as pending_sync
        const updPending = upsertOrderWeighing({ weekKey: selectedWeek, orderId: selectedOrder.id, patch: { status: 'pending_sync' } });
        setWeighingState(updPending);
        setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? { ...o, status: 'pending_sync' } : o)));
        await biAlert({ heText: 'נשמר אופליין — יסונכרן כשהאינטרנט יחזור.', thText: 'บันทึกออฟไลน์ — จะซิงค์เมื่อมีเน็ต', title: 'warning' });
      }
    } catch (e) {
      console.error(e);
      const updRevert = upsertOrderWeighing({ weekKey: selectedWeek, orderId: selectedOrder.id, patch: { status: 'weighed' } });
      setWeighingState(updRevert);
      setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? { ...o, status: 'weighed' } : o)));
      await biAlert({ heText: 'שגיאה. אפשר לנסות שוב. בדוק קונסול.', thText: 'เกิดข้อผิดพลาด — ลองอีกครั้ง', title: 'error' });
    } finally {
      setLoading(false);
    }
  };

  /* ─── Sync offline queue ─── */
  const syncOfflineQueue = async () => {
    const queue = loadOfflineQueue();
    if (queue.length === 0) return;
    setSyncing(true);
    let ok = 0, fail = 0;
    const remaining = [];
    for (const entry of queue) {
      try {
        await handleSuspendedPaymentV5({
          orderId: entry.orderId, weightsByLineId: entry.weightsByLineId,
          removedLineIds: entry.removedLineIds, finalInvoiceLines: entry.finalInvoiceLines,
          finalSum: entry.finalSum, productDataForGrow: entry.productDataForGrow,
        });
        // Mark as completed in local storage
        const updCompleted = upsertOrderWeighing({ weekKey: entry.weekKey, orderId: entry.orderId, patch: { status: 'completed' } });
        if (entry.weekKey === selectedWeek) {
          setWeighingState(updCompleted);
          setOrders((prev) => prev.map((o) => (o.id === entry.orderId ? { ...o, status: 'completed' } : o)));
        }
        ok++;
      } catch (err) {
        console.error('Sync failed for', entry.orderId, err);
        console.error('Server response data:', err?.response?.data);
        console.error('Server response status:', err?.response?.status);
        remaining.push(entry);
        fail++;
      }
    }
    saveOfflineQueue(remaining);
    setOfflineQueue(remaining);
    setSyncing(false);
    let msg = '';
    if (ok > 0) msg += t.syncOk(ok);
    if (fail > 0) msg += (msg ? ' | ' : '') + t.syncFail(fail);
    if (msg) showToast(msg, 4000);
  };

  /* ─── Community / filter helpers ─── */
  const toggleCommunity = (community) => {
    setTempSelectedCommunities((prev) => {
      const next = new Set(prev);
      if (next.has(community)) next.delete(community); else next.add(community);
      return next;
    });
  };
  const selectAllCommunities = () => setTempSelectedCommunities(new Set(pickupSpots));
  const clearAllCommunities = () => setTempSelectedCommunities(new Set());

  const handleLoad = () => {
    setSelectedWeek(tempSelectedWeek);
    setSelectedCommunities(new Set(tempSelectedCommunities));
  };

  /* ─── Status badge ─── */
  const statusBadge = (status) => {
    const s = status || 'pending';
    const map = {
      pending: { label: t.stPending, cls: 'bg-gray-100 text-gray-800 border-gray-300' },
      in_progress: { label: t.stInProgress, cls: 'bg-blue-100 text-blue-800 border-blue-300' },
      weighed: { label: t.stWeighed, cls: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
      settling: { label: t.stSettling, cls: 'bg-purple-100 text-purple-800 border-purple-300' },
      completed: { label: t.stCompleted, cls: 'bg-green-100 text-green-800 border-green-300' },
      pending_sync: { label: t.stPendingSync, cls: 'bg-orange-100 text-orange-800 border-orange-300' },
    };
    const m = map[s] || map.pending;
    return <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${m.cls}`}>{m.label}</span>;
  };

  /* ─── Item display name ─── */
  const itemDisplayName = (it) => (lang === 'th' && it.thaiName) ? it.thaiName : it.productName;
  const itemSecondaryName = (it) => (lang === 'th' && it.thaiName) ? it.productName : it.thaiName;

  /* ═══════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════ */

  if (loading && orders.length === 0) return <LoadingSpinner />;
  if (error && orders.length === 0) return <div className="p-8 text-center text-red-600 text-lg font-bold">{error}</div>;

  return (
    <div className={`min-h-screen bg-gray-100 ${isRTL ? 'text-right' : 'text-left'}`} dir={isRTL ? 'rtl' : 'ltr'}>

      {/* ─── Toast notification ─── */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-gray-900 text-white px-6 py-3 rounded-xl shadow-2xl text-sm font-bold animate-bounce">
          {toast}
        </div>
      )}

      {/* ═══ TOP BAR ═══ */}
      <div className="bg-white border-b shadow-sm px-4 py-3">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-gray-900">{t.title}</h1>
            <p className="text-xs text-gray-500">{t.subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Offline queue indicator */}
            {offlineQueue.length > 0 && (
              <button
                onClick={syncOfflineQueue}
                disabled={syncing}
                className="flex items-center gap-2 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-lg text-sm"
              >
                <span className="bg-white text-orange-600 rounded-full w-6 h-6 flex items-center justify-center text-xs font-black">
                  {offlineQueue.length}
                </span>
                {syncing ? t.syncingLabel : t.syncNow}
              </button>
            )}
            {/* Online/Offline indicator */}
            <div className={`w-3 h-3 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} title={isOnline ? 'Online' : 'Offline'} />
            {/* Language toggle */}
            <button
              onClick={toggleLang}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-sm transition-colors"
            >
              {t.switchLang}
            </button>
            {/* Scale toggle */}
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

      {/* ═══ SCALE PANEL ═══ */}
      {showScalePanel && (
        <div className="bg-white border-b px-4 py-3">
          <div className="max-w-[1600px] mx-auto">
            <ScaleConnectionPanel className="max-w-md" />
          </div>
        </div>
      )}

      {/* ═══ FILTERS ═══ */}
      <div className="bg-white border-b px-4 py-4">
        <div className="max-w-[1600px] mx-auto">
          <div className="flex flex-wrap items-end gap-4">
            {/* Week */}
            <div className="min-w-[200px]">
              <label className="block text-xs font-bold text-gray-600 mb-1">{t.week}</label>
              <select
                value={tempSelectedWeek}
                onChange={(e) => setTempSelectedWeek(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                {availableWeeks.map((wk) => (
                  <option key={wk} value={wk}>{weekKeyToRangeLabel(wk)}</option>
                ))}
              </select>
            </div>

            {/* Communities */}
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
                    {pickupSpots.map((spot) => (
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

            {/* Load button */}
            <button
              onClick={handleLoad}
              disabled={loading}
              className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-sm shadow transition-colors disabled:opacity-50"
            >
              {loading ? '...' : t.load}
            </button>
          </div>

          {selectedWeek && (
            <div className="mt-2 text-xs text-gray-500">
              {t.weekLabel} <span className="font-bold">{weekKeyToRangeLabel(selectedWeek)}</span>
              {selectedCommunities.size > 0 && (
                <> — {t.commLabel} <span className="font-bold">{Array.from(selectedCommunities).join(', ')}</span></>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ═══ MAIN LAYOUT ═══ */}
      <div className="max-w-[1600px] mx-auto p-4">
        <div className="flex flex-col lg:flex-row gap-4">

          {/* ──────── LEFT: ORDER LIST ──────── */}
          <div className="lg:w-[340px] flex-shrink-0">
            <div className="bg-white rounded-xl shadow-sm overflow-hidden sticky top-4">
              {/* Header */}
              <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
                <span className="font-bold text-gray-900">{t.orders}</span>
                <div className="flex items-center gap-2">
                  {(() => {
                    const pendingCount = orders.filter((o) => o.status !== 'completed' && o.status !== 'pending_sync').length;
                    const doneCount = orders.filter((o) => o.status === 'completed' || o.status === 'pending_sync').length;
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
                            title={showCompleted ? 'Hide completed / ซ่อนที่เสร็จแล้ว' : 'Show completed / แสดงที่เสร็จแล้ว'}
                          >
                            {doneCount} &#10003;
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Community filter tabs with reorder arrows */}
              {orderCommunities.length > 0 && (
                <div className="px-3 py-2 border-b">
                  <div className="flex flex-wrap gap-1 items-center">
                    <button
                      onClick={() => setCommunityFilter('__all__')}
                      className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                        communityFilter === '__all__' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {t.allFilter} ({orders.length})
                    </button>
                    {orderCommunities.map((c, ci) => {
                      const count = orders.filter((o) => (o?.customerDetails?.pickupSpot || o?.pickupSpot) === c).length;
                      const isFirst = ci === 0;
                      const isLast = ci === orderCommunities.length - 1;
                      return (
                        <div key={c} className="flex items-center gap-0.5">
                          {/* Move left/up arrow */}
                          {!isFirst && (
                            <button
                              onClick={(e) => { e.stopPropagation(); moveCommunity(c, -1); }}
                              className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors text-xs"
                              title={isRTL ? 'Move right' : 'Move left'}
                            >
                              {isRTL ? '\u25B6' : '\u25C0'}
                            </button>
                          )}
                          <button
                            onClick={() => setCommunityFilter(c)}
                            className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                              communityFilter === c ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            <span className="font-black mr-1 text-[10px] opacity-60">{ci + 1}.</span>{c} ({count})
                          </button>
                          {/* Move right/down arrow */}
                          {!isLast && (
                            <button
                              onClick={(e) => { e.stopPropagation(); moveCommunity(c, 1); }}
                              className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors text-xs"
                              title={isRTL ? 'Move left' : 'Move right'}
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

              {/* Order list */}
              <div className="divide-y max-h-[calc(100vh-280px)] overflow-y-auto">
                {filteredOrders.length === 0 && (
                  <div className="p-6 text-center text-gray-400 text-sm">{t.noOrders}</div>
                )}
                {filteredOrders.map((o) => {
                  const isActive = o.id === selectedOrderId;
                  const cid = o?.customerDetails?.phone || o?.customerDetails?.email || null;
                  const custNum = cid && permanentNumbersMap[cid] ? permanentNumbersMap[cid] : '-';
                  const oItems = Array.isArray(o.items) ? o.items.length : 0;
                  const isDone = o.status === 'completed' || o.status === 'pending_sync';
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
                        {/* Customer number circle — blue if selected, green+check if done, yellow default */}
                        <div className={`relative w-10 h-10 rounded-full font-black flex items-center justify-center text-lg flex-shrink-0 ${
                          isDone ? 'bg-green-500 text-white' : isActive ? 'bg-blue-600 text-white ring-2 ring-blue-300' : 'bg-yellow-500 text-white'
                        }`}>
                          {isDone ? (
                            <span className="text-xl leading-none">&#10003;</span>
                          ) : (
                            custNum
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`font-bold text-sm truncate ${isDone ? 'text-green-800 line-through' : isActive ? 'text-blue-900' : 'text-gray-900'}`}>
                            {o.customerDetails?.name || t.customer}
                          </div>
                          <div className={`text-[11px] truncate ${isDone ? 'text-green-600' : isActive ? 'text-blue-700' : 'text-gray-500'}`}>
                            {o.customerDetails?.pickupSpot || o.pickupSpot || ''} {o.customerDetails?.phone ? `• ${o.customerDetails.phone}` : ''}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {statusBadge(o.status)}
                          <span className={`text-[11px] ${isDone ? 'text-green-500' : 'text-gray-400'}`}>{oItems} {t.items}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ──────── RIGHT: ORDER WORKSPACE ──────── */}
          <div className="flex-1 min-w-0">
            {!selectedOrder ? (
              <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400 text-lg">{t.pickOrder}</div>
            ) : (
              <div className="space-y-4">
                {/* ── Customer header ── */}
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
                        <div className="text-xs text-gray-500">
                          {t.community}: <span className="font-bold">{selectedOrder.customerDetails?.pickupSpot || selectedOrder.pickupSpot}</span>
                          {selectedOrder.customerDetails?.phone && <> • {t.phone}: <span className="font-bold">{selectedOrder.customerDetails.phone}</span></>}
                        </div>
                      </div>
                      <div className="ml-2">{statusBadge(selectedOrder.status)}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {/* Reopen button — only for completed / pending_sync orders */}
                      {(selectedOrder.status === 'completed' || selectedOrder.status === 'pending_sync') && (
                        <button
                          onClick={reopenOrder}
                          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg text-sm shadow transition-colors"
                        >
                          {t.reopenOrder}
                        </button>
                      )}
                      <button
                        onClick={useOrderedQuantities}
                        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-lg text-sm border transition-colors"
                      >
                        {t.useOrderedQty}
                      </button>
                      <button
                        onClick={completeOrder}
                        disabled={!canComplete || selectedOrder.status === 'completed' || selectedOrder.status === 'pending_sync'}
                        className={`px-5 py-2 font-bold rounded-lg text-sm transition-colors ${
                          !canComplete || selectedOrder.status === 'completed' || selectedOrder.status === 'pending_sync'
                            ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                            : 'bg-green-600 hover:bg-green-700 text-white shadow'
                        }`}
                      >
                        {t.completeBtn}
                      </button>
                    </div>
                  </div>

                  {/* Scale status bar (inline) */}
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

                {/* ── Totals ── */}
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

                {/* ── Items header ── */}
                <div className="flex items-center justify-between">
                  <h2 className="font-black text-gray-800">
                    {t.itemsLabel(activeItems.length, items.length)}
                  </h2>
                </div>

                {/* ── Items GRID ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {items.map((it, idx) => {
                    const weighed = weightsByLineId?.[it.lineId];
                    const weighedQty = weighed?.actualQuantity;
                    const isRemoved = !!removedLineIds[it.lineId];
                    const isNext = nextIdx === idx;
                    const isActive = activeItemIndex === idx;
                    const isEditing = editingLineId === it.lineId;
                    const displayName = itemDisplayName(it);
                    const secondaryName = itemSecondaryName(it);
                    const isPackage = it.measurementType === 'package';
                    const isUnit = it.measurementType === 'unit';
                    const reqQty = Number(it.requestedQuantity || 0);
                    const showQtyBadge = reqQty > 1;

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
                        {/* ── Quantity badge (prominent when qty > 1) ── */}
                        {showQtyBadge && !isRemoved && (
                          <div className="absolute top-2 right-2 z-10">
                            <div className="bg-red-600 text-white font-black rounded-full min-w-[36px] h-9 flex items-center justify-center px-2 text-lg shadow-lg border-2 border-white">
                              {t.qtyBadge}{isPackage || isUnit ? Math.floor(reqQty) : reqQty}
                            </div>
                          </div>
                        )}

                        {/* ── "Next" / "Removed" badge ── */}
                        {!isRemoved && isNext && !isActive && (
                          <div className={`absolute top-2 ${showQtyBadge ? (isRTL ? 'right-14' : 'left-2') : (isRTL ? 'right-2' : 'left-2')} z-10`}>
                            <span className="bg-yellow-400 text-yellow-900 font-bold text-[11px] px-2 py-0.5 rounded-full">{t.next}</span>
                          </div>
                        )}
                        {isRemoved && (
                          <div className="absolute top-2 left-2 z-10">
                            <span className="bg-red-500 text-white font-bold text-[11px] px-2 py-0.5 rounded-full">{t.removedLabel}</span>
                          </div>
                        )}

                        {/* ── Product image ── */}
                        <div className="flex justify-center pt-4 pb-2 px-4">
                          {it.images && it.images.length > 0 ? (
                            <img
                              src={it.images[0]}
                              alt={displayName}
                              className={`w-28 h-28 rounded-xl object-cover border border-gray-200 ${isRemoved ? 'grayscale' : ''}`}
                            />
                          ) : (
                            <div className="w-28 h-28 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-300 text-3xl">
                              ?
                            </div>
                          )}
                        </div>

                        {/* ── Product info ── */}
                        <div className="px-4 pb-2">
                          <div className={`font-bold text-sm leading-tight ${isRemoved ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                            {displayName}
                          </div>
                          {secondaryName && (
                            <div className={`text-[11px] mt-0.5 ${isRemoved ? 'text-gray-300' : 'text-gray-500'}`}>{secondaryName}</div>
                          )}
                          {/* Ordered info */}
                          <div className={`text-xs mt-2 ${isRemoved ? 'text-gray-400' : 'text-gray-600'}`}>
                            <span className="font-bold">{t.ordered}: </span>
                            {isPackage ? (
                              <><span className="font-black text-base">{Math.floor(reqQty)}</span> {t.pkgLbl} • {t.perPkg} {Number(it.pricePerUnit || 0).toFixed(2)}</>
                            ) : isUnit ? (
                              <><span className="font-black text-base">{Math.floor(reqQty)}</span> {t.unitLbl} • {t.perKg} {Number(it.pricePerUnit || 0).toFixed(2)}</>
                            ) : (
                              <>
                                <span className="font-black text-base">{reqQty.toFixed(3)}</span> {t.kg} • {t.perKg} {Number(it.pricePerUnit || 0).toFixed(2)}
                                {it.unitSize && it.unitSize !== 1 && (
                                  <span className="text-gray-400 ml-1">({Math.round(reqQty / it.unitSize)} x {it.unitSize})</span>
                                )}
                              </>
                            )}
                          </div>
                        </div>

                        {/* ── Weight display / Live scale / Edit ── */}
                        <div className="px-4 pb-3 border-t border-gray-100 pt-2">
                          {isRemoved ? (
                            /* ── Removed item: restore button ── */
                            <button
                              onClick={(e) => { e.stopPropagation(); restoreItem(it.lineId); }}
                              className="w-full py-1.5 text-xs font-bold rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                            >
                              {t.restore}
                            </button>
                          ) : (
                            <div onClick={(e) => e.stopPropagation()}>
                              {/* ── Live scale readout (always visible when active + scale connected + not package) ── */}
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

                              {/* ── Saved weight status ── */}
                              {weighedQty && !isEditing && (
                                <div className="flex items-center justify-between mb-2">
                                  <div>
                                    <div className="text-[11px] text-gray-500 font-bold">{t.weighed}:</div>
                                    <div className="text-lg font-black text-green-700">
                                      {isPackage
                                        ? `${Math.floor(weighedQty)} ${t.pkgLbl}`
                                        : `${Number(weighedQty).toFixed(3)} ${t.kg}`}
                                    </div>
                                    {weighed?.source && (
                                      <div className="text-[10px] text-gray-400">{sourceLabel(weighed.source, t)}</div>
                                    )}
                                  </div>
                                  <span className="text-green-600 text-xl font-black">&#10003;</span>
                                </div>
                              )}

                              {/* ── Not weighed label (when not active and no weight yet) ── */}
                              {!weighedQty && !isActive && !isEditing && (
                                <div className="mb-2">
                                  <div className="text-[11px] text-gray-500 font-bold">{t.weighed}:</div>
                                  <div className="text-lg font-black text-gray-400">
                                    {isPackage ? t.notConfirmed : t.notWeighed}
                                  </div>
                                </div>
                              )}

                              {/* ── Inline edit / manual input ── */}
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
                                    className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700"
                                  >
                                    {t.save}
                                  </button>
                                  <button
                                    onClick={cancelEdit}
                                    className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-300"
                                  >
                                    {t.cancel}
                                  </button>
                                </div>
                              ) : isActive && !weighedQty && !isPackage ? (
                                /* Active + not weighed + not package: auto-open edit input for manual entry */
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
                                      }
                                    }}
                                    disabled={!editValue && !(scaleConnected && ((liveWeight?.stable && liveWeight.value > WEIGHT_ON_THRESHOLD) || (lastStableWeight?.value > WEIGHT_ON_THRESHOLD)))}
                                    className={`px-4 py-2 rounded-lg text-sm font-bold ${
                                      editValue
                                        ? 'bg-green-600 text-white hover:bg-green-700'
                                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                    }`}
                                  >
                                    OK
                                  </button>
                                </div>
                              ) : null}

                              {/* ── Action buttons ── */}
                              <div className="flex gap-2">
                                {/* Package confirm button */}
                                {isPackage && !weighedQty && (
                                  <button
                                    onClick={() => saveManualWeight(it.lineId, reqQty, 'package')}
                                    className="flex-1 text-xs font-bold py-1.5 rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors"
                                  >
                                    {t.ordered}: {Math.floor(reqQty)} {t.pkgLbl}
                                  </button>
                                )}
                                {/* Edit button (always available unless already editing) */}
                                {!isEditing && !(isActive && !weighedQty && !isPackage) && (
                                  <button
                                    onClick={() => startEdit(it.lineId, weighedQty)}
                                    className="flex-1 text-xs font-bold py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                                  >
                                    {t.edit}
                                  </button>
                                )}
                                {/* Remove button */}
                                <button
                                  onClick={async () => {
                                    const ok = await biConfirm({
                                      heText: `להסיר "${displayName}" מההזמנה?`,
                                      thText: `ลบ "${displayName}" ออก?`,
                                      title: 'warning',
                                    });
                                    if (ok) removeItem(it.lineId);
                                  }}
                                  className="text-xs font-bold py-1.5 px-3 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
                                >
                                  {t.remove}
                                </button>
                              </div>
                            </div>
                          )}
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

      {/* ─── Bilingual Dialog (replaces window.confirm / alert) ─── */}
      <BilingualDialog
        open={!!dialog}
        title={dialog?.title}
        heText={dialog?.heText}
        thText={dialog?.thText}
        type={dialog?.type}
        onConfirm={() => closeDialog(true)}
        onCancel={() => closeDialog(dialog?.type === 'alert' ? undefined : false)}
      />
    </div>
  );
}
