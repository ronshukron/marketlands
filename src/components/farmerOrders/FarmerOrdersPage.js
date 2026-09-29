import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/authContext';
import LoadingSpinner from '../LoadingSpinner';
import {
  createFarmerPastedOrder,
  deleteFarmerPastedOrder,
  loadFarmerProductAliases,
  loadFarmerProducts,
  saveFarmerProductAliases,
  saveFarmerPastedOrderPacking,
  subscribeFarmerPastedOrders,
} from '../../services/farmerPastedOrdersService';
import {
  allLinesReadyToSave,
  buildAliasKey,
  formatFarmerQuantity,
  matchPastedOrder,
} from '../../utils/farmerOrderPaste';

const emptyCreate = {
  orderNumber: '',
  buyerName: '',
  rawText: '',
};

const copy = {
  he: {
    noPermission: 'אין הרשאה לשמור. יש לפרסם את כללי Firestore של הזמנות החקלאי.',
    orderNumberRequired: 'יש למלא מספר הזמנה.',
    buyerNameRequired: 'יש למלא שם קונה.',
    linesIncomplete: 'יש להתאים את כל השורות למוצר לפני השמירה.',
    saveFailed: 'השמירה נכשלה. נסו שוב.',
    productsFailed: 'טעינת המוצרים נכשלה.',
    fillOrderAndBuyer: 'יש למלא מספר הזמנה ושם קונה.',
    pasteRequired: 'יש להדביק את ההזמנה.',
    noCatalog: 'אין מוצרים בקטלוג. הוסיפו מוצרים לפני הדבקת הזמנה.',
    pickEveryLine: 'יש לבחור מוצר לכל שורה, או להסיר שורות שלא נחוצות.',
    deleteConfirm: (orderNumber, buyerName) => `למחוק את הזמנה ${orderNumber} עבור ${buyerName}?`,
    pageTitle: 'הזמנות ללקוחות',
    loginRequired: 'יש להתחבר עם חשבון חקלאי כדי להדביק הזמנות.',
    login: 'התחברות',
    orders: 'הזמנות',
    newOrder: 'הזמנה חדשה',
    loadingOrders: 'טוען הזמנות...',
    emptyOrders: 'אין הזמנות. הדביקו הזמנה חדשה.',
    packedCount: (packed, total) => `${packed}/${total} נארזו`,
    backToList: 'חזרה לרשימה',
    orderNumber: 'מספר הזמנה',
    buyerName: 'שם הקונה',
    pasteLabel: 'הדביקו את ההזמנה',
    reviewTitle: 'יש לבחור מוצר לשורות האלה',
    product: 'מוצר',
    chooseProduct: 'בחרו מוצר',
    quantity: 'כמות',
    removeLine: 'הסירו שורה',
    matchedTitle: 'שורות שזוהו',
    fromLastTime: 'זוהה מהפעם הקודמת',
    skippedTitle: 'שורות שדולגו',
    addToReview: 'הוסיפו לבדיקה',
    matching: 'מתאים...',
    matchProducts: 'התאם מוצרים',
    saving: 'שומר...',
    saveOrder: 'שמור הזמנה',
    cancel: 'ביטול',
    backToOpen: 'החזר לטיפול',
    markAllPacked: 'סמן הכל כנארז',
    deleteOrder: 'מחק הזמנה',
    packed: 'נארז',
    markPacked: 'סמן כנארז',
    pickOrder: 'בחרו הזמנה מהרשימה או הדביקו הזמנה חדשה.',
    langButton: 'ไทย',
  },
  th: {
    noPermission: 'ไม่มีสิทธิ์บันทึก กรุณาเผยแพร่กฎ Firestore ของออเดอร์เกษตรกร',
    orderNumberRequired: 'กรุณากรอกเลขออเดอร์',
    buyerNameRequired: 'กรุณากรอกชื่อผู้ซื้อ',
    linesIncomplete: 'กรุณาจับคู่สินค้าทุกบรรทัดก่อนบันทึก หรือลบบรรทัดที่ไม่ต้องการ',
    saveFailed: 'บันทึกไม่สำเร็จ ลองอีกครั้ง',
    productsFailed: 'โหลดสินค้าไม่สำเร็จ',
    fillOrderAndBuyer: 'กรุณากรอกเลขออเดอร์และชื่อผู้ซื้อ',
    pasteRequired: 'กรุณาวางข้อความออเดอร์',
    noCatalog: 'ยังไม่มีสินค้าในแคตตาล็อก เพิ่มสินค้าก่อนวางออเดอร์',
    pickEveryLine: 'กรุณาเลือกสินค้าทุกบรรทัด หรือลบบรรทัดที่ไม่ต้องการ',
    deleteConfirm: (orderNumber, buyerName) => `ลบออเดอร์ ${orderNumber} ของ ${buyerName}?`,
    pageTitle: 'ออเดอร์ลูกค้า',
    loginRequired: 'กรุณาเข้าสู่ระบบด้วยบัญชีเกษตรกรเพื่อวางออเดอร์',
    login: 'เข้าสู่ระบบ',
    orders: 'ออเดอร์',
    newOrder: 'ออเดอร์ใหม่',
    loadingOrders: 'กำลังโหลดออเดอร์...',
    emptyOrders: 'ยังไม่มีออเดอร์ วางออเดอร์ใหม่',
    packedCount: (packed, total) => `แพ็คแล้ว ${packed}/${total}`,
    backToList: 'กลับไปรายการ',
    orderNumber: 'เลขออเดอร์',
    buyerName: 'ชื่อผู้ซื้อ',
    pasteLabel: 'วางออเดอร์',
    reviewTitle: 'เลือกสินค้าสำหรับบรรทัดเหล่านี้',
    product: 'สินค้า',
    chooseProduct: 'เลือกสินค้า',
    quantity: 'จำนวน',
    removeLine: 'ลบบรรทัด',
    matchedTitle: 'บรรทัดที่จับคู่แล้ว',
    fromLastTime: 'จำจากครั้งก่อน',
    skippedTitle: 'บรรทัดที่ข้าม',
    addToReview: 'นำกลับไปตรวจ',
    matching: 'กำลังจับคู่...',
    matchProducts: 'จับคู่สินค้า',
    saving: 'กำลังบันทึก...',
    saveOrder: 'บันทึกออเดอร์',
    cancel: 'ยกเลิก',
    backToOpen: 'กลับไปทำต่อ',
    markAllPacked: 'แพ็คทั้งหมด',
    deleteOrder: 'ลบออเดอร์',
    packed: 'แพ็คแล้ว',
    markPacked: 'ทำเครื่องหมายว่าแพ็คแล้ว',
    pickOrder: 'เลือกออเดอร์จากรายการ หรือวางออเดอร์ใหม่',
    langButton: 'עברית',
  },
};

