import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import Swal from 'sweetalert2';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import {
  generateAvailableDeliveryDates,
  getEffectiveOrderCutoffAt,
  isAlwaysOnGroceryOrderEnabled,
} from '../../utils/deliveryScheduleUtils';
import LoadingSpinner from '../LoadingSpinner';

const toDatetimeLocal = (value) => {
  if (!value) return '';
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const AlwaysOnCutoffSettings = () => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orders, setOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [selectedCommunity, setSelectedCommunity] = useState('');
  const [schedule, setSchedule] = useState(null);
  const [cutoffs, setCutoffs] = useState({});
  const [dateAvailability, setDateAvailability] = useState({});
  const [isIndependent, setIsIndependent] = useState(null);
  const [bulkSelectedCommunities, setBulkSelectedCommunities] = useState([]);
  const [bulkDateOptions, setBulkDateOptions] = useState([]);
  const [bulkDate, setBulkDate] = useState('');
  const [bulkCutoffAt, setBulkCutoffAt] = useState('');
  const [bulkParticipates, setBulkParticipates] = useState(true);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [orderStatusSaving, setOrderStatusSaving] = useState(false);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) || null,
    [orders, selectedOrderId]
  );

  useEffect(() => {
    const loadBusinessAndOrders = async () => {
      if (!currentUser?.uid) return;
      setLoading(true);
      try {
        const businessSnap = await getDoc(doc(db, 'businesses', currentUser.uid));
        const businessData = businessSnap.exists() ? businessSnap.data() : {};
        const independent = businessData.isIndependent === true || businessData.IsIndependent === true;
        setIsIndependent(independent);
        if (independent) {
          setOrders([]);
          return;
        }

        const ordersSnapshot = await getDocs(query(
          collection(db, 'Orders'),
          where('businessId', '==', currentUser.uid)
        ));
        const alwaysOnOrders = ordersSnapshot.docs
          .map((orderDoc) => ({ id: orderDoc.id, ...orderDoc.data() }))
          .filter((order) => (
            order.orderMode === 'always_on_grocery'
            || order.orderType === 'always_on_grocery'
            || order.alwaysOn === true
            || order.groceryStore === true
          ))
          .filter((order) => order.archived !== true);

        setOrders(alwaysOnOrders);
        if (alwaysOnOrders.length > 0) {
          setSelectedOrderId(alwaysOnOrders[0].id);
          setSelectedCommunity(alwaysOnOrders[0].pickupSpots?.[0] || '');
        }
      } catch (error) {
        console.error('Error loading always-on cutoff settings:', error);
        Swal.fire('שגיאה', 'טעינת ההגדרות נכשלה', 'error');
      } finally {
        setLoading(false);
      }
    };

    loadBusinessAndOrders();
  }, [currentUser?.uid]);

  useEffect(() => {
    if (!selectedOrder) return;
    const firstSpot = selectedOrder.pickupSpots?.[0] || '';
    if (!selectedOrder.pickupSpots?.includes(selectedCommunity)) {
      setSelectedCommunity(firstSpot);
    }
    setBulkSelectedCommunities((prev) => (
      prev.length > 0
        ? prev.filter((communityName) => selectedOrder.pickupSpots?.includes(communityName))
        : (firstSpot ? [firstSpot] : [])
    ));
  }, [selectedOrder, selectedCommunity]);

  useEffect(() => {
    const loadBulkDateOptions = async () => {
      setBulkDateOptions([]);
      if (!selectedOrder || bulkSelectedCommunities.length === 0) {
        setBulkDate('');
        return;
      }

      try {
        const dates = new Set();
        await Promise.all(bulkSelectedCommunities.map(async (communityName) => {
          const scheduleSnap = await getDoc(doc(db, 'deliverySchedules', communityName));
          if (!scheduleSnap.exists()) return;
          const scheduleData = scheduleSnap.data();
          generateAvailableDeliveryDates(scheduleData, {
            includePastCutoff: true,
            orderData: selectedOrder,
            communityName,
          }).slice(0, 16).forEach((dateKey) => dates.add(dateKey));
        }));

        const sortedDates = Array.from(dates).sort();
        setBulkDateOptions(sortedDates);
        setBulkDate((current) => (sortedDates.includes(current) ? current : (sortedDates[0] || '')));
      } catch (error) {
        console.error('Error loading bulk cutoff dates:', error);
        setBulkDateOptions([]);
        setBulkDate('');
      }
    };

    loadBulkDateOptions();
  }, [selectedOrder, bulkSelectedCommunities]);

  useEffect(() => {
    const loadSchedule = async () => {
      setSchedule(null);
      setCutoffs({});
      setDateAvailability({});
      if (!selectedOrder || !selectedCommunity) return;

      try {
        const scheduleSnap = await getDoc(doc(db, 'deliverySchedules', selectedCommunity));
        if (!scheduleSnap.exists()) {
          setSchedule(null);
          return;
        }
        const scheduleData = scheduleSnap.data();
        setSchedule(scheduleData);

        const dates = generateAvailableDeliveryDates(scheduleData, {
          includePastCutoff: true,
          orderData: selectedOrder,
          communityName: selectedCommunity,
        });
        const existing = selectedOrder.fulfillmentConfig?.cutoffOverrides?.[selectedCommunity] || {};
        const existingAvailability = selectedOrder.fulfillmentConfig?.deliveryDateAvailability?.[selectedCommunity] || {};
        const nextCutoffs = {};
        const nextAvailability = {};
        dates.slice(0, 16).forEach((dateKey) => {
          nextCutoffs[dateKey] = toDatetimeLocal(
            existing[dateKey]?.cutoffAt
            || getEffectiveOrderCutoffAt(dateKey, scheduleData, selectedOrder, selectedCommunity)
          );
          nextAvailability[dateKey] = existingAvailability[dateKey]?.enabled !== false;
        });
        setCutoffs(nextCutoffs);
        setDateAvailability(nextAvailability);
      } catch (error) {
        console.error('Error loading delivery schedule:', error);
        Swal.fire('שגיאה', 'טעינת לוח המשלוחים נכשלה', 'error');
      }
    };

    loadSchedule();
  }, [selectedOrder, selectedCommunity]);

  const handleSave = async () => {
    if (!selectedOrder || !selectedCommunity) return;
    setSaving(true);
    try {
      const existingConfig = selectedOrder.fulfillmentConfig || {};
      const existingOverrides = existingConfig.cutoffOverrides || {};
      const existingAvailability = existingConfig.deliveryDateAvailability || {};
      const communityOverrides = {};
      const communityAvailability = {};
      Object.entries(cutoffs).forEach(([dateKey, value]) => {
        if (value) {
          communityOverrides[dateKey] = {
            cutoffAt: new Date(value).toISOString(),
            updatedAt: new Date().toISOString(),
          };
        }
        communityAvailability[dateKey] = {
          enabled: dateAvailability[dateKey] !== false,
          updatedAt: new Date().toISOString(),
        };
      });

      const nextFulfillmentConfig = {
        ...existingConfig,
        cutoffOverrides: {
          ...existingOverrides,
          [selectedCommunity]: communityOverrides,
        },
        deliveryDateAvailability: {
          ...existingAvailability,
          [selectedCommunity]: communityAvailability,
        },
      };

      await updateDoc(doc(db, 'Orders', selectedOrder.id), {
        fulfillmentConfig: nextFulfillmentConfig,
        updatedAt: new Date(),
      });

      setOrders((prev) => prev.map((order) => (
        order.id === selectedOrder.id
          ? { ...order, fulfillmentConfig: nextFulfillmentConfig }
          : order
      )));
      Swal.fire('נשמר', 'זמני החיתוך נשמרו בהצלחה', 'success');
    } catch (error) {
      console.error('Error saving cutoff settings:', error);
      Swal.fire('שגיאה', 'שמירת זמני החיתוך נכשלה', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleBulkCommunity = (communityName) => {
    setBulkSelectedCommunities((prev) => (
      prev.includes(communityName)
        ? prev.filter((name) => name !== communityName)
        : [...prev, communityName]
    ));
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
        disabledBy: currentUser?.uid || null,
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
        nextEnabled ? 'טופס ההזמנה הופעל מחדש' : 'טופס ההזמנה כובה ולא יוצג ללקוחות',
        'success'
      );
    } catch (error) {
      console.error('Error updating always-on order form status:', error);
      Swal.fire('שגיאה', 'עדכון סטטוס טופס ההזמנה נכשל', 'error');
    } finally {
      setOrderStatusSaving(false);
    }
  };

  const handleBulkSave = async () => {
    if (!selectedOrder || bulkSelectedCommunities.length === 0 || !bulkDate) {
      Swal.fire('שגיאה', 'בחרו קהילות ותאריך משלוח', 'error');
      return;
    }

    setBulkSaving(true);
    try {
      const existingConfig = selectedOrder.fulfillmentConfig || {};
      const existingOverrides = existingConfig.cutoffOverrides || {};
      const existingAvailability = existingConfig.deliveryDateAvailability || {};
      const cutoffAtIso = bulkCutoffAt ? new Date(bulkCutoffAt).toISOString() : '';
      const updatedAt = new Date().toISOString();

      const nextOverrides = { ...existingOverrides };
      const nextAvailability = { ...existingAvailability };
      bulkSelectedCommunities.forEach((communityName) => {
        if (cutoffAtIso) {
          nextOverrides[communityName] = {
            ...(nextOverrides[communityName] || {}),
            [bulkDate]: {
              cutoffAt: cutoffAtIso,
              updatedAt,
            },
          };
        }
        nextAvailability[communityName] = {
          ...(nextAvailability[communityName] || {}),
          [bulkDate]: {
            enabled: Boolean(bulkParticipates),
            updatedAt,
          },
        };
      });

      const nextFulfillmentConfig = {
        ...existingConfig,
        cutoffOverrides: nextOverrides,
        deliveryDateAvailability: nextAvailability,
      };

      await updateDoc(doc(db, 'Orders', selectedOrder.id), {
        fulfillmentConfig: nextFulfillmentConfig,
        updatedAt: new Date(),
      });

      setOrders((prev) => prev.map((order) => (
        order.id === selectedOrder.id
          ? { ...order, fulfillmentConfig: nextFulfillmentConfig }
          : order
      )));

      if (bulkSelectedCommunities.includes(selectedCommunity) && bulkDate) {
        if (bulkCutoffAt) {
          setCutoffs((prev) => ({
            ...prev,
            [bulkDate]: bulkCutoffAt,
          }));
        }
        setDateAvailability((prev) => ({
          ...prev,
          [bulkDate]: Boolean(bulkParticipates),
        }));
      }

      Swal.fire('נשמר', `זמן החיתוך נשמר עבור ${bulkSelectedCommunities.length} קהילות`, 'success');
    } catch (error) {
      console.error('Error saving bulk cutoff settings:', error);
      Swal.fire('שגיאה', 'שמירת זמן החיתוך נכשלה', 'error');
    } finally {
      setBulkSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (isIndependent) {
    return (
      <div className="max-w-3xl mx-auto p-6" dir="rtl">
        <h1 className="text-2xl font-bold mb-4">זמני חיתוך לחנות קבועה</h1>
        <p className="text-gray-600">עמוד זה זמין רק לעסקים שאינם עצמאיים.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6" dir="rtl">
      <h1 className="text-2xl font-bold mb-2">זמני חיתוך לחנות קבועה</h1>
      <p className="text-gray-600 mb-6">
        כאן אפשר לקבוע מתי המוצרים שלכם מפסיקים להופיע באתר עבור כל תאריך משלוח.
      </p>

      {orders.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-6 text-center text-gray-600">
          אין לכם עדיין מודעות מסוג חנות קבועה.
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg shadow p-5 mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <label>
              <span className="block text-sm font-medium text-gray-700 mb-1">חנות קבועה</span>
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
              <div className="flex flex-col gap-2 rounded-md border border-gray-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-700">סטטוס טופס הזמנה</p>
                    <p className={`text-sm font-semibold ${isAlwaysOnGroceryOrderEnabled(selectedOrder) ? 'text-green-700' : 'text-red-700'}`}>
                      {isAlwaysOnGroceryOrderEnabled(selectedOrder) ? 'פעיל ומוצג ללקוחות' : 'כבוי ולא מוצג ללקוחות'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleOrderFormEnabled}
                    disabled={orderStatusSaving}
                    className={`px-4 py-2 rounded-md text-white disabled:bg-gray-400 ${
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
                <p className="text-xs text-gray-500">
                  כיבוי הטופס מסתיר את כל מוצרי החנות הקבועה הזו מהעמוד הראשי ומונע הזמנות חדשות.
                </p>
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow p-5 mb-6 space-y-4">
            <div>
              <h2 className="text-xl font-semibold mb-1">הגדרה מהירה לכמה קהילות</h2>
              <p className="text-sm text-gray-600">
                בחרו קהילות בלחיצה, בחרו תאריך משלוח וזמן חיתוך אחד, ושמרו לכולן יחד.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-sm font-medium text-gray-700">
                  קהילות נבחרות ({bulkSelectedCommunities.length})
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setBulkSelectedCommunities(selectedOrder?.pickupSpots || [])}
                    className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100"
                  >
                    בחר הכל
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkSelectedCommunities([])}
                    className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
                  >
                    נקה
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 border border-gray-100 rounded-md p-2">
                {(selectedOrder?.pickupSpots || []).map((spot) => {
                  const selected = bulkSelectedCommunities.includes(spot);
                  return (
                    <button
                      key={spot}
                      type="button"
                      onClick={() => toggleBulkCommunity(spot)}
                      className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${
                        selected
                          ? 'bg-purple-600 border-purple-700 text-white'
                          : 'bg-white border-gray-300 text-gray-700 hover:border-purple-400'
                      }`}
                    >
                      {spot}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label>
                <span className="block text-sm font-medium text-gray-700 mb-1">תאריך משלוח</span>
                <select
                  value={bulkDate}
                  onChange={(event) => setBulkDate(event.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  {bulkDateOptions.length === 0 && (
                    <option value="">אין תאריכים זמינים</option>
                  )}
                  {bulkDateOptions.map((dateKey) => (
                    <option key={dateKey} value={dateKey}>
                      {new Date(`${dateKey}T00:00:00`).toLocaleDateString('he-IL', {
                        weekday: 'long',
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="block text-sm font-medium text-gray-700 mb-1">זמן חיתוך משותף (אופציונלי)</span>
                <input
                  type="datetime-local"
                  value={bulkCutoffAt}
                  onChange={(event) => setBulkCutoffAt(event.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                />
              </label>
            </div>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={bulkParticipates}
                onChange={(event) => setBulkParticipates(event.target.checked)}
                className="h-4 w-4"
              />
              <span>העסק משתתף בתאריך המשלוח הזה בקהילות שנבחרו</span>
            </label>

            <button
              type="button"
              onClick={handleBulkSave}
              disabled={bulkSaving || bulkSelectedCommunities.length === 0 || !bulkDate}
              className="w-full bg-purple-700 hover:bg-purple-800 disabled:bg-gray-400 text-white font-bold py-2.5 px-4 rounded-lg"
            >
              {bulkSaving ? 'שומר...' : 'שמור זמן חיתוך לקהילות שנבחרו'}
            </button>
          </div>

          <div className="bg-white rounded-lg shadow p-5 mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h2 className="text-xl font-semibold mb-1">עריכה ותצוגה של קהילה אחת</h2>
              <p className="text-sm text-gray-600">בחרו קהילה כדי לראות את תאריכי המשלוח העתידיים שלה.</p>
            </div>
            <label>
              <span className="block text-sm font-medium text-gray-700 mb-1">קהילה</span>
              <select
                value={selectedCommunity}
                onChange={(event) => setSelectedCommunity(event.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              >
                {(selectedOrder?.pickupSpots || []).map((spot) => (
                  <option key={spot} value={spot}>{spot}</option>
                ))}
              </select>
            </label>
          </div>

          {!schedule ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800">
              לא הוגדר לוח משלוחים לקהילה הזו. מנהל צריך להגדיר אותו בעמוד לוחות משלוחים לקהילות.
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">תאריכי משלוח קרובים</h2>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-purple-700 hover:bg-purple-800 disabled:bg-gray-400 text-white rounded-md"
                >
                  {saving ? 'שומר...' : 'שמור'}
                </button>
              </div>

              <div className="space-y-3">
                {Object.keys(cutoffs).length === 0 && (
                  <p className="text-gray-500">אין תאריכי משלוח זמינים.</p>
                )}
                {Object.entries(cutoffs).map(([dateKey, cutoffValue]) => (
                  <div key={dateKey} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center border border-gray-200 rounded-md p-3">
                    <div>
                      <p className="font-semibold">{new Date(`${dateKey}T00:00:00`).toLocaleDateString('he-IL', {
                        weekday: 'long',
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })}</p>
                      <p className="text-xs text-gray-500">{dateKey}</p>
                    </div>
                    <label className="md:col-span-2">
                      <span className="block text-sm text-gray-700 mb-1">זמן חיתוך לעסק שלכם</span>
                      <input
                        type="datetime-local"
                        value={cutoffValue}
                        onChange={(event) => setCutoffs((prev) => ({
                          ...prev,
                          [dateKey]: event.target.value,
                        }))}
                        className="w-full border border-gray-300 rounded-md px-3 py-2"
                      />
                      <label className="mt-2 flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={dateAvailability[dateKey] !== false}
                          onChange={(event) => setDateAvailability((prev) => ({
                            ...prev,
                            [dateKey]: event.target.checked,
                          }))}
                          className="h-4 w-4"
                        />
                        <span>משתתף/ת בתאריך הזה</span>
                      </label>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AlwaysOnCutoffSettings;
