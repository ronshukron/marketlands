import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { listIntroductionBasketProductCandidates } from '../../services/introductionBasketService';
import {
  COMPENSATION_STATUSES,
  assignCompensation,
  listCompensationsForIdentity,
} from '../../services/compensationService';
import { getCustomerKey, markCustomerWinBackSent } from '../../services/customerProfileService';
import { normalizePhoneForWhatsApp } from '../../utils/marketplaceOrderWhatsApp';
import {
  WIN_BACK_WEEK_OPTIONS,
  buildWinBackGiftLine,
  buildWinBackMessage,
  buildWinBackWhatsAppUrl,
  filterLapsedCustomers,
  getLastCompletedOrder,
  getWinBackCommunity,
  getWinBackStoreLink,
  weeksIdle,
} from '../../utils/customerWinBackMessage';

const ASSIGN_ERRORS = {
  IDENTITY_REQUIRED: 'חסר מזהה לקוח, טלפון או אימייל',
  PRODUCT_REQUIRED: 'בחרו מוצר למתנה',
  QUANTITY_INVALID: 'הכמות חייבת להיות גדולה מאפס',
  QUANTITY_TOO_LARGE: 'הכמות גדולה מדי',
  REASON_TOO_LONG: 'סיבת המתנה ארוכה מדי',
};

const formatMoney = (value) => `₪${Number(value || 0).toFixed(2)}`;

const formatSentLabel = (sentAt) => {
  if (!sentAt) return 'טרם נשלח';
  const date = new Date(sentAt);
  if (Number.isNaN(date.getTime())) return 'נשלח';
  return `נשלח ב־${format(date, 'dd/MM')}`;
};

const formatIdleLabel = (date) => {
  const weeks = weeksIdle(date);
  if (weeks == null) return '-';
  if (weeks === 0) return 'פחות משבוע';
  if (weeks === 1) return 'לפני שבוע';
  return `לפני ${weeks} שבועות`;
};