const firestoreErrorMessage = (error, text) => {
  if (error?.code === 'permission-denied') return text.noPermission;
  if (error?.message === 'ORDER_NUMBER_REQUIRED') return text.orderNumberRequired;
  if (error?.message === 'BUYER_NAME_REQUIRED') return text.buyerNameRequired;
  if (error?.message === 'LINES_REQUIRED' || error?.message === 'LINES_INCOMPLETE') {
    return text.linesIncomplete;
  }
  return text.saveFailed;
};

const FarmerOrdersPage = () => {
  const { currentUser, userLoggedIn, userRole, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [aliases, setAliases] = useState({});
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [listError, setListError] = useState('');
  const [formError, setFormError] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreate);
  const [matches, setMatches] = useState(null);
  const [saving, setSaving] = useState(false);
  const [matching, setMatching] = useState(false);
  const [openPickerIndex, setOpenPickerIndex] = useState(null);
  const [showThai, setShowThai] = useState(false);
  const text = showThai ? copy.th : copy.he;

  const isFarmer = userLoggedIn && userRole === 'business';
  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) || null,
    [orders, selectedOrderId]
  );
  const showDetailOnMobile = isCreating || Boolean(selectedOrder);

  useEffect(() => {
    if (!isFarmer || !currentUser?.uid) {
      setOrders([]);
      setLoadingOrders(false);
      return undefined;
    }

    setLoadingOrders(true);
    const unsubscribe = subscribeFarmerPastedOrders(
      currentUser.uid,
      (nextOrders) => {
        setOrders(nextOrders);
        setListError('');
        setLoadingOrders(false);
      },
      (error) => {
        console.error('Failed loading farmer pasted orders', error);
        setListError(firestoreErrorMessage(error, text));
        setLoadingOrders(false);
      }
    );
    return unsubscribe;
  }, [isFarmer, currentUser?.uid, text]);

  useEffect(() => {
    if (!isFarmer || !currentUser?.email) {
      setProducts([]);
      setLoadingProducts(false);
      return;
    }

    let cancelled = false;
    setLoadingProducts(true);
    loadFarmerProducts(currentUser.email)
      .then((nextProducts) => {
        if (!cancelled) setProducts(nextProducts);
      })
      .catch((error) => {
        console.error('Failed loading farmer products', error);
        if (!cancelled) setFormError(text.productsFailed);
      })
      .finally(() => {
        if (!cancelled) setLoadingProducts(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isFarmer, currentUser?.email, text.productsFailed]);

  useEffect(() => {
    if (!isFarmer || !currentUser?.uid) {
      setAliases({});
      return undefined;
    }
    let cancelled = false;
    loadFarmerProductAliases(currentUser.uid)
      .then((nextAliases) => {
        if (!cancelled) setAliases(nextAliases);
      })
      .catch((error) => {
        console.error('Failed loading farmer product aliases', error);
      });
    return () => {
      cancelled = true;
    };
  }, [isFarmer, currentUser?.uid]);

  const startCreate = () => {
    setIsCreating(true);
    setSelectedOrderId(null);
    setCreateForm(emptyCreate);
    setMatches(null);
    setFormError('');
  };

  const closeCreate = () => {
    setIsCreating(false);
    setCreateForm(emptyCreate);
    setMatches(null);
    setFormError('');
  };

  const selectOrder = (orderId) => {
    setIsCreating(false);
    setMatches(null);
    setFormError('');
    setSelectedOrderId(orderId);
  };

  const runMatch = (event) => {
    event.preventDefault();
    setFormError('');
    if (!createForm.orderNumber.trim() || !createForm.buyerName.trim()) {
      setFormError(text.fillOrderAndBuyer);
      return;
    }
    if (!createForm.rawText.trim()) {
      setFormError(text.pasteRequired);
      return;
    }
    if (products.length === 0) {
      setFormError(text.noCatalog);
      return;
    }
    setMatching(true);
    try {
      setMatches(matchPastedOrder(createForm.rawText, products, aliases));
      setOpenPickerIndex(null);
    } finally {
      setMatching(false);
    }
  };

  const updateMatchLine = (index, patch) => {
    setMatches((current) => current.map((line, i) => {
      if (i !== index) return line;
      const next = { ...line, ...patch };
      const hasProduct = Boolean(next.productId);
      const hasQty = next.quantity != null && Number.isFinite(Number(next.quantity));
      next.needsReview = !(hasProduct && hasQty);
      return next;
    }));
  };

  const productsForPicker = (line) => {
    const seen = new Set();
    const list = [];
    (line.candidates || []).forEach((candidate) => {
      const product = products.find((item) => item.id === candidate.productId);
      if (product && !seen.has(product.id)) {
        seen.add(product.id);
        list.push(product);
      }
    });
    products.forEach((product) => {
      if (!seen.has(product.id)) {
        seen.add(product.id);
        list.push(product);
      }
    });
    return list;
  };

  const assignProduct = (index, productId) => {
    const product = products.find((item) => item.id === productId);
    if (!product) {
      updateMatchLine(index, {
        productId: '',
        productName: '',
        measurementType: '',
      });
      return;
    }
    updateMatchLine(index, {
      productId: product.id,
      productName: product.name || '',
      measurementType: product.measurementType || 'kg',
      score: 100,
      source: '',
      pickedManually: true,
    });
    setOpenPickerIndex(null);
  };

  const removeMatchLine = (index) => {
    setMatches((current) => current.filter((_, i) => i !== index));
  };

  const restoreSkippedLine = (index) => {
    setMatches((current) => current.map((line, i) => (
      i === index
        ? { ...line, kind: 'item', needsReview: true, source: '' }
        : line
    )));
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (!allLinesReadyToSave(matches)) {
      setFormError(text.pickEveryLine);
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const id = await createFarmerPastedOrder({
        businessId: currentUser.uid,
        orderNumber: createForm.orderNumber,
        buyerName: createForm.buyerName,
        rawText: createForm.rawText,
        lines: matches
          .filter((line) => line.kind !== 'skipped')
          .map((line) => ({
          rawLine: line.rawLine,
          productId: line.productId,
          productName: line.productName,
          quantity: line.quantity,
          measurementType: line.measurementType,
          matchScore: line.score,
        })),
      });
      const learned = matches
        .filter((line) => line.pickedManually && line.productId)
        .map((line) => ({
          key: buildAliasKey(line.parsedName || line.rawLine),
          productId: line.productId,
          productName: line.productName,
        }))
        .filter((entry) => entry.key);
      if (learned.length > 0) {
        try {
          await saveFarmerProductAliases(currentUser.uid, learned);
          setAliases((current) => {
            const next = { ...current };
            learned.forEach((entry) => {
              next[entry.key] = { productId: entry.productId, productName: entry.productName };
            });
            return next;
          });
        } catch (aliasError) {
          console.error('Failed saving farmer product aliases', aliasError);
        }
      }
      closeCreate();
      setSelectedOrderId(id);
    } catch (error) {
      console.error('Failed saving farmer pasted order', error);
      setFormError(firestoreErrorMessage(error, text));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleDone = useCallback(async (order) => {
    try {
      const packed = order.status !== 'done';
      const lines = (order.lines || []).map((line) => ({ ...line, packed }));
      await saveFarmerPastedOrderPacking(order.id, lines, packed ? 'done' : 'open');
    } catch (error) {
      console.error('Failed updating farmer pasted order status', error);
      setFormError(firestoreErrorMessage(error, text));
    }
  }, [text]);

  const toggleLinePacked = useCallback(async (order, index) => {
    try {
      const lines = (order.lines || []).map((line, lineIndex) => (
        lineIndex === index ? { ...line, packed: line.packed !== true } : line
      ));
      await saveFarmerPastedOrderPacking(order.id, lines);
    } catch (error) {
      console.error('Failed saving packed line', error);
      setFormError(firestoreErrorMessage(error, text));
    }
  }, [text]);

  const handleDelete = async (order) => {
    const confirmed = window.confirm(text.deleteConfirm(order.orderNumber, order.buyerName));
    if (!confirmed) return;
    try {
      await deleteFarmerPastedOrder(order.id);
      if (selectedOrderId === order.id) setSelectedOrderId(null);
    } catch (error) {
      console.error('Failed deleting farmer pasted order', error);
      setFormError(firestoreErrorMessage(error, text));
    }
  };

  if (authLoading || (userLoggedIn && userRole == null)) return <LoadingSpinner />;

  if (!userLoggedIn || userRole !== 'business') {
    return (
      <div className="min-h-screen bg-gray-100 pt-24 px-4" dir="rtl">
        <div className="max-w-lg mx-auto bg-white rounded-xl shadow-sm p-6 text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">{text.pageTitle}</h1>
          <p className="text-gray-600 mb-4">{text.loginRequired}</p>
          <Link
            to="/login"
            state={{ from: '/farmer-orders' }}
            className="inline-flex items-center justify-center min-h-[44px] px-4 rounded-lg bg-blue-600 text-white font-medium"
          >
            {text.login}
          </Link>
        </div>
      </div>
    );
  }

  const reviewLines = (matches || []).filter((line) => line.kind !== 'skipped' && (line.needsReview || !line.productId));
  const acceptedLines = (matches || []).filter((line) => line.kind !== 'skipped' && line.productId && !line.needsReview);
  const skippedLines = (matches || []).filter((line) => line.kind === 'skipped');
  const canSave = allLinesReadyToSave(matches || []);

  return (
    <div className="min-h-screen bg-gray-100 pt-20 pb-8" dir="rtl">
      <div className="max-w-[1600px] mx-auto p-4">
        <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-black text-gray-900">{text.pageTitle}</h1>
        <button
          type="button"
          onClick={() => setShowThai((current) => !current)}
          className={`min-h-[56px] px-6 rounded-xl text-xl font-black shadow-md ${
            showThai
              ? 'bg-white text-indigo-700 border-4 border-indigo-600'
              : 'bg-indigo-600 hover:bg-indigo-700 text-white'
          }`}
        >
          {text.langButton}
        </button>
        </div>

        {listError && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-sm">
            {listError}
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-4">
          <div className={`lg:w-[340px] flex-shrink-0 ${showDetailOnMobile ? 'hidden lg:block' : ''}`}>
            <div className="bg-white rounded-xl shadow-sm overflow-hidden sticky top-20">
              <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between gap-2">
                <span className="font-bold text-gray-900">
                  {text.orders}
                  <span className="ms-2 text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                    {orders.length}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={startCreate}
                  className="min-h-[44px] px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold"
                >
                  {text.newOrder}
                </button>
              </div>

              {loadingOrders ? (
                <div className="p-6 text-center text-gray-500 text-sm">{text.loadingOrders}</div>
              ) : orders.length === 0 ? (
                <div className="p-6 text-center text-gray-500 text-sm">
                  {text.emptyOrders}
                </div>
              ) : (
                <div className="max-h-[70vh] overflow-y-auto divide-y">
                  {orders.map((order) => {
                    const isDone = order.status === 'done';
                    const isActive = selectedOrderId === order.id && !isCreating;
                    const lineCount = Array.isArray(order.lines) ? order.lines.length : 0;
                    const packedCount = (order.lines || []).filter((line) => line.packed === true).length;
                    return (
                      <button
                        key={order.id}
                        type="button"
                        onClick={() => selectOrder(order.id)}
                        className={`w-full p-3 text-right min-h-[44px] transition-colors ${
                          isDone
                            ? 'bg-green-50 border-r-4 border-green-500'
                            : isActive
                              ? 'bg-blue-100 border-r-4 border-blue-600 shadow-sm'
                              : 'bg-white hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="min-w-[44px] max-w-[4.5rem] h-11 rounded-full bg-yellow-500 text-white font-black flex items-center justify-center text-xs px-2 truncate">
                            {order.orderNumber}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className={`font-bold text-gray-900 truncate ${isDone ? 'line-through opacity-70' : ''}`}>
                              {order.buyerName}
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              {text.packedCount(packedCount, lineCount)}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            {showDetailOnMobile && (
              <button
                type="button"
                onClick={() => {
                  closeCreate();
                  setSelectedOrderId(null);
                }}
                className="lg:hidden mb-3 min-h-[44px] px-3 rounded-lg border border-gray-300 bg-white text-gray-800 font-medium"
              >
                {text.backToList}
              </button>
            )}

            {isCreating ? (
              <div className="bg-white rounded-xl shadow-sm p-5">
                <h2 className="text-lg font-black text-gray-900 mb-4">{text.newOrder}</h2>
                <form onSubmit={matches ? handleSave : runMatch} className="space-y-4">
                  <label className="block">
                    <span className="block text-sm font-bold text-gray-700 mb-1">{text.orderNumber}</span>
                    <input
                      value={createForm.orderNumber}
                      onChange={(e) => setCreateForm((f) => ({ ...f, orderNumber: e.target.value }))}
                      className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3"
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="block text-sm font-bold text-gray-700 mb-1">{text.buyerName}</span>
                    <input
                      value={createForm.buyerName}
                      onChange={(e) => setCreateForm((f) => ({ ...f, buyerName: e.target.value }))}
                      className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3"
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="block text-sm font-bold text-gray-700 mb-1">{text.pasteLabel}</span>
                    <textarea
                      value={createForm.rawText}
                      onChange={(e) => {
                        setCreateForm((f) => ({ ...f, rawText: e.target.value }));
                        setMatches(null);
                      }}
                      rows={8}
                      placeholder={'חסה לאליק - 20\nחסה סולנובה - 10'}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 font-medium leading-7"
                      required
                    />
                  </label>

                  {formError && (
                    <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-3 py-2 text-sm">
                      {formError}
                    </div>
                  )}

                  {matches && (
                    <div className="space-y-4">
                      {reviewLines.length > 0 && (
                        <div>
                          <h3 className="font-bold text-amber-800 mb-2">{text.reviewTitle}</h3>
                          <div className="space-y-3">
                            {matches.map((line, index) => {
                              if (line.kind === 'skipped' || (!line.needsReview && line.productId)) return null;
                              return (
                                <div key={`${line.rawLine}-${index}`} className={`border border-amber-200 bg-amber-50 rounded-xl p-3 space-y-2 ${openPickerIndex === index ? 'relative z-20' : ''}`}>
                                  <div className="text-sm text-gray-700 font-medium">{line.rawLine || line.parsedName}</div>
                                  <div>
                                    <span className="block text-xs font-bold text-gray-600 mb-1">{text.product}</span>
                                    <button
                                      type="button"
                                      onClick={() => setOpenPickerIndex(openPickerIndex === index ? null : index)}
                                      className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white text-right"
                                    >
                                      {line.productName || text.chooseProduct}
                                    </button>
                                    {openPickerIndex === index && (
                                      <ul className="mt-1 max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
                                        {productsForPicker(line).map((product) => (
                                          <li key={product.id}>
                                            <button
                                              type="button"
                                              onClick={() => assignProduct(index, product.id)}
                                              className={`w-full min-h-[44px] px-3 text-right hover:bg-blue-50 ${line.productId === product.id ? 'bg-blue-100 font-bold' : ''}`}
                                            >
                                              {product.name}
                                            </button>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                  <label className="block">
                                    <span className="block text-xs font-bold text-gray-600 mb-1">{text.quantity}</span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="any"
                                      value={line.quantity ?? ''}
                                      onChange={(e) => updateMatchLine(index, {
                                        quantity: e.target.value === '' ? null : Number(e.target.value),
                                      })}
                                      className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white"
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => removeMatchLine(index)}
                                    className="min-h-[44px] text-sm text-red-700 font-medium"
                                  >
                                    {text.removeLine}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {acceptedLines.length > 0 && (
                        <div>
                          <h3 className="font-bold text-gray-800 mb-2">{text.matchedTitle}</h3>
                          <ul className="divide-y border rounded-xl overflow-hidden">
                            {matches.map((line, index) => {
                              if (line.kind === 'skipped' || line.needsReview || !line.productId) return null;
                              return (
                                <li key={`${line.productId}-${index}`} className="px-4 py-3 bg-white flex items-center justify-between gap-3">
                                  <span className="font-bold text-gray-900">
                                    {line.productName}
                                    {line.source === 'alias' && (
                                      <span className="ms-2 text-xs font-medium text-blue-700">{text.fromLastTime}</span>
                                    )}
                                  </span>
                                  <span className="text-gray-700 whitespace-nowrap">
                                    {formatFarmerQuantity(line.quantity, line.measurementType, showThai ? 'th' : 'he')}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {skippedLines.length > 0 && (
                    <div>
                      <h3 className="font-bold text-gray-500 mb-2">{text.skippedTitle}</h3>
                      <ul className="divide-y border border-gray-200 rounded-xl overflow-hidden">
                        {matches.map((line, index) => {
                          if (line.kind !== 'skipped') return null;
                          return (
                            <li key={`skipped-${index}`} className="px-4 py-3 bg-gray-50 flex items-center justify-between gap-3">
                              <span className="text-sm text-gray-500">{line.rawLine || line.parsedName}</span>
                              <button
                                type="button"
                                onClick={() => restoreSkippedLine(index)}
                                className="min-h-[44px] text-sm font-medium text-blue-700"
                              >
                                {text.addToReview}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {!matches ? (
                      <button
                        type="submit"
                        disabled={matching || loadingProducts}
                        className="min-h-[44px] px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold"
                      >
                        {matching ? text.matching : text.matchProducts}
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={!canSave || saving}
                        className="min-h-[44px] px-4 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-bold"
                      >
                        {saving ? text.saving : text.saveOrder}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={closeCreate}
                      className="min-h-[44px] px-4 rounded-lg border border-gray-300 bg-white text-gray-800 font-medium"
                    >
                      {text.cancel}
                    </button>
                  </div>
                </form>
              </div>
            ) : selectedOrder ? (
              <div className="bg-white rounded-xl shadow-sm p-5">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
                  <div className="flex items-start gap-4">
                    <div className="min-w-[56px] h-14 rounded-full bg-yellow-500 text-white font-black flex items-center justify-center text-lg px-2">
                      {selectedOrder.orderNumber}
                    </div>
                    <div>
                      <div className="text-lg font-black text-gray-900">{selectedOrder.buyerName}</div>
                      <div className="text-sm text-gray-500">
                        {text.packedCount(
                          (selectedOrder.lines || []).filter((line) => line.packed === true).length,
                          (selectedOrder.lines || []).length
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleDone(selectedOrder)}
                      className={`min-h-[56px] px-6 rounded-xl text-lg font-black shadow-md ${
                        selectedOrder.status === 'done'
                          ? 'bg-white text-gray-800 border-2 border-gray-300'
                          : 'bg-green-600 hover:bg-green-700 text-white'
                      }`}
                    >
                      {selectedOrder.status === 'done' ? text.backToOpen : text.markAllPacked}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(selectedOrder)}
                      className="min-h-[56px] px-4 rounded-xl border border-red-200 text-red-700 bg-white font-bold"
                    >
                      {text.deleteOrder}
                    </button>
                  </div>
                </div>

                {formError && (
                  <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded-lg px-3 py-2 text-sm">
                    {formError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {(selectedOrder.lines || []).map((line, index, lines) => {
                    const packed = line.packed === true;
                    const nextIndex = lines.findIndex((item) => item.packed !== true);
                    const isNext = !packed && nextIndex === index;
                    const product = products.find((item) => item.id === line.productId);
                    const image = Array.isArray(product?.images) ? product.images[0] : '';
                    const thaiName = product?.thaiName || '';
                    const displayName = showThai && thaiName ? thaiName : line.productName;
                    const secondaryName = showThai && thaiName ? line.productName : thaiName;
                    const showQtyBadge = Number(line.quantity) > 1;
                    return (
                      <div
                        key={`${line.productId}-${index}`}
                        className={`relative min-h-[240px] overflow-hidden rounded-xl border-4 ${
                          packed
                            ? 'border-green-500'
                            : isNext
                              ? 'border-yellow-400 shadow-lg'
                              : 'border-gray-200'
                        }`}
                      >
                        {image ? (
                          <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" />
                        ) : (
                          <div className="absolute inset-0 bg-gray-300" />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/25" />
                        {showQtyBadge && (
                          <div className="absolute top-3 right-3 z-10 bg-red-700 text-white font-black rounded-full min-w-[52px] h-12 flex items-center justify-center px-2 text-2xl border-4 border-white">
                            x{Number.isInteger(Number(line.quantity)) ? line.quantity : Number(line.quantity)}
                          </div>
                        )}
                        <div className="relative z-10 flex h-full min-h-[240px] flex-col justify-end p-4 text-white">
                          <div className={`text-2xl font-black drop-shadow ${packed ? 'line-through opacity-80' : ''}`}>
                            {displayName}
                          </div>
                          {secondaryName && (
                            <div className="mt-1 text-sm font-bold text-white/90 drop-shadow">{secondaryName}</div>
                          )}
                          <div className="mt-1 text-lg font-bold drop-shadow">
                            {formatFarmerQuantity(line.quantity, line.measurementType, showThai ? 'th' : 'he')}
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleLinePacked(selectedOrder, index)}
                            className={`mt-4 w-full min-h-[56px] rounded-xl text-xl font-black shadow-lg ${
                              packed
                                ? 'bg-green-600 text-white'
                                : 'bg-yellow-400 text-gray-900 hover:bg-yellow-300'
                            }`}
                          >
                            {packed ? text.packed : text.markPacked}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm p-10 text-center text-gray-500">
                {text.pickOrder}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FarmerOrdersPage;
