import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import Swal from 'sweetalert2';
import { db } from '../../firebase/firebase';
import { resolveCommunityName } from '../../services/pickupSpotsService';
import { isIndependentBusinessAccount } from '../../utils/accountRoles';
import { isAlwaysOnGroceryOrderEnabled } from '../../utils/deliveryScheduleUtils';
import LoadingSpinner from '../LoadingSpinner';

const LEGACY_CUTOFF_TIME_REGEX = /^\d{1,2}:\d{2}$/;

const getOrderCommunities = (order) => (
  [...new Set((order?.pickupSpots || []).map((name) => resolveCommunityName(name)).filter(Boolean))]
);

const parseCutoffHoursForForm = (value) => {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return String(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (LEGACY_CUTOFF_TIME_REGEX.test(trimmed)) return '';
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isFinite(parsed) && parsed >= 0) return String(parsed);
  }
  return '';
};

const formatCutoffHoursLabel = (value) => {
  const hours = parseCutoffHoursForForm(value);
  return hours ? `${hours} שעות` : '';
};

const WEEK_DAYS = [
  { value: 0, label: 'ראשון' },
  { value: 1, label: 'שני' },
  { value: 2, label: 'שלישי' },
  { value: 3, label: 'רביעי' },
  { value: 4, label: 'חמישי' },
  { value: 5, label: 'שישי' },
  { value: 6, label: 'שבת' },
];

const getBusinessLabel = (businessId, data = {}) => (
  data.businessName || data.name || data.email || businessId
);

const isAlwaysOnOrder = (order) => (
  order.orderMode === 'always_on_grocery'
  || order.orderType === 'always_on_grocery'
  || order.alwaysOn === true
  || order.groceryStore === true
);

const readSavedWeeklyDays = (order) => {
  const globalDays = order?.fulfillmentConfig?.weeklyDeliveryDays;
  if (Array.isArray(globalDays) && globalDays.length > 0) {
    return globalDays.map(Number).filter((day) => day >= 0 && day <= 6);
  }
  const byCommunity = order?.fulfillmentConfig?.weeklyDaysByCommunity || {};
  const firstCommunity = getOrderCommunities(order).find(
    (name) => Array.isArray(byCommunity[name]) && byCommunity[name].length > 0
  );
  if (firstCommunity) {
    return byCommunity[firstCommunity].map(Number).filter((day) => day >= 0 && day <= 6);
  }
  const legacyEntry = Object.entries(byCommunity).find(([, days]) => Array.isArray(days) && days.length > 0);
  if (legacyEntry) {
    return legacyEntry[1].map(Number).filter((day) => day >= 0 && day <= 6);
  }
  return [];
};

const readWeeklyCutoffByDay = (config = {}) => {
  const raw = config.weeklyCutoffByDay || {};
  return Object.entries(raw).reduce((acc, [day, value]) => {
    const hours = parseCutoffHoursForForm(value);
    if (hours) acc[Number(day)] = hours;
    return acc;
  }, {});
};

const readCommunityCutoffOverrides = (config = {}) => {
  const raw = config.cutoffByWeekdayByCommunity || {};
  return Object.entries(raw).reduce((acc, [community, dayMap]) => {
    const canonical = resolveCommunityName(community);
    if (!acc[canonical]) acc[canonical] = {};
    Object.entries(dayMap || {}).forEach(([day, value]) => {
      const hours = parseCutoffHoursForForm(value);
      if (hours) acc[canonical][Number(day)] = hours;
    });
    return acc;
  }, {});
};

