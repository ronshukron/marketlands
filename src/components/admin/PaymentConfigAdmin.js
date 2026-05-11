import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { pickupSpots } from '../../data/pickupSpots';
import {
  getDelayedPaymentSpots,
  setDelayedPaymentSpots,
  getPaymentRoutingConfig,
  setPaymentRoutingConfig,
  getReusableCartonConfig,
  setReusableCartonConfig
} from '../../services/paymentConfigService';
import Swal from 'sweetalert2';

const PaymentConfigAdmin = () => {
  const navigate = useNavigate();
  const [delayedSpots, setDelayedSpots] = useState([]);
  const [regularPaymentProvider, setRegularPaymentProvider] = useState('bit_legacy');
  const [delayedPaymentGateway, setDelayedPaymentGateway] = useState('grow_j5_legacy');
  const [reusableCartonEnabledSpots, setReusableCartonEnabledSpots] = useState([]);
  const [reusableCartonDefaultSpots, setReusableCartonDefaultSpots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const [spots, routingConfig, reusableCartonConfig] = await Promise.all([
        getDelayedPaymentSpots(),
        getPaymentRoutingConfig(),
        getReusableCartonConfig()
      ]);
      setDelayedSpots(spots);
      setRegularPaymentProvider(routingConfig.regularPaymentProvider);
      setDelayedPaymentGateway(routingConfig.delayedPaymentGateway);
      setReusableCartonEnabledSpots(reusableCartonConfig.enabledSpots || []);
      setReusableCartonDefaultSpots(reusableCartonConfig.defaultSelectedSpots || []);
    } catch (error) {
      console.error('Error loading config:', error);
      Swal.fire('שגיאה', 'שגיאה בטעינת ההגדרות', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSpot = (spot) => {
    setDelayedSpots(prev => {
      if (prev.includes(spot)) {
        return prev.filter(s => s !== spot);
      } else {
        return [...prev, spot];
      }
    });
  };

  const handleSelectAll = () => {
    const filteredSpots = pickupSpots.filter(spot => 
      spot.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setDelayedSpots(prev => {
      const newSpots = new Set(prev);
      filteredSpots.forEach(spot => newSpots.add(spot));
      return Array.from(newSpots);
    });
  };

  const handleDeselectAll = () => {
    const filteredSpots = pickupSpots.filter(spot => 
      spot.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setDelayedSpots(prev => prev.filter(s => !filteredSpots.includes(s)));
  };

  const handleToggleReusableCartonEnabled = (spot) => {
    if (reusableCartonEnabledSpots.includes(spot)) {
      setReusableCartonEnabledSpots(prev => prev.filter(s => s !== spot));
      setReusableCartonDefaultSpots(prev => prev.filter(s => s !== spot));
      return;
    }

    setReusableCartonEnabledSpots(prev => [...prev, spot]);
  };

  const handleToggleReusableCartonDefault = (spot) => {
    if (!reusableCartonEnabledSpots.includes(spot)) return;

    setReusableCartonDefaultSpots(prev => {
      if (prev.includes(spot)) {
        return prev.filter(s => s !== spot);
      }
      return [...prev, spot];
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const [spotsSaved, routingSaved, reusableCartonSaved] = await Promise.all([
        setDelayedPaymentSpots(delayedSpots),
        setPaymentRoutingConfig({
          regularPaymentProvider,
          delayedPaymentGateway
        }),
        setReusableCartonConfig({
          enabledSpots: reusableCartonEnabledSpots,
          defaultSelectedSpots: reusableCartonDefaultSpots
        })
      ]);

      if (spotsSaved && routingSaved && reusableCartonSaved) {
        Swal.fire({
          icon: 'success',
          title: 'נשמר בהצלחה',
          text: 'הגדרות התשלום עודכנו',
          timer: 2000,
          showConfirmButton: false
        });
      } else {
        throw new Error('Failed to save');
      }
    } catch (error) {
      console.error('Error saving config:', error);
      Swal.fire('שגיאה', 'שגיאה בשמירת ההגדרות', 'error');
    } finally {
      setSaving(false);
    }
  };

  const filteredPickupSpots = pickupSpots.filter(spot => 
    spot.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const delayedCount = delayedSpots.length;
  const regularCount = pickupSpots.length - delayedCount;
  const reusableCartonCount = reusableCartonEnabledSpots.length;
  const reusableCartonDefaultCount = reusableCartonDefaultSpots.length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-700 mx-auto"></div>
          <p className="mt-4 text-gray-600">טוען הגדרות...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4" dir="rtl">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6">
          <div className="bg-purple-700 text-white px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">הגדרות תשלום לפי נקודת איסוף</h1>
                <p className="text-purple-200 text-sm mt-1">
                  בחר אילו נקודות איסוף ישתמשו בתשלום מושהה (J5)
                </p>
              </div>
              <button
                onClick={() => navigate('/admin')}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg transition-colors"
              >
                חזרה לניהול
              </button>
            </div>
          </div>

          {/* Provider Routing */}
          <div className="p-6 border-t border-gray-100 bg-white">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">ניתוב ספק תשלום</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  תשלום רגיל
                </label>
                <select
                  value={regularPaymentProvider}
                  onChange={(e) => setRegularPaymentProvider(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                >
                  <option value="bit_legacy">Bit (legacy)</option>
                  <option value="grow_payment_link">Grow Payment Link (wallets)</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  קובע את ספק התשלום בעמוד התשלום הרגיל.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  תשלום מושהה
                </label>
                <select
                  value={delayedPaymentGateway}
                  onChange={(e) => setDelayedPaymentGateway(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                >
                  <option value="grow_j5_legacy">Grow J5 (legacy)</option>
                  <option value="grow_payment_link">Grow Payment Link (wallets)</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  קובע את ספק התשלום בעמוד התשלום המושהה.
                </p>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-6 bg-purple-50">
            <div className="bg-white rounded-lg p-4 shadow-sm border-r-4 border-purple-500">
              <div className="text-3xl font-bold text-purple-700">{delayedCount}</div>
              <div className="text-sm text-gray-600">נקודות תשלום מושהה (J5)</div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm border-r-4 border-green-500">
              <div className="text-3xl font-bold text-green-700">{regularCount}</div>
              <div className="text-sm text-gray-600">נקודות תשלום רגיל</div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm border-r-4 border-emerald-500">
              <div className="text-3xl font-bold text-emerald-700">{reusableCartonCount}</div>
              <div className="text-sm text-gray-600">אפשרות קרטונים בשימוש חוזר</div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm border-r-4 border-lime-500">
              <div className="text-3xl font-bold text-lime-700">{reusableCartonDefaultCount}</div>
              <div className="text-sm text-gray-600">מסומן כברירת מחדל</div>
            </div>
          </div>
        </div>

        {/* Search and Actions */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="relative w-full sm:w-auto flex-1 max-w-md">
              <input
                type="text"
                placeholder="חיפוש נקודת איסוף..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
              <svg
                className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={handleSelectAll}
                className="px-4 py-2 text-sm bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors"
              >
                בחר הכל (מסונן)
              </button>
              <button
                onClick={handleDeselectAll}
                className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                בטל הכל (מסונן)
              </button>
            </div>
          </div>
        </div>

        {/* Pickup Spots Grid */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6">
          <div className="p-4 bg-gray-50 border-b">
            <h2 className="text-lg font-semibold text-gray-800">
              נקודות איסוף ({filteredPickupSpots.length})
            </h2>
          </div>
          
          <div className="p-4 max-h-[500px] overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredPickupSpots.map((spot) => {
                const isDelayed = delayedSpots.includes(spot);
                return (
                  <button
                    key={spot}
                    onClick={() => handleToggleSpot(spot)}
                    className={`p-3 rounded-lg border-2 text-right transition-all ${
                      isDelayed
                        ? 'border-purple-500 bg-purple-50 text-purple-800'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm truncate">{spot}</span>
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                        isDelayed ? 'bg-purple-500' : 'bg-gray-200'
                      }`}>
                        {isDelayed && (
                          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <div className={`text-xs mt-1 ${isDelayed ? 'text-purple-600' : 'text-gray-500'}`}>
                      {isDelayed ? 'תשלום מושהה (J5)' : 'תשלום רגיל'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Reusable Cartons Grid */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6">
          <div className="p-4 bg-emerald-50 border-b border-emerald-100">
            <h2 className="text-lg font-semibold text-emerald-900">
              קרטוני חקלאים / קרטונים בשימוש חוזר ({filteredPickupSpots.length})
            </h2>
            <p className="text-sm text-emerald-700 mt-1">
              הפעלה לפי קהילה, ובחירה אם הצ'קבוקס יהיה מסומן ללקוח כברירת מחדל.
            </p>
          </div>

          <div className="p-4 max-h-[500px] overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredPickupSpots.map((spot) => {
                const isEnabled = reusableCartonEnabledSpots.includes(spot);
                const isDefault = reusableCartonDefaultSpots.includes(spot);
                return (
                  <div
                    key={spot}
                    className={`p-3 rounded-lg border-2 transition-all ${
                      isEnabled
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                        : 'border-gray-200 bg-white text-gray-700'
                    }`}
                  >
                    <div className="font-medium text-sm truncate mb-3">{spot}</div>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        onChange={() => handleToggleReusableCartonEnabled(spot)}
                        className="h-4 w-4 text-emerald-600 border-gray-300 rounded"
                      />
                      <span>הצג אפשרות ללקוח</span>
                    </label>
                    <label className={`mt-2 flex items-center gap-2 text-sm ${isEnabled ? 'cursor-pointer' : 'cursor-not-allowed text-gray-400'}`}>
                      <input
                        type="checkbox"
                        checked={isDefault}
                        onChange={() => handleToggleReusableCartonDefault(spot)}
                        disabled={!isEnabled}
                        className="h-4 w-4 text-lime-600 border-gray-300 rounded disabled:opacity-50"
                      />
                      <span>מסומן כברירת מחדל</span>
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              <span className="font-medium text-purple-700">{delayedCount}</span> נקודות יעברו לתשלום מושהה,{' '}
              <span className="font-medium text-green-700">{regularCount}</span> ישארו בתשלום רגיל,{' '}
              <span className="font-medium text-emerald-700">{reusableCartonCount}</span> יקבלו אפשרות לקרטונים בשימוש חוזר
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className={`px-8 py-3 rounded-lg font-bold text-white transition-colors ${
                saving
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-purple-700 hover:bg-purple-800'
              }`}
            >
              {saving ? 'שומר...' : 'שמור שינויים'}
            </button>
          </div>
        </div>

        {/* Info Box */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">איך זה עובד?</p>
              <ul className="list-disc list-inside space-y-1 text-blue-700">
                <li>הבחירה בנקודת איסוף קובעת אם הלקוח הולך לתשלום רגיל או מושהה</li>
                <li>רשימות הספקים למעלה קובעות איזה endpoint יופעל בכל זרימה</li>
                <li>אם הלקוח משנה נקודת איסוף בדף התשלום, הוא יועבר אוטומטית לדף הנכון</li>
                <li>לקוחות שלא בחרו נקודת איסוף יועברו לתשלום רגיל כברירת מחדל</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentConfigAdmin;