const CustomerWinBackTab = ({
  customers,
  profilesMap,
  weeks,
  onWeeksChange,
  adminUid,
  adminName,
  onWinBackRecorded,
}) => {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [message, setMessage] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [selectedCandidateKey, setSelectedCandidateKey] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [grantsState, setGrantsState] = useState({ id: '', grants: [] });
  const [grantsLoading, setGrantsLoading] = useState(false);
  const [assignedGift, setAssignedGift] = useState({ id: '', name: '' });
  const [sending, setSending] = useState(false);
  const [actionError, setActionError] = useState('');
  const [sentUrl, setSentUrl] = useState('');
  const editedForIdRef = useRef('');
  const panelRef = useRef(null);

  useEffect(() => {
    let active = true;
    listIntroductionBasketProductCandidates()
      .then((next) => {
        if (active) setCandidates(next);
      })
      .catch((err) => {
        console.error('Failed to load win-back products', err);
        if (active) setProductsError('טעינת מוצרי החקלאים נכשלה. אפשר עדיין לשלוח הודעה בלי מתנה.');
      })
      .finally(() => {
        if (active) setProductsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const lapsedCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return filterLapsedCustomers(customers, weeks)
      .filter((customer) => {
        if (!query) return true;
        return [customer.name, customer.phone, customer.email]
          .some((value) => String(value || '').toLowerCase().includes(query));
      })
      .sort((a, b) => {
        const aTime = getLastCompletedOrder(a)?.createdAt?.getTime() || 0;
        const bTime = getLastCompletedOrder(b)?.createdAt?.getTime() || 0;
        return aTime - bTime;
      });
  }, [customers, weeks, search]);

  const selectedCustomer = lapsedCustomers.find((customer) => customer.id === selectedId) || null;
  const profileKey = selectedCustomer
    ? getCustomerKey({ phone: selectedCustomer.phone, email: selectedCustomer.email })
    : '';
  const selectedProfile = profileKey ? profilesMap[profileKey] : null;
  const grants = grantsState.id === selectedCustomer?.id ? grantsState.grants : [];
  const activeGrants = grants.filter((grant) => grant.status === COMPENSATION_STATUSES.ACTIVE);
  const hasPhone = Boolean(normalizePhoneForWhatsApp(selectedCustomer?.phone));
  const storeLink = selectedCustomer ? getWinBackStoreLink(selectedCustomer) : '';

  const selectedCandidate = useMemo(
    () => candidates.find((item) => `${item.orderId}:${item.productId}` === selectedCandidateKey) || null,
    [candidates, selectedCandidateKey]
  );

  const filteredCandidates = useMemo(() => {
    const query = productQuery.trim().toLowerCase();
    return candidates.filter((candidate) => {
      if (!query) return true;
      return [candidate.productName, candidate.businessName, candidate.selectedOption]
        .some((value) => String(value || '').toLowerCase().includes(query));
    }).slice(0, 80);
  }, [candidates, productQuery]);

  const committedProductName = (assignedGift.id === selectedCustomer?.id ? assignedGift.name : '')
    || activeGrants[0]?.productSnapshot?.productName
    || '';

  useEffect(() => {
    if (selectedId && !lapsedCustomers.some((customer) => customer.id === selectedId)) {
      setSelectedId('');
    }
  }, [lapsedCustomers, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedId]);

  useEffect(() => {
    if (!selectedCandidate) return;
    const nextQuantity = selectedCandidate.measurementType === 'kg'
      ? Number(selectedCandidate.unitSize) || 1
      : 1;
    setQuantity(nextQuantity);
  }, [selectedCandidateKey, selectedCandidate]);

  const selectedUserId = selectedCustomer?.userId || '';
  const selectedPhone = selectedCustomer?.phone || '';
  const selectedEmail = selectedCustomer?.email || '';
  const selectedCustomerId = selectedCustomer?.id || '';

  useEffect(() => {
    if (!selectedCustomerId) return undefined;
    const identity = {
      uid: selectedUserId,
      phone: selectedPhone,
      email: selectedEmail,
    };
    let active = true;
    setGrantsLoading(true);
    listCompensationsForIdentity(identity)
      .then((next) => {
        if (active) setGrantsState({ id: selectedCustomerId, grants: next });
      })
      .catch((err) => {
        console.error('Failed to load win-back gifts', err);
        if (active) {
          setGrantsState({ id: selectedCustomerId, grants: [] });
          setActionError(err?.code === 'permission-denied'
            ? 'אין הרשאה לטעון מתנות. בדקו את כללי compensationRecipients.'
            : 'טעינת המתנות נכשלה.');
        }
      })
      .finally(() => {
        if (active) setGrantsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedCustomerId, selectedUserId, selectedPhone, selectedEmail]);

  useEffect(() => {
    if (!selectedCustomer) {
      setMessage('');
      return;
    }
    if (editedForIdRef.current === selectedCustomer.id) return;
    setMessage(buildWinBackMessage({
      name: selectedCustomer.name,
      productName: committedProductName,
      storeLink,
    }));
  }, [selectedCustomer, committedProductName, storeLink]);

  const selectCustomer = (id) => {
    editedForIdRef.current = '';
    setSelectedCandidateKey('');
    setProductQuery('');
    setSentUrl('');
    setActionError('');
    setSelectedId(id);
  };

  const recordSent = async (offerSummary) => {
    if (!profileKey) return;
    const saved = await markCustomerWinBackSent(profileKey, { offerSummary });
    onWinBackRecorded(profileKey, saved);
  };

  const handleSendWithGift = async () => {
    if (!selectedCustomer || !hasPhone || sending) return;
    setSending(true);
    setActionError('');
    try {
      let offerName = '';
      let outbound = message;

      if (selectedCandidate) {
        await assignCompensation({
          uid: selectedCustomer.userId || '',
          phone: selectedCustomer.phone || '',
          email: selectedCustomer.email || '',
          displayName: selectedCustomer.name || '',
          product: selectedCandidate,
          quantity: Number(quantity),
          reason: 'החזרת לקוח',
          assignedBy: adminUid,
          assignedByName: adminName || '',
        });
        offerName = selectedCandidate.productName || '';
        if (editedForIdRef.current === selectedCustomer.id) {
          if (offerName && !outbound.includes(offerName)) {
            outbound = `${outbound.trim()}\n${buildWinBackGiftLine(offerName)}`;
          }
        } else {
          outbound = buildWinBackMessage({
            name: selectedCustomer.name,
            productName: offerName,
            storeLink,
          });
        }
        setAssignedGift({ id: selectedCustomer.id, name: offerName });
        setSelectedCandidateKey('');
        try {
          const next = await listCompensationsForIdentity({
            uid: selectedCustomer.userId || '',
            phone: selectedCustomer.phone || '',
            email: selectedCustomer.email || '',
          });
          setGrantsState({ id: selectedCustomer.id, grants: next });
        } catch (reloadError) {
          console.error('Failed to refresh gifts after assign', reloadError);
        }
      } else {
        const existingName = activeGrants[0]?.productSnapshot?.productName || '';
        offerName = existingName && outbound.includes(existingName) ? existingName : '';
      }

      const url = buildWinBackWhatsAppUrl({
        phone: selectedCustomer.phone,
        message: outbound,
      });
      if (!url) {
        setActionError('אין טלפון');
        return;
      }

      setMessage(outbound);
      window.open(url, '_blank', 'noopener,noreferrer');
      setSentUrl(url);
      try {
        await recordSent(offerName);
      } catch (recordError) {
        console.error('Failed to record win-back outreach', recordError);
        setActionError('שמירת סטטוס הפנייה נכשלה. ההודעה כן נפתחה.');
      }
    } catch (err) {
      console.error('Failed to send win-back with gift', err);
      setActionError(ASSIGN_ERRORS[err?.message] || 'שמירת המתנה נכשלה');
    } finally {
      setSending(false);
    }
  };

  const handleSendWithoutGift = async () => {
    if (!selectedCustomer || !hasPhone || sending) return;
    const templateWithoutGift = buildWinBackMessage({
      name: selectedCustomer.name,
      productName: '',
      storeLink,
    });
    let outbound = templateWithoutGift;
    if (editedForIdRef.current === selectedCustomer.id) {
      const giftLine = buildWinBackGiftLine(committedProductName);
      outbound = giftLine ? message.split(giftLine).join('') : message;
      outbound = outbound.replace(/\n{3,}/g, '\n\n').trim();
      if (!outbound) outbound = templateWithoutGift;
    }
    const url = buildWinBackWhatsAppUrl({
      phone: selectedCustomer.phone,
      message: outbound,
    });
    if (!url) {
      setActionError('אין טלפון');
      return;
    }
    setSending(true);
    setActionError('');
    window.open(url, '_blank', 'noopener,noreferrer');
    setSentUrl(url);
    try {
      await recordSent('');
    } catch (err) {
      console.error('Failed to record win-back outreach', err);
      setActionError('שמירת סטטוס הפנייה נכשלה. ההודעה כן נפתחה.');
    } finally {
      setSending(false);
    }
  };

  const renderStatus = (customer) => {
    const key = getCustomerKey({ phone: customer.phone, email: customer.email });
    const profile = key ? profilesMap[key] : null;
    return (
      <div>
        <div>{formatSentLabel(profile?.winBackSentAt)}</div>
        {profile?.winBackOfferSummary && (
          <div className="text-xs text-gray-500">{profile.winBackOfferSummary}</div>
        )}
      </div>
    );
  };

  const renderCustomerFacts = (customer) => {
    const last = getLastCompletedOrder(customer);
    return {
      lastLabel: last?.createdAt ? format(last.createdAt, 'dd/MM/yy') : '-',
      idleLabel: formatIdleLabel(last?.createdAt),
      community: getWinBackCommunity(customer) || '—',
    };
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-800 mb-1">החזרת לקוחות</h2>
            <p className="text-sm text-gray-500 max-w-2xl">
              לקוחות שהזמינו בעבר ולא חזרו. מי שעדיין מזמין עם אותו טלפון או עם אותו שם מלא לא מופיע כאן. שם פרטי לבד לא מספיק. אפשר לצרף מתנה בחינם להזמנה הבאה ולפתוח הודעת WhatsApp.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
            <div className="sm:w-40">
              <label htmlFor="winback-weeks" className="block text-xs font-medium text-gray-600 mb-1">
                לא הזמינו יותר מ־
              </label>
              <select
                id="winback-weeks"
                value={weeks}
                onChange={(event) => onWeeksChange(Number(event.target.value))}
                className="w-full min-h-[44px] border border-gray-300 rounded px-2 py-2 text-sm"
              >
                {WIN_BACK_WEEK_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option} שבועות</option>
                ))}
              </select>
            </div>
            <div className="sm:w-64">
              <label htmlFor="winback-search" className="block text-xs font-medium text-gray-600 mb-1">
                חיפוש
              </label>
              <input
                id="winback-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="שם, טלפון או אימייל"
                className="w-full min-h-[44px] border border-gray-300 rounded px-2 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        <p className="text-sm text-gray-600 mb-3">
          {lapsedCustomers.length === 0
            ? 'אין לקוחות בסינון הזה.'
            : `נמצאו ${lapsedCustomers.length} לקוחות`}
        </p>

        {lapsedCustomers.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-10 border border-dashed rounded">
            אין לקוחות שהפסיקו להזמין בטווח הזה.
          </div>
        ) : (
          <>
            <div className="md:hidden space-y-3">
              {lapsedCustomers.map((customer) => {
                const facts = renderCustomerFacts(customer);
                const selected = customer.id === selectedId;
                return (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => selectCustomer(customer.id)}
                    className={`w-full text-right rounded-lg border p-3 min-h-[44px] ${
                      selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'
                    }`}
                  >
                    <div className="font-medium text-gray-900">{customer.name}</div>
                    <div dir="ltr" className="text-sm text-gray-600 text-right">{customer.phone || 'אין טלפון'}</div>
                    <div className="text-sm text-gray-600 mt-1">
                      הזמנה אחרונה {facts.lastLabel} · {facts.idleLabel}
                    </div>
                    <div className="text-sm text-gray-600">
                      {customer.completedCount} הזמנות · {facts.community}
                    </div>
                    <div className="text-sm text-gray-700 mt-1">{renderStatus(customer)}</div>
                  </button>
                );
              })}
            </div>

            <div className="hidden md:block overflow-x-auto border rounded">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2 text-right">שם</th>
                    <th className="p-2 text-right">טלפון</th>
                    <th className="p-2 text-right">הזמנה אחרונה</th>
                    <th className="p-2 text-right">זמן ללא הזמנה</th>
                    <th className="p-2 text-right">הזמנות</th>
                    <th className="p-2 text-right">קהילה</th>
                    <th className="p-2 text-right">פנייה</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lapsedCustomers.map((customer) => {
                    const facts = renderCustomerFacts(customer);
                    const selected = customer.id === selectedId;
                    return (
                      <tr
                        key={customer.id}
                        tabIndex={0}
                        onClick={() => selectCustomer(customer.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            selectCustomer(customer.id);
                          }
                        }}
                        className={`cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          selected ? 'bg-blue-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <td className="p-2 font-medium text-gray-900">{customer.name}</td>
                        <td className="p-2 text-gray-700" dir="ltr">{customer.phone || '-'}</td>
                        <td className="p-2 text-gray-700">{facts.lastLabel}</td>
                        <td className="p-2 text-gray-700">{facts.idleLabel}</td>
                        <td className="p-2 text-center">{customer.completedCount}</td>
                        <td className="p-2 text-gray-700">{facts.community}</td>
                        <td className="p-2 text-gray-700">{renderStatus(customer)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div ref={panelRef} className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-1">הודעה ומתנה</h2>
        {!selectedCustomer && (
          <p className="text-sm text-gray-400 py-6 text-center">בחרו לקוח מהרשימה כדי לשלוח הודעה.</p>
        )}

        {selectedCustomer && (
          <div className="space-y-4">
            <div className="text-sm text-gray-700">
              <span className="font-medium">{selectedCustomer.name}</span>
              {selectedCustomer.phone && (
                <span dir="ltr" className="inline-block mr-2">{selectedCustomer.phone}</span>
              )}
              {!hasPhone && (
                <span className="mr-2 text-red-600 font-medium">אין טלפון</span>
              )}
            </div>

            {selectedProfile?.winBackSentAt && (
              <p className="text-sm text-gray-600">
                {formatSentLabel(selectedProfile.winBackSentAt)}. אפשר לשלוח שוב.
              </p>
            )}

            <div>
              <label htmlFor="winback-message" className="block text-xs font-medium text-gray-600 mb-1">
                הודעת WhatsApp
              </label>
              <textarea
                id="winback-message"
                value={message}
                onChange={(event) => {
                  editedForIdRef.current = selectedCustomer.id;
                  setMessage(event.target.value);
                }}
                rows={6}
                dir="rtl"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>

            {activeGrants.length > 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded p-3">
                <p className="text-sm font-medium text-gray-800 mb-1">יש כבר מתנה שממתינה להזמנה הבאה</p>
                <ul className="text-sm text-gray-700 space-y-1">
                  {activeGrants.map((grant) => (
                    <li key={`${grant.identityKey}:${grant.id}`}>
                      {grant.productSnapshot?.productName || 'מוצר'}
                      {grant.quantity ? ` · ${grant.quantity}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {grantsLoading && activeGrants.length === 0 && (
              <p className="text-sm text-gray-500">טוען מתנות קיימות...</p>
            )}

            <div className="border border-gray-200 rounded p-3">
              <p className="text-sm font-medium text-gray-800 mb-2">
                {activeGrants.length > 0 ? 'מתנה נוספת (אופציונלי)' : 'מתנה להזמנה הבאה (אופציונלי)'}
              </p>
              <p className="text-xs text-gray-500 mb-3">
                המוצר יצורף אוטומטית במחיר ₪0 רק אחרי שהלקוח ישלח את ההזמנה הבאה.
              </p>
              {productsError && <p className="text-sm text-red-600 mb-2">{productsError}</p>}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label htmlFor="winback-product-search" className="block text-xs font-medium text-gray-600 mb-1">
                    חיפוש מוצר
                  </label>
                  <input
                    id="winback-product-search"
                    type="search"
                    value={productQuery}
                    onChange={(event) => setProductQuery(event.target.value)}
                    placeholder="שם מוצר או חקלאי"
                    className="w-full min-h-[44px] border border-gray-300 rounded px-2 py-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="winback-quantity" className="block text-xs font-medium text-gray-600 mb-1">
                    כמות
                  </label>
                  <input
                    id="winback-quantity"
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                    className="w-full min-h-[44px] border border-gray-300 rounded px-2 py-2 text-sm"
                  />
                </div>
              </div>
              <label htmlFor="winback-product" className="block text-xs font-medium text-gray-600 mb-1 mt-3">
                מוצר
              </label>
              <select
                id="winback-product"
                value={selectedCandidateKey}
                onChange={(event) => setSelectedCandidateKey(event.target.value)}
                disabled={productsLoading}
                className="w-full min-h-[44px] border border-gray-300 rounded px-2 py-2 text-sm"
              >
                <option value="">{productsLoading ? 'טוען מוצרים...' : 'בלי מתנה חדשה'}</option>
                {filteredCandidates.map((candidate) => (
                  <option
                    key={`${candidate.orderId}:${candidate.productId}`}
                    value={`${candidate.orderId}:${candidate.productId}`}
                  >
                    {candidate.productName} · {candidate.businessName} · {formatMoney(candidate.price)}
                  </option>
                ))}
              </select>
              {selectedCandidate?.productName && (
                <p className="text-xs text-gray-600 mt-2">
                  אחרי השליחה ההודעה תכלול מתנה: {selectedCandidate.productName}
                </p>
              )}
            </div>

            {actionError && <p className="text-sm text-red-600">{actionError}</p>}

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={handleSendWithGift}
                disabled={!hasPhone || sending}
                className="min-h-[44px] px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded text-sm disabled:opacity-50"
              >
                {sending ? 'שומר...' : 'הוסף מתנה ופתח WhatsApp'}
              </button>
              <button
                type="button"
                onClick={handleSendWithoutGift}
                disabled={!hasPhone || sending}
                className="min-h-[44px] px-4 py-2 bg-white border border-gray-300 text-gray-800 font-medium rounded text-sm disabled:opacity-50"
              >
                פתח WhatsApp בלי מתנה
              </button>
            </div>
            {!hasPhone && (
              <p className="text-sm text-red-600">אין טלפון — אי אפשר לפתוח WhatsApp ללקוח הזה.</p>
            )}
            {sentUrl && (
              <a
                href={sentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center min-h-[44px] text-sm font-medium text-green-700 underline"
              >
                אם WhatsApp לא נפתח, לחצו כאן
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerWinBackTab;