const AdminBusinessWeeklyCutoffs = () => {
  const [loadingBusinesses, setLoadingBusinesses] = useState(true);
  const [businesses, setBusinesses] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBusinessId, setSelectedBusinessId] = useState('');
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [communityDayMap, setCommunityDayMap] = useState({});
  const [selectedWeeklyDays, setSelectedWeeklyDays] = useState([]);
  const [weeklyCutoffByDay, setWeeklyCutoffByDay] = useState({});
  const [communityCutoffOverrides, setCommunityCutoffOverrides] = useState({});
  const [overrideCommunities, setOverrideCommunities] = useState([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [archiveSaving, setArchiveSaving] = useState(false);
  const [orderStatusSaving, setOrderStatusSaving] = useState(false);

  const selectedBusiness = useMemo(
    () => businesses.find((entry) => entry.id === selectedBusinessId) || null,
    [businesses, selectedBusinessId]
  );

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) || null,
    [orders, selectedOrderId]
  );

  const availableDeliveryDays = useMemo(() => {
    const daySet = new Set();
    Object.values(communityDayMap).forEach((days) => {
      days.forEach((day) => daySet.add(day));
    });
    return Array.from(daySet).sort((a, b) => a - b);
  }, [communityDayMap]);

  const participatingDayOptions = useMemo(
    () => WEEK_DAYS.filter((day) => selectedWeeklyDays.includes(day.value)),
    [selectedWeeklyDays]
  );

  const visibleBusinesses = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return businesses
      .filter((entry) => Boolean(entry.weeklyCutoffArchived) === showArchived)
      .filter((entry) => {
        if (!normalizedSearch) return true;
        return getBusinessLabel(entry.id, entry).toLowerCase().includes(normalizedSearch);
      })
      .sort((a, b) => getBusinessLabel(a.id, a).localeCompare(getBusinessLabel(b.id, b), 'he'));
  }, [businesses, showArchived, searchTerm]);

  useEffect(() => {
    const loadBusinesses = async () => {
      setLoadingBusinesses(true);
      try {
        const snapshot = await getDocs(collection(db, 'businesses'));
        const weeklyBusinesses = snapshot.docs
          .map((businessDoc) => ({ id: businessDoc.id, ...businessDoc.data() }))
          .filter((entry) => !isIndependentBusinessAccount(entry));
        setBusinesses(weeklyBusinesses);
      } catch (error) {
        console.error('Error loading businesses:', error);
        Swal.fire('שגיאה', 'טעינת העסקים נכשלה', 'error');
      } finally {
        setLoadingBusinesses(false);
      }
    };

    loadBusinesses();
  }, []);

  useEffect(() => {
    if (visibleBusinesses.length === 0) {
      setSelectedBusinessId('');
      return;
    }
    if (!visibleBusinesses.some((entry) => entry.id === selectedBusinessId)) {
      setSelectedBusinessId(visibleBusinesses[0].id);
    }
  }, [visibleBusinesses, selectedBusinessId]);

  useEffect(() => {
    const loadOrders = async () => {
      if (!selectedBusinessId) {
        setOrders([]);
        setSelectedOrderId('');
        return;
      }

      setOrdersLoading(true);
      try {
        const ordersSnapshot = await getDocs(query(
          collection(db, 'Orders'),
          where('businessId', '==', selectedBusinessId)
        ));
        const alwaysOnOrders = ordersSnapshot.docs
          .map((orderDoc) => ({ id: orderDoc.id, ...orderDoc.data() }))
          .filter(isAlwaysOnOrder)
          .filter((order) => order.archived !== true);

        setOrders(alwaysOnOrders);
        setSelectedOrderId(alwaysOnOrders[0]?.id || '');
      } catch (error) {
        console.error('Error loading business orders:', error);
        Swal.fire('שגיאה', 'טעינת טפסי ההזמנה של העסק נכשלה', 'error');
        setOrders([]);
      } finally {
        setOrdersLoading(false);
      }
    };

    loadOrders();
  }, [selectedBusinessId]);

  useEffect(() => {
    const loadCommunitySchedules = async () => {
      setCommunityDayMap({});
      setSelectedWeeklyDays([]);
      setWeeklyCutoffByDay({});
      setCommunityCutoffOverrides({});
      setOverrideCommunities([]);
      if (!selectedOrder) return;

      setSchedulesLoading(true);
      try {
        const communities = getOrderCommunities(selectedOrder);
        const nextMap = {};
        await Promise.all(communities.map(async (communityName) => {
          const scheduleSnap = await getDoc(doc(db, 'deliverySchedules', communityName));
          if (!scheduleSnap.exists()) {
            nextMap[communityName] = [];
            return;
          }
          const weeklyDays = Array.isArray(scheduleSnap.data()?.weeklyDays)
            ? scheduleSnap.data().weeklyDays.map(Number).filter((day) => day >= 0 && day <= 6)
            : [];
          nextMap[communityName] = weeklyDays;
        }));

        setCommunityDayMap(nextMap);

        const config = selectedOrder.fulfillmentConfig || {};
        const savedDays = readSavedWeeklyDays(selectedOrder);
        const allowedDays = new Set(Object.values(nextMap).flatMap((days) => days));
        setSelectedWeeklyDays(
          savedDays.length > 0
            ? savedDays.filter((day) => allowedDays.size === 0 || allowedDays.has(day))
            : Array.from(allowedDays)
        );
        setWeeklyCutoffByDay(readWeeklyCutoffByDay(config));
        const savedOverrides = readCommunityCutoffOverrides(config);
        setCommunityCutoffOverrides(savedOverrides);
        setOverrideCommunities(Object.keys(savedOverrides));
      } catch (error) {
        console.error('Error loading community schedules:', error);
        Swal.fire('שגיאה', 'טעינת ימי המשלוח נכשלה', 'error');
      } finally {
        setSchedulesLoading(false);
      }
    };

    loadCommunitySchedules();
  }, [selectedOrder]);

  const toggleWeeklyDay = (day) => {
    setSelectedWeeklyDays((prev) => {
      const next = prev.includes(day)
        ? prev.filter((value) => value !== day)
        : [...prev, day].sort((a, b) => a - b);
      if (!next.includes(day)) {
        setWeeklyCutoffByDay((cutoffs) => {
          const updated = { ...cutoffs };
          delete updated[day];
          return updated;
        });
        setCommunityCutoffOverrides((overrides) => {
          const updated = { ...overrides };
          Object.keys(updated).forEach((community) => {
            if (updated[community]?.[day]) {
              const communityMap = { ...updated[community] };
              delete communityMap[day];
              if (Object.keys(communityMap).length === 0) {
                delete updated[community];
              } else {
                updated[community] = communityMap;
              }
            }
          });
          return updated;
        });
      }
      return next;
    });
  };

  const toggleOverrideCommunity = (communityName) => {
    setOverrideCommunities((prev) => (
      prev.includes(communityName)
        ? prev.filter((name) => name !== communityName)
        : [...prev, communityName]
    ));
  };

  const setDefaultCutoffHours = (day, rawValue) => {
    const trimmed = String(rawValue).trim();
    setWeeklyCutoffByDay((prev) => {
      const next = { ...prev };
      if (!trimmed) {
        delete next[day];
      } else {
        next[day] = trimmed;
      }
      return next;
    });
  };

  const setCommunityCutoffHours = (communityName, day, rawValue) => {
    const trimmed = String(rawValue).trim();
    setCommunityCutoffOverrides((prev) => {
      const next = { ...prev };
      const communityMap = { ...(next[communityName] || {}) };
      if (!trimmed) {
        delete communityMap[day];
      } else {
        communityMap[day] = trimmed;
      }
      if (Object.keys(communityMap).length === 0) {
        delete next[communityName];
      } else {
        next[communityName] = communityMap;
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!selectedOrder) return;
    if (selectedWeeklyDays.length === 0) {
      Swal.fire('שגיאה', 'בחרו לפחות יום משלוח אחד', 'warning');
      return;
    }

    setSaving(true);
    try {
      const existingConfig = selectedOrder.fulfillmentConfig || {};
      const sortedDays = [...selectedWeeklyDays].sort((a, b) => a - b);
      const orderCommunities = getOrderCommunities(selectedOrder);
      const weeklyDaysByCommunity = { ...(existingConfig.weeklyDaysByCommunity || {}) };
      orderCommunities.forEach((communityName) => {
        weeklyDaysByCommunity[communityName] = sortedDays;
      });
      Object.keys(weeklyDaysByCommunity).forEach((key) => {
        const canonical = resolveCommunityName(key);
        if (!orderCommunities.includes(canonical) || key !== canonical) {
          delete weeklyDaysByCommunity[key];
        }
      });

      const serializedDefaultCutoffs = sortedDays.reduce((acc, day) => {
        const hours = Number.parseInt(String(weeklyCutoffByDay[day] || '').trim(), 10);
        if (Number.isFinite(hours) && hours >= 0) {
          acc[String(day)] = hours;
        }
        return acc;
      }, {});

      const serializedCommunityCutoffs = Object.entries(communityCutoffOverrides).reduce((acc, [communityName, dayMap]) => {
        const serializedDays = Object.entries(dayMap).reduce((dayAcc, [day, rawValue]) => {
          const hours = Number.parseInt(String(rawValue || '').trim(), 10);
          if (Number.isFinite(hours) && hours >= 0 && sortedDays.includes(Number(day))) {
            dayAcc[String(day)] = hours;
          }
          return dayAcc;
        }, {});
        if (Object.keys(serializedDays).length > 0) {
          acc[communityName] = serializedDays;
        }
        return acc;
      }, {});

      const nextFulfillmentConfig = {
        ...existingConfig,
        weeklyDeliveryDays: sortedDays,
        weeklyDaysByCommunity,
        weeklyCutoffByDay: serializedDefaultCutoffs,
        cutoffByWeekdayByCommunity: serializedCommunityCutoffs,
      };

      await updateDoc(doc(db, 'Orders', selectedOrder.id), {
        fulfillmentConfig: nextFulfillmentConfig,
        pickupSpots: orderCommunities,
        updatedAt: new Date(),
      });

      setOrders((prev) => prev.map((order) => (
        order.id === selectedOrder.id
          ? { ...order, fulfillmentConfig: nextFulfillmentConfig, pickupSpots: orderCommunities }
          : order
      )));

      Swal.fire('נשמר', 'ימי המשלוח וזמני החיתוך נשמרו', 'success');
    } catch (error) {
      console.error('Error saving business weekly settings:', error);
      Swal.fire('שגיאה', 'שמירה נכשלה', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleArchive = async () => {
    if (!selectedBusiness) return;
    const nextArchived = !selectedBusiness.weeklyCutoffArchived;
    const confirm = await Swal.fire({
      title: nextArchived ? 'להעביר לארכיון?' : 'להחזיר מארכיון?',
      text: nextArchived
        ? 'העסק לא יופיע ברשימת העסקים הפעילים לניהול שבועי.'
        : 'העסק יחזור לרשימת העסקים הפעילים.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: nextArchived ? 'העבר לארכיון' : 'החזר לרשימה',
      cancelButtonText: 'ביטול',
    });
    if (!confirm.isConfirmed) return;

    setArchiveSaving(true);
    try {
      await updateDoc(doc(db, 'businesses', selectedBusiness.id), {
        weeklyCutoffArchived: nextArchived,
        weeklyCutoffArchivedAt: serverTimestamp(),
      });
      setBusinesses((prev) => prev.map((entry) => (
        entry.id === selectedBusiness.id
          ? { ...entry, weeklyCutoffArchived: nextArchived }
          : entry
      )));
      if (nextArchived) {
        setShowArchived(false);
      }
      Swal.fire('נשמר', nextArchived ? 'העסק הועבר לארכיון' : 'העסק הוחזר לרשימה הפעילה', 'success');
    } catch (error) {
      console.error('Error archiving business:', error);
      Swal.fire('שגיאה', 'עדכון הארכיון נכשל', 'error');
    } finally {
      setArchiveSaving(false);
    }
  };

  const handleToggleOrderFormEnabled = async () => {
    if (!selectedOrder) return;
    const nextEnabled = !isAlwaysOnGroceryOrderEnabled(selectedOrder);
    const existingConfig = selectedOrder.fulfillmentConfig || {};
    const updatedAt = new Date().toISOString();
    const nextFulfillmentConfig = {
      ...existingConfig,
      enabled: nextEnabled,
      orderFormEnabled: nextEnabled,
      orderFormStatusUpdatedAt: updatedAt,
      ...(nextEnabled ? { disabledAt: null, disabledBy: null } : {
        disabledAt: updatedAt,
        disabledBy: 'admin',
      }),
    };

    setOrderStatusSaving(true);
    try {
      await updateDoc(doc(db, 'Orders', selectedOrder.id), {
        alwaysOnEnabled: nextEnabled,
        alwaysOnDisabled: !nextEnabled,
        fulfillmentConfig: nextFulfillmentConfig,
        updatedAt: new Date(),
      });

      setOrders((prev) => prev.map((order) => (
        order.id === selectedOrder.id
          ? {
              ...order,
              alwaysOnEnabled: nextEnabled,
              alwaysOnDisabled: !nextEnabled,
              fulfillmentConfig: nextFulfillmentConfig,
            }
          : order
      )));

      Swal.fire(
        'נשמר',
        nextEnabled ? 'טופס ההזמנה הופעל' : 'טופס ההזמנה כובה',
        'success'
      );
    } catch (error) {
      console.error('Error updating order form status:', error);
      Swal.fire('שגיאה', 'עדכון סטטוס טופס ההזמנה נכשל', 'error');
    } finally {
      setOrderStatusSaving(false);
    }
  };

  const activeCount = businesses.filter((entry) => !entry.weeklyCutoffArchived).length;
  const archivedCount = businesses.filter((entry) => entry.weeklyCutoffArchived).length;

  return (
    <div className="bg-white rounded-lg shadow p-5 mb-6 space-y-5 border-t-4 border-purple-600">
      <div>
        <h2 className="text-xl font-semibold mb-1">ימי משלוח וזמני חיתוך לעסקים שבועיים</h2>
        <p className="text-sm text-gray-600">
          בחרו טופס הזמנה, ימי משלוח, וזמן סגירה לכל יום. ברירת המחדל חלה על כל הקהילות; אפשר לבחור קהילות ולדרוס זמן סגירה.
        </p>
      </div>

      {loadingBusinesses ? (
        <div className="py-8">
          <LoadingSpinner />
        </div>
      ) : businesses.length === 0 ? (
        <p className="text-gray-500">לא נמצאו עסקים שבועיים.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setShowArchived(false)}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                !showArchived ? 'bg-purple-700 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              פעילים ({activeCount})
            </button>
            <button
              type="button"
              onClick={() => setShowArchived(true)}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                showArchived ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              בארכיון ({archivedCount})
            </button>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="חיפוש עסק..."
              className="flex-1 min-w-[200px] border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>

          {visibleBusinesses.length === 0 ? (
            <p className="text-gray-500">
              {showArchived ? 'אין עסקים בארכיון.' : 'אין עסקים פעילים.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-1 border border-gray-200 rounded-lg max-h-80 overflow-y-auto divide-y">
                {visibleBusinesses.map((entry) => {
                  const selected = entry.id === selectedBusinessId;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setSelectedBusinessId(entry.id)}
                      className={`w-full text-right px-4 py-3 transition-colors ${
                        selected ? 'bg-purple-50 text-purple-900' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="font-medium">{getBusinessLabel(entry.id, entry)}</div>
                      {entry.email && (
                        <div className="text-xs text-gray-500 truncate">{entry.email}</div>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="lg:col-span-2 space-y-4">
                {selectedBusiness && (
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div>
                      <p className="font-semibold">{getBusinessLabel(selectedBusiness.id, selectedBusiness)}</p>
                      <p className="text-xs text-gray-500">מזהה: {selectedBusiness.id}</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleToggleArchive}
                      disabled={archiveSaving}
                      className={`px-4 py-2 rounded-md text-sm font-medium text-white disabled:opacity-60 ${
                        selectedBusiness.weeklyCutoffArchived
                          ? 'bg-green-600 hover:bg-green-700'
                          : 'bg-gray-600 hover:bg-gray-700'
                      }`}
                    >
                      {archiveSaving
                        ? 'שומר...'
                        : (selectedBusiness.weeklyCutoffArchived ? 'החזר מארכיון' : 'העבר לארכיון')}
                    </button>
                  </div>
                )}

                {ordersLoading ? (
                  <div className="py-6">
                    <LoadingSpinner />
                  </div>
                ) : orders.length === 0 ? (
                  <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-yellow-900 text-sm">
                    לעסק זה אין טופס חנות קבועה פעיל.
                  </div>
                ) : (
                  <>
                    <label>
                      <span className="block text-sm font-medium text-gray-700 mb-1">טופס הזמנה</span>
                      <select
                        value={selectedOrderId}
                        onChange={(event) => setSelectedOrderId(event.target.value)}
                        className="w-full border border-gray-300 rounded-md px-3 py-2"
                      >
                        {orders.map((order) => (
                          <option key={order.id} value={order.id}>
                            {order.orderName || order.businessName || order.id}
                          </option>
                        ))}
                      </select>
                    </label>

                    {selectedOrder && (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-gray-200 p-3">
                        <div>
                          <p className="text-sm font-medium text-gray-700">סטטוס טופס</p>
                          <p className={`text-sm font-semibold ${isAlwaysOnGroceryOrderEnabled(selectedOrder) ? 'text-green-700' : 'text-red-700'}`}>
                            {isAlwaysOnGroceryOrderEnabled(selectedOrder) ? 'פעיל' : 'כבוי'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleToggleOrderFormEnabled}
                          disabled={orderStatusSaving}
                          className={`px-4 py-2 rounded-md text-white text-sm disabled:bg-gray-400 ${
                            isAlwaysOnGroceryOrderEnabled(selectedOrder)
                              ? 'bg-red-600 hover:bg-red-700'
                              : 'bg-green-600 hover:bg-green-700'
                          }`}
                        >
                          {orderStatusSaving
                            ? 'שומר...'
                            : (isAlwaysOnGroceryOrderEnabled(selectedOrder) ? 'כבה טופס' : 'הפעל טופס')}
                        </button>
                      </div>
                    )}

                    {schedulesLoading ? (
                      <div className="py-6">
                        <LoadingSpinner />
                      </div>
                    ) : availableDeliveryDays.length === 0 ? (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800 text-sm">
                        לא הוגדרו ימי משלוח לקהילות של הטופס. הגדירו לוחות משלוחים בחלק העליון של העמוד.
                      </div>
                    ) : (
                      <div className="border border-gray-200 rounded-lg p-4 space-y-5">
                        <div className="text-sm text-gray-600 space-y-1">
                          <p className="font-medium text-gray-800">ימי משלוח לפי קהילה:</p>
                          {Object.entries(communityDayMap).map(([communityName, days]) => (
                            <p key={communityName}>
                              <span className="font-medium">{communityName}:</span>{' '}
                              {days.length > 0
                                ? days.map((day) => WEEK_DAYS.find((w) => w.value === day)?.label).filter(Boolean).join(', ')
                                : 'לא הוגדר'}
                            </p>
                          ))}
                        </div>

                        <div>
                          <h3 className="font-semibold mb-2">באילו ימים העסק משתתף?</h3>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            {WEEK_DAYS.filter((day) => availableDeliveryDays.includes(day.value)).map((day) => {
                              const selected = selectedWeeklyDays.includes(day.value);
                              return (
                                <button
                                  key={day.value}
                                  type="button"
                                  onClick={() => toggleWeeklyDay(day.value)}
                                  className={`p-3 rounded-lg border-2 text-sm font-medium transition ${
                                    selected
                                      ? 'border-purple-600 bg-purple-50 text-purple-900'
                                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                  }`}
                                >
                                  {day.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {participatingDayOptions.length > 0 && (
                          <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
                            <div>
                              <h3 className="font-semibold">זמני חיתוך — ברירת מחדל (כל הקהילות)</h3>
                              <p className="text-xs text-gray-500 mt-1">
                                כמה שעות לפני סוף יום המשלוח נסגרת ההזמנה. לדוגמה: משלוח ביום שישי עם 34 שעות — החיתוך ביום חמישי בערב.
                                אם לא מוגדר — נעשה שימוש בברירת המחדל של לוח הקהילה.
                              </p>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {participatingDayOptions.map((day) => (
                                <label key={day.value} className="flex items-center justify-between gap-3 bg-white border rounded-md px-3 py-2">
                                  <span className="text-sm font-medium">{day.label}</span>
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      inputMode="numeric"
                                      value={weeklyCutoffByDay[day.value] || ''}
                                      onChange={(event) => setDefaultCutoffHours(day.value, event.target.value)}
                                      placeholder="—"
                                      className="border border-gray-300 rounded px-2 py-1 text-sm w-20"
                                    />
                                    <span className="text-xs text-gray-500">שעות</span>
                                  </div>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}

                        {participatingDayOptions.length > 0 && (
                          <div className="p-4 bg-purple-50 rounded-lg border border-purple-200 space-y-3">
                            <div>
                              <h3 className="font-semibold">חריגים לפי קהילה</h3>
                              <p className="text-xs text-gray-600 mt-1">
                                בחרו קהילות וקבעו מספר שעות שונה לפני משלוח ליום מסוים.
                              </p>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {getOrderCommunities(selectedOrder).map((communityName) => {
                                const selected = overrideCommunities.includes(communityName);
                                return (
                                  <button
                                    key={communityName}
                                    type="button"
                                    onClick={() => toggleOverrideCommunity(communityName)}
                                    className={`px-3 py-1.5 rounded-full border text-sm ${
                                      selected
                                        ? 'bg-purple-700 border-purple-800 text-white'
                                        : 'bg-white border-gray-300 text-gray-700'
                                    }`}
                                  >
                                    {communityName}
                                  </button>
                                );
                              })}
                            </div>

                            {overrideCommunities.map((communityName) => {
                              const communityDays = (communityDayMap[communityName] || [])
                                .filter((day) => selectedWeeklyDays.includes(day));
                              if (communityDays.length === 0) {
                                return (
                                  <p key={communityName} className="text-sm text-gray-500">
                                    {communityName}: אין ימי משלוח משותפים עם העסק.
                                  </p>
                                );
                              }

                              return (
                                <div key={communityName} className="bg-white border border-purple-100 rounded-md p-3 space-y-2">
                                  <p className="font-medium text-sm">{communityName}</p>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {communityDays.map((dayValue) => {
                                      const dayLabel = WEEK_DAYS.find((day) => day.value === dayValue)?.label;
                                      const defaultHours = formatCutoffHoursLabel(weeklyCutoffByDay[dayValue]);
                                      const overrideHours = communityCutoffOverrides[communityName]?.[dayValue] || '';
                                      return (
                                        <label key={`${communityName}-${dayValue}`} className="flex items-center justify-between gap-3 border rounded-md px-3 py-2">
                                          <span className="text-sm">
                                            {dayLabel}
                                            {defaultHours && (
                                              <span className="block text-xs text-gray-500">ברירת מחדל: {defaultHours}</span>
                                            )}
                                          </span>
                                          <div className="flex items-center gap-1">
                                            <input
                                              type="number"
                                              min="0"
                                              step="1"
                                              inputMode="numeric"
                                              value={overrideHours}
                                              placeholder={weeklyCutoffByDay[dayValue] || '—'}
                                              onChange={(event) => setCommunityCutoffHours(
                                                communityName,
                                                dayValue,
                                                event.target.value
                                              )}
                                              className="border border-gray-300 rounded px-2 py-1 text-sm w-20"
                                            />
                                            <span className="text-xs text-gray-500">שעות</span>
                                          </div>
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={handleSave}
                          disabled={saving}
                          className="w-full px-4 py-2.5 bg-purple-700 hover:bg-purple-800 disabled:bg-gray-400 text-white rounded-md font-medium"
                        >
                          {saving ? 'שומר...' : 'שמור הגדרות'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AdminBusinessWeeklyCutoffs;
