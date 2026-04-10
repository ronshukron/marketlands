import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc, runTransaction } from 'firebase/firestore';
import { db } from '../../../firebase/firebase';
import { useAuth } from '../../../contexts/authContext';
import LoadingSpinner from '../../LoadingSpinner';
import { pickupSpots } from '../../../data/pickupSpots';
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
  alignItemsWithDraft,
  buildSettlementPayload,
  getNextUnweighedIndex,
  mergeProductDetailsIntoItems,
  weekKeyToRangeLabel,
} from './v7/orderDraftUtils';

const ADMIN_UIDS = ['rfHOLhNoJOW8ByNypCtm3hlSNKs2'];
const WEIGHT_ON_THRESHOLD = 0.020;
const WEIGHT_OFF_THRESHOLD = 0.010;
const LANG_STORAGE_KEY = 'deliveryV7::lang';
const COMMUNITY_ORDER_KEY = 'deliveryV7::communityOrder';

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
    deleteLineConfirm: (n) => `למחוק את "${n}" מההזמנה?`,
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
    deleteLineConfirm: (n) => `ลบ "${n}" ออกจากคำสั่งซื้อ?`,
  },
};

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

function parseOrderCreatedAt(order) {
  const candidates = [order?.createdAtIso, order?.createdAt, order?.createdDate];
  for (const value of candidates) {
    if (!value) continue;
    const d = value instanceof Date ? value : new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function normalizeSpecificDateRange(startStr, endStr) {
  const hasAny = Boolean(startStr || endStr);
  if (!hasAny) return null;
  const rawStart = startStr || endStr;
  const rawEnd = endStr || startStr;
  const start = new Date(rawStart);
  const end = new Date(rawEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  if (start <= end) return { start, end };
  return { start: end, end: start };
}

function filterOrdersBySpecificDates(orders = [], startStr, endStr) {
  const range = normalizeSpecificDateRange(startStr, endStr);
  if (!range) return orders;
  return (orders || []).filter((order) => {
    const createdAt = parseOrderCreatedAt(order);
    if (!createdAt) return false;
    return createdAt >= range.start && createdAt <= range.end;
  });
}

function getDisplayName(user) {
  return user?.displayName || user?.email || user?.phoneNumber || 'Admin';
}

function getEffectiveOrderStatus(order, draft) {
  if (!order) return 'pending';
  if (order.status === 'completed') return 'completed';
  return draft?.status || order.status || 'pending';
}

export default function DeliveryManagementV7() {
  const { currentUser, userRole } = useAuth();

  const [lang, setLang] = useState(() => localStorage.getItem(LANG_STORAGE_KEY) || 'he');
  const t = TR[lang] || TR.he;
  const isRTL = lang === 'he';
  const toggleLang = () => {
    const next = lang === 'he' ? 'th' : 'he';
    setLang(next);
    localStorage.setItem(LANG_STORAGE_KEY, next);
  };

  const stationId = useMemo(() => getOrCreateStationIdV7(), []);
  const session = useMemo(() => ({
    stationId,
    userId: currentUser?.uid || '',
    userName: getDisplayName(currentUser),
    sessionId: buildSessionIdV7({ userId: currentUser?.uid, stationId }),
  }), [currentUser, stationId]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [availableWeeks, setAvailableWeeks] = useState([]);
  const [tempSelectedWeek, setTempSelectedWeek] = useState('');
  const [selectedWeek, setSelectedWeek] = useState('');
  const [tempSpecificStartDate, setTempSpecificStartDate] = useState('');
  const [tempSpecificEndDate, setTempSpecificEndDate] = useState('');
  const [selectedSpecificStartDate, setSelectedSpecificStartDate] = useState('');
  const [selectedSpecificEndDate, setSelectedSpecificEndDate] = useState('');
  const [showCommunityDropdown, setShowCommunityDropdown] = useState(false);
  const communityDropdownRef = useRef(null);
  const [tempSelectedCommunities, setTempSelectedCommunities] = useState(new Set());
  const [selectedCommunities, setSelectedCommunities] = useState(new Set());

  const [orders, setOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [activeItemIndex, setActiveItemIndex] = useState(-1);
  const [productDetails, setProductDetails] = useState({});
  const productDetailsRef = useRef({});
  const [permanentNumbersMap, setPermanentNumbersMap] = useState({});
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
  const [communityOrder, setCommunityOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem(COMMUNITY_ORDER_KEY) || '[]'); } catch { return []; }
  });
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = useCallback((msg, dur = 2500) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), dur);
  }, []);
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
  const biConfirm = useCallback(({ heText, thText, title = 'warning' }) => showDialog({ heText, thText, title, type: 'confirm' }), [showDialog]);
  const biAlert = useCallback(({ heText, thText, title = 'info' }) => showDialog({ heText, thText, title, type: 'alert' }), [showDialog]);
  const itemRefs = useRef({});

  const [presence, setPresence] = useState([]);
  const [claimsByOrder, setClaimsByOrder] = useState({});
  const [draftsByOrder, setDraftsByOrder] = useState({});
  const [savingActionKey, setSavingActionKey] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [addQuantities, setAddQuantities] = useState({});

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
    if (activeItemIndex >= 0 && itemRefs.current[activeItemIndex]) {
      itemRefs.current[activeItemIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeItemIndex]);

  useEffect(() => {
    if (!isAdmin) {
      setError(t.noPermission);
      setLoading(false);
      return;
    }
    let active = true;
    fetchAvailableDeliveryWeeksV7()
      .then((weeks) => {
        if (!active) return;
        setAvailableWeeks(weeks);
        if (weeks.length > 0) setTempSelectedWeek(weeks[0]);
      })
      .catch((e) => {
        console.error(e);
        if (active) setError(t.failWeeks);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [isAdmin, t.failWeeks, t.noPermission]);

  const fetchPermanentCustomerNumbers = useCallback(async (customersList) => {
    if (!customersList || customersList.length === 0) return {};
    const mapping = {};
    const missing = [];
    await Promise.all(customersList.map(async (customer) => {
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
  }, []);

  useEffect(() => {
    if (!selectedWeek) return () => {};
    setLoading(true);
    const unsubscribe = subscribeDelayedOrdersForWeekV7({
      weekKey: selectedWeek,
      communities: Array.from(selectedCommunities),
      startDate: selectedSpecificStartDate,
      endDate: selectedSpecificEndDate,
      onOrders: async ({ allOrders }) => {
        try {
          const dateFilteredOrders = filterOrdersBySpecificDates(
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
            missingProductIds.length > 0 ? fetchProductDetailsV7(missingProductIds) : {},
            fetchPermanentCustomerNumbers(customersList),
          ]);
          if (Object.keys(newPd).length > 0) {
            const merged = { ...productDetailsRef.current, ...newPd };
            productDetailsRef.current = merged;
            setProductDetails(merged);
          }
          setPermanentNumbersMap(nums);
          setOrders(dateFilteredOrders);
          setError(null);
          setCommunityFilter('__all__');
          setSelectedOrderId((prev) => {
            if (prev && dateFilteredOrders.some((o) => o.id === prev)) return prev;
            const firstPending = dateFilteredOrders.find((o) => o.status !== 'completed');
            return firstPending ? firstPending.id : (dateFilteredOrders[0]?.id || null);
          });
        } catch (e) {
          console.error(e);
          setError(t.failOrders);
        } finally {
          setLoading(false);
        }
      },
      onError: (e) => {
        console.error(e);
        setError(t.failOrders);
        setLoading(false);
      },
    });
    return unsubscribe;
  }, [
    selectedWeek,
    selectedCommunities,
    selectedSpecificStartDate,
    selectedSpecificEndDate,
    fetchPermanentCustomerNumbers,
    t.failOrders,
  ]);

  useEffect(() => {
    if (!selectedWeek) return () => {};
    const unsubPresence = subscribePresenceV7({ weekKey: selectedWeek, onData: setPresence, onError: console.error });
    const unsubClaims = subscribeClaimsV7({ weekKey: selectedWeek, onData: setClaimsByOrder, onError: console.error });
    const unsubDrafts = subscribeDraftsV7({ weekKey: selectedWeek, onData: setDraftsByOrder, onError: console.error });
    return () => {
      unsubPresence();
      unsubClaims();
      unsubDrafts();
    };
  }, [selectedWeek]);

  useEffect(() => {
    if (!selectedWeek || !session.sessionId) return () => {};
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
  }, [selectedWeek, selectedOrderId, session]);

  useEffect(() => {
    if (!selectedWeek || !selectedOrderId || !session.sessionId) return;
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
  }, [selectedWeek, selectedOrderId, session]);

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

  const imageBlobCacheRef = useRef({});
  const [, setImageCacheTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const urls = Object.values(productDetails || {})
      .map((pd) => pd?.images?.[0])
      .filter((url) => url && !imageBlobCacheRef.current[url]);
    if (urls.length === 0) return;
    (async () => {
      let added = 0;
      for (const url of urls) {
        if (cancelled || imageBlobCacheRef.current[url]) continue;
        try {
          const resp = await fetch(url);
          if (!resp.ok) continue;
          const blob = await resp.blob();
          if (cancelled) break;
          imageBlobCacheRef.current[url] = URL.createObjectURL(blob);
          added += 1;
        } catch (_) { /* skip failed fetches */ }
      }
      if (!cancelled && added > 0) setImageCacheTick((v) => v + 1);
    })();
    return () => { cancelled = true; };
  }, [productDetails]);
  const cachedImg = useCallback((url) => imageBlobCacheRef.current[url] || url, []);

  const selectedOrder = useMemo(() => orders.find((o) => o.id === selectedOrderId) || null, [orders, selectedOrderId]);
  const effectiveDraftsByOrder = draftsByOrder || {};
  const selectedOrderSaved = useMemo(() => (
    selectedWeek && selectedOrderId
      ? (effectiveDraftsByOrder[selectedOrderId] || {})
      : {}
  ), [effectiveDraftsByOrder, selectedWeek, selectedOrderId]);
  const weightsByLineId = selectedOrderSaved.weightsByLineId || {};
  const removedLineIds = selectedOrderSaved.removedLineIds || {};
  const selectedClaim = selectedOrderId ? claimsByOrder[selectedOrderId] : null;
  const myClaim = useMemo(() => Object.values(claimsByOrder).find((c) => c?.sessionId === session.sessionId) || null, [claimsByOrder, session.sessionId]);
  const claimedByOther = !!(selectedClaim && selectedClaim.sessionId !== session.sessionId && !isClaimStaleV7(selectedClaim));

  const items = useMemo(() => {
    const base = selectedOrder?.items || [];
    const merged = mergeProductDetailsIntoItems(base, productDetails);
    const aligned = alignItemsWithDraft(merged, selectedOrderSaved);
    return [...aligned].sort((a, b) => {
      const nameA = (a.productName || a.name || '').toLowerCase();
      const nameB = (b.productName || b.name || '').toLowerCase();
      if (nameA !== nameB) return nameA.localeCompare(nameB);
      return (a.lineId || '').localeCompare(b.lineId || '');
    });
  }, [selectedOrder, productDetails, selectedOrderSaved]);

  const activeItems = useMemo(() => items.filter((it) => !removedLineIds[it.lineId]), [items, removedLineIds]);
  const nextIdx = useMemo(() => getNextUnweighedIndex(items, weightsByLineId, removedLineIds, 0), [items, weightsByLineId, removedLineIds]);
  const canComplete = activeItems.length > 0 && nextIdx === -1;

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

  useEffect(() => {
    if (orderCommunities.length === 0) return;
    const saved = communityOrder.filter((c) => orderCommunities.includes(c));
    const newOnes = orderCommunities.filter((c) => !saved.includes(c));
    const merged = [...saved, ...newOnes];
    if (JSON.stringify(merged) !== JSON.stringify(communityOrder)) {
      setCommunityOrder(merged);
      localStorage.setItem(COMMUNITY_ORDER_KEY, JSON.stringify(merged));
    }
  }, [orderCommunities, communityOrder]);

  const moveCommunity = useCallback((community, direction) => {
    setCommunityOrder((prev) => {
      const arr = [...prev];
      const idx = arr.indexOf(community);
      if (idx < 0) return arr;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= arr.length) return arr;
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      localStorage.setItem(COMMUNITY_ORDER_KEY, JSON.stringify(arr));
      return arr;
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

  useEffect(() => {
    if (!selectedOrder) {
      setActiveItemIndex(-1);
      return;
    }
    const suggested = nextIdx >= 0 ? nextIdx : 0;
    setActiveItemIndex(suggested);
    autoWeighActiveRef.current = false;
    prevStableRef.current = 0;
  }, [selectedOrderId, nextIdx, selectedOrder]);

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
    await saveOrderDraftV7({
      weekKey: selectedWeek,
      orderId: selectedOrder.id,
      draftPatch: patch,
      session,
    });
  }, [selectedOrder, selectedWeek, session]);

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
    await setDraftLineWeightV7({
      weekKey: selectedWeek,
      orderId: selectedOrder.id,
      lineId: it.lineId,
      actualQuantity: rounded,
      source: src,
      status: newStatus,
      session,
    });
    showToast(t.autoSaved(rounded.toFixed(3)));
    autoWeighActiveRef.current = false;
  }, [selectedOrder, activeItemIndex, claimedByOther, items, weightsByLineId, removedLineIds, selectedWeek, session, showToast, t]);

  useEffect(() => {
    if (!scaleConnected || !autoWeighActiveRef.current || claimedByOther) return;
    const stableVal = lastStableWeight?.value ?? 0;
    if (stableVal > WEIGHT_ON_THRESHOLD) {
      prevStableRef.current = stableVal;
    } else if (prevStableRef.current > WEIGHT_ON_THRESHOLD && stableVal < WEIGHT_OFF_THRESHOLD) {
      const toSave = prevStableRef.current;
      prevStableRef.current = 0;
      autoWeighActiveRef.current = false;
      saveWeightAndAdvance(toSave, 'scale');
    }
  }, [lastStableWeight, scaleConnected, saveWeightAndAdvance, claimedByOther]);

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
      await setDraftLineWeightV7({
        weekKey: selectedWeek,
        orderId: selectedOrder.id,
        lineId,
        actualQuantity: actual,
        source: src,
        status: newStatus,
        session,
      });
      setEditingLineId(null);
      setEditValue('');
      showToast(t.autoSaved(actual.toFixed ? actual.toFixed(3) : String(actual)));
      autoWeighActiveRef.current = false;
    } finally {
      setSavingActionKey('');
    }
  }, [selectedOrder, claimedByOther, items, weightsByLineId, removedLineIds, selectedWeek, session, biConfirm, showToast, t]);

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
    await bulkSetDraftWeightsV7({
      weekKey: selectedWeek,
      orderId: selectedOrder.id,
      weightsByLineId: nextWeights,
      status: 'weighed',
      session,
    });
  };

  const removeItem = async (lineId) => {
    if (!selectedOrder || !lineId || claimedByOther) return;
    await setDraftLineRemovedV7({
      weekKey: selectedWeek,
      orderId: selectedOrder.id,
      lineId,
      removed: true,
      session,
    });
  };

  const restoreItem = async (lineId) => {
    if (!selectedOrder || !lineId || claimedByOther) return;
    await setDraftLineRemovedV7({
      weekKey: selectedWeek,
      orderId: selectedOrder.id,
      lineId,
      removed: false,
      session,
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
    await clearDraftLineWeightV7({
      weekKey: selectedWeek,
      orderId: selectedOrder.id,
      lineId,
      status: newStatus,
      session,
    });
    const it = items.find((i) => i.lineId === lineId);
    if (it && it.measurementType !== 'package') {
      autoWeighActiveRef.current = true;
      prevStableRef.current = 0;
    }
  }, [selectedOrder, claimedByOther, weightsByLineId, items, removedLineIds, selectedWeek, session]);

  const claimSelectedOrder = useCallback(async () => {
    if (!selectedOrder || !selectedWeek) return;
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
  }, [selectedOrder, selectedWeek, session, showToast, t.orderClaimedOk, biAlert]);

  const releaseSelectedOrder = useCallback(async () => {
    if (!selectedOrder || !selectedWeek) return;
    setSavingActionKey(`release:${selectedOrder.id}`);
    try {
      await releaseOrderClaimV7({ weekKey: selectedWeek, orderId: selectedOrder.id, session });
      showToast(t.orderReleasedOk);
    } catch (e) {
      console.error(e);
    } finally {
      setSavingActionKey('');
    }
  }, [selectedOrder, selectedWeek, session, showToast, t.orderReleasedOk]);

  const savePriceEdit = useCallback(async (item) => {
    if (!selectedOrder || claimedByOther) return;
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
  }, [selectedOrder, claimedByOther, editPriceValue, session, showToast, t.priceUpdatedOk, biAlert]);

  const addProductToOrder = useCallback(async (product) => {
    if (!selectedOrder || claimedByOther) return;
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
  }, [selectedOrder, claimedByOther, addQuantities, session, showToast, t.addItemOk, biAlert]);

  const deleteLine = useCallback(async (item) => {
    if (!selectedOrder || claimedByOther) return;
    const ok = await biConfirm({
      heText: TR.he.deleteLineConfirm(item.productName),
      thText: TR.th.deleteLineConfirm(item.productName),
      title: 'warning',
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
  }, [selectedOrder, claimedByOther, session, biConfirm, biAlert]);

  const completeOrder = async () => {
    if (!selectedOrder) return;
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
      await saveDraftPatch({ status: 'settling' });
      const payload = buildSettlementPayload({
        selectedOrder,
        items,
        draft: selectedOrderSaved,
      });
      await handleSuspendedPaymentV7(payload);
      await clearOrderDraftV7({ weekKey: selectedWeek, orderId: selectedOrder.id });
      if (selectedClaim?.sessionId === session.sessionId) {
        await releaseOrderClaimV7({ weekKey: selectedWeek, orderId: selectedOrder.id, session });
      }
      await biAlert({ heText: 'הושלם! השרת אישר.', thText: 'เสร็จแล้ว! เซิร์ฟเวอร์ยืนยัน', title: 'success' });
    } catch (e) {
      console.error(e);
      try {
        await saveDraftPatch({ status: 'weighed' });
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

  const selectAllCommunities = () => setTempSelectedCommunities(new Set(pickupSpots));
  const clearAllCommunities = () => setTempSelectedCommunities(new Set());
  const handleLoad = () => {
    setSelectedWeek(tempSelectedWeek);
    setSelectedCommunities(new Set(tempSelectedCommunities));
    setSelectedSpecificStartDate(tempSpecificStartDate);
    setSelectedSpecificEndDate(tempSpecificEndDate);
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
                setTempSpecificStartDate('');
                setTempSpecificEndDate('');
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
                    const pendingCount = orders.filter((o) => getEffectiveOrderStatus(o, effectiveDraftsByOrder[o.id]) !== 'completed').length;
                    const doneCount = orders.filter((o) => getEffectiveOrderStatus(o, effectiveDraftsByOrder[o.id]) === 'completed').length;
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
                      const count = orders.filter((o) => (o?.customerDetails?.pickupSpot || o?.pickupSpot) === c).length;
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
                          <button
                            onClick={() => setCommunityFilter(c)}
                            className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                              communityFilter === c ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
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
                  const oItems = Array.isArray(o.items) ? o.items.length : 0;
                  const isDone = effectiveStatus === 'completed';
                  const claim = claimsByOrder[o.id];
                  const takenByOther = claim && claim.sessionId !== session.sessionId && !isClaimStaleV7(claim);
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
                        <div className={`relative w-10 h-10 rounded-full font-black flex items-center justify-center text-lg flex-shrink-0 ${
                          isDone ? 'bg-green-500 text-white' : isActive ? 'bg-blue-600 text-white ring-2 ring-blue-300' : 'bg-yellow-500 text-white'
                        }`}>
                          {isDone ? <span className="text-xl leading-none">&#10003;</span> : custNum}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`font-bold text-sm truncate ${isDone ? 'text-green-800 line-through' : isActive ? 'text-blue-900' : 'text-gray-900'}`}>
                            {o.customerDetails?.name || t.customer}
                          </div>
                          <div className={`text-[11px] truncate ${isDone ? 'text-green-600' : isActive ? 'text-blue-700' : 'text-gray-500'}`}>
                            {o.customerDetails?.pickupSpot || o.pickupSpot || ''} {o.customerDetails?.phone ? `• ${o.customerDetails.phone}` : ''}
                          </div>
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
                      <div className="ml-2">{statusBadge(getEffectiveOrderStatus(selectedOrder, selectedOrderSaved))}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={claimSelectedOrder}
                        disabled={savingActionKey === `claim:${selectedOrder.id}` || getEffectiveOrderStatus(selectedOrder, selectedOrderSaved) === 'completed'}
                        className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-lg text-sm shadow transition-colors disabled:opacity-50"
                      >
                        {t.claim}
                      </button>
                      <button
                        onClick={releaseSelectedOrder}
                        disabled={selectedClaim?.sessionId !== session.sessionId || savingActionKey === `release:${selectedOrder.id}`}
                        className="px-4 py-2 bg-violet-100 hover:bg-violet-200 text-violet-700 font-bold rounded-lg text-sm shadow transition-colors disabled:opacity-50"
                      >
                        {t.release}
                      </button>
                      <button
                        onClick={useOrderedQuantities}
                        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-lg text-sm border transition-colors"
                        disabled={claimedByOther}
                      >
                        {t.useOrderedQty}
                      </button>
                      <button
                        onClick={completeOrder}
                        disabled={!canComplete || getEffectiveOrderStatus(selectedOrder, selectedOrderSaved) === 'completed' || claimedByOther}
                        className={`px-5 py-2 font-bold rounded-lg text-sm transition-colors ${
                          !canComplete || getEffectiveOrderStatus(selectedOrder, selectedOrderSaved) === 'completed' || claimedByOther
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
                    const showQtyBadge = reqQty > 1;
                    const showUnderOneKgBadge = !isPackage && reqEstimatedKg > 0 && reqEstimatedKg < 1;

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
                        {showQtyBadge && !isRemoved && (
                          <div className="absolute top-2 right-2 z-10">
                            <div className="bg-red-600 text-white font-black rounded-full min-w-[36px] h-9 flex items-center justify-center px-2 text-lg shadow-lg border-2 border-white">
                              x{isPackage || isUnit ? Math.floor(reqQty) : reqQty}
                            </div>
                          </div>
                        )}
                        {showUnderOneKgBadge && !isRemoved && (
                          <div className={`absolute top-2 ${showQtyBadge ? 'left-2' : 'right-2'} z-10`}>
                            <span className="bg-orange-500 text-white font-bold text-[11px] px-2 py-0.5 rounded-full shadow">
                              {t.underOneKgBadge}
                            </span>
                          </div>
                        )}
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

                        <div className="flex justify-center pt-4 pb-2 px-4">
                          {it.images && it.images.length > 0 ? (
                            <img
                              src={cachedImg(it.images[0])}
                              alt={displayName}
                              className={`w-28 h-28 rounded-xl object-cover border border-gray-200 ${isRemoved ? 'grayscale' : ''}`}
                            />
                          ) : (
                            <div className="w-28 h-28 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-300 text-3xl">
                              ?
                            </div>
                          )}
                        </div>

                        <div className="px-4 pb-2">
                          <div className={`font-bold text-sm leading-tight ${isRemoved ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                            {displayName}
                          </div>
                          {secondaryName && (
                            <div className={`text-[11px] mt-0.5 ${isRemoved ? 'text-gray-300' : 'text-gray-500'}`}>{secondaryName}</div>
                          )}
                          <div className={`text-xs mt-2 ${isRemoved ? 'text-gray-400' : 'text-gray-600'}`}>
                            <span className="font-bold">{t.ordered}: </span>
                            {isPackage ? (
                              <><span className="font-black text-base">{Math.floor(reqQty)}</span> {t.pkgLbl} • {t.perPkg} {Number(it.pricePerUnit || 0).toFixed(2)}</>
                            ) : isUnit ? (
                              <>
                                <span className="font-black text-xl text-purple-700">{Math.floor(reqQty)}</span> <span className="font-black text-lg text-purple-700">{t.unitLbl}</span>
                                {' '}• {t.perKg} {Number(it.pricePerUnit || 0).toFixed(2)}
                              </>
                            ) : (
                              <>
                                <span className={`font-black text-base ${reqQty < 1 ? 'text-orange-600' : ''}`}>{reqQty.toFixed(3)}</span> {t.kg} • {t.perKg} {Number(it.pricePerUnit || 0).toFixed(2)}
                                {it.unitSize && it.unitSize !== 1 && (
                                  <span className="text-gray-400 ml-1">({Math.round(reqQty / it.unitSize)} x {it.unitSize})</span>
                                )}
                              </>
                            )}
                          </div>
                          {isUnit && !isRemoved && (
                            <div className="mt-1 inline-block bg-purple-100 text-purple-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                              {t.unitOrderedBadge}
                            </div>
                          )}
                        </div>

                        <div className="px-4 pb-3 border-t border-gray-100 pt-2">
                          {isRemoved ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); restoreItem(it.lineId); }}
                              className="w-full py-1.5 text-xs font-bold rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
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

                              {!weighedQty && !isActive && !isEditing && (
                                <div className="mb-2">
                                  <div className="text-[11px] text-gray-500 font-bold">{t.weighed}:</div>
                                  <div className="text-lg font-black text-gray-400">
                                    {isPackage ? t.notConfirmed : t.notWeighed}
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
                                    className={`px-4 py-2 rounded-lg text-sm font-bold ${
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
                                      className="px-3 py-2 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600"
                                    >
                                      {t.savePrice}
                                    </button>
                                    <button
                                      onClick={cancelPriceEdit}
                                      className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg text-xs font-bold hover:bg-gray-300"
                                    >
                                      {t.cancel}
                                    </button>
                                  </div>
                                ) : (
                                  <div className="text-xs text-gray-500">
                                    <span className="font-bold">{t.price}:</span> ₪{Number(it.pricePerUnit || 0).toFixed(2)}
                                  </div>
                                )}
                              </div>

                              <div className="flex gap-2 flex-wrap">
                                {isPackage && !weighedQty && (
                                  <button
                                    onClick={() => saveManualWeight(it.lineId, reqQty, 'package')}
                                    className="flex-1 text-xs font-bold py-1.5 rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors"
                                  >
                                    {t.ordered}: {Math.floor(reqQty)} {t.pkgLbl}
                                  </button>
                                )}
                                {!isEditing && !(isActive && !weighedQty && !isPackage) && (
                                  <button
                                    onClick={() => startEdit(it.lineId, weighedQty)}
                                    className="flex-1 text-xs font-bold py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                                  >
                                    {t.edit}
                                  </button>
                                )}
                                {!isPriceEditing && (
                                  <button
                                    onClick={() => startPriceEdit(it.lineId, it.pricePerUnit)}
                                    className="text-xs font-bold py-1.5 px-3 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors"
                                  >
                                    {t.price}
                                  </button>
                                )}
                                {weighedQty && !isEditing && (
                                  <button
                                    onClick={() => resetItem(it.lineId)}
                                    className="text-xs font-bold py-1.5 px-3 rounded-lg bg-orange-100 text-orange-600 hover:bg-orange-200 transition-colors"
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
                                  className="text-xs font-bold py-1.5 px-3 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
                                >
                                  {t.remove}
                                </button>
                                <button
                                  onClick={() => deleteLine(it)}
                                  className="text-xs font-bold py-1.5 px-3 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
                                >
                                  {t.deleteLine}
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