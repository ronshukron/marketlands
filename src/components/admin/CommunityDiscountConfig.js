import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getDiscountConfig, saveDiscountConfig } from '../../services/communityDiscountService';
import usePickupSpots from '../../hooks/usePickupSpots';

// ─── Perk definitions ───────────────────────────────────────
// To add a new perk in the future, just add an entry here.
// Each perk: { id, label, description, defaultValue, renderConfig }
const PERK_DEFINITIONS = [
  {
    id: 'baseDiscount',
    label: 'הנחה מובטחת',
    description: 'הקהילה מקבלת הנחה מינימלית ללא קשר לסכום הזמנות',
    defaultValue: { enabled: false, guaranteedTierIndex: 0 },
    renderConfig: (perkValue, tiers, onChange) => (
      <div className="mt-2">
        <label className="block text-xs text-gray-600 mb-1">רמת הנחה מובטחת:</label>
        <select
          value={perkValue?.guaranteedTierIndex ?? 0}
          onChange={(e) => onChange({ ...perkValue, guaranteedTierIndex: Number(e.target.value) })}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
        >
          {tiers.map((tier, idx) => (
            <option key={idx} value={idx}>
              רמה {idx + 1}: {tier.discountPercent}% ({tier.displayThreshold.toLocaleString('he-IL')} &#8362;)
            </option>
          ))}
        </select>
      </div>
    ),
  },
  // ── Future perks – just add more objects here ──
  // {
  //   id: 'freeDelivery',
  //   label: 'משלוח חינם',
  //   description: 'הקהילה נהנית ממשלוח חינם בכל הזמנה',
  //   defaultValue: { enabled: false },
  //   renderConfig: null, // no extra config needed
  // },
  // {
  //   id: 'priorityDelivery',
  //   label: 'עדיפות במשלוח',
  //   description: 'הקהילה מקבלת עדיפות בסדר המשלוחים',
  //   defaultValue: { enabled: false },
  //   renderConfig: null,
  // },
];

const CommunityDiscountConfig = () => {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [addingVip, setAddingVip] = useState(false);
  const [newVipCommunity, setNewVipCommunity] = useState('');
  const [communitySearch, setCommunitySearch] = useState('');
  const { pickupSpots } = usePickupSpots();

  const allCommunities = pickupSpots || [];

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await getDiscountConfig();
        // Ensure vipCommunities exists
        if (!data.vipCommunities) data.vipCommunities = {};
        setConfig(data);
      } catch (err) {
        console.error('Error loading config:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // ─── Tiers ───
  const handleToggleEnabled = () => {
    setConfig(prev => ({ ...prev, enabled: !prev.enabled }));
  };

  const handleToggleAutoApplyInV7 = () => {
    setConfig(prev => ({ ...prev, autoApplyInV7: prev.autoApplyInV7 !== true }));
  };

  const handleAvailabilityModeChange = (availabilityMode) => {
    setConfig(prev => ({ ...prev, availabilityMode }));
  };

  const handleTogglePilotCommunity = (communityName) => {
    setConfig(prev => {
      const selected = new Set(prev.pilotCommunities || []);
      if (selected.has(communityName)) selected.delete(communityName);
      else selected.add(communityName);
      return { ...prev, pilotCommunities: Array.from(selected) };
    });
  };

  const handleSelectAllPilotCommunities = () => {
    setConfig(prev => ({ ...prev, pilotCommunities: [...allCommunities] }));
  };

  const handleClearPilotCommunities = () => {
    setConfig(prev => ({ ...prev, pilotCommunities: [] }));
  };

  const handleTierChange = (index, field, value) => {
    setConfig(prev => {
      const newTiers = [...(prev.tiers || [])];
      newTiers[index] = { ...newTiers[index], [field]: Number(value) };
      return { ...prev, tiers: newTiers };
    });
  };

  const handleAddTier = () => {
    setConfig(prev => ({
      ...prev,
      tiers: [...(prev.tiers || []), { displayThreshold: 0, realThreshold: 0, discountPercent: 0 }]
    }));
  };

  const handleRemoveTier = (index) => {
    setConfig(prev => ({
      ...prev,
      tiers: prev.tiers.filter((_, i) => i !== index)
    }));
  };

  // ─── VIP ───
  const handleAddVip = () => {
    if (!newVipCommunity) return;
    setConfig(prev => {
      const vip = { ...(prev.vipCommunities || {}) };
      if (vip[newVipCommunity]) return prev; // already exists
      const defaultPerks = {};
      PERK_DEFINITIONS.forEach(perk => {
        defaultPerks[perk.id] = { ...perk.defaultValue };
      });
      vip[newVipCommunity] = { isVip: true, perks: defaultPerks };
      return { ...prev, vipCommunities: vip };
    });
    setNewVipCommunity('');
    setAddingVip(false);
  };

  const handleRemoveVip = (communityName) => {
    setConfig(prev => {
      const vip = { ...(prev.vipCommunities || {}) };
      delete vip[communityName];
      return { ...prev, vipCommunities: vip };
    });
  };

  const handleTogglePerk = (communityName, perkId) => {
    setConfig(prev => {
      const vip = { ...(prev.vipCommunities || {}) };
      const community = { ...vip[communityName] };
      const perks = { ...community.perks };
      const perkDef = PERK_DEFINITIONS.find(p => p.id === perkId);
      if (!perks[perkId]) {
        perks[perkId] = { ...perkDef.defaultValue, enabled: true };
      } else {
        perks[perkId] = { ...perks[perkId], enabled: !perks[perkId].enabled };
      }
      community.perks = perks;
      vip[communityName] = community;
      return { ...prev, vipCommunities: vip };
    });
  };

  const handlePerkConfigChange = (communityName, perkId, newValue) => {
    setConfig(prev => {
      const vip = { ...(prev.vipCommunities || {}) };
      const community = { ...vip[communityName] };
      const perks = { ...community.perks };
      perks[perkId] = { ...perks[perkId], ...newValue };
      community.perks = perks;
      vip[communityName] = community;
      return { ...prev, vipCommunities: vip };
    });
  };

  // ─── Save ───
  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const success = await saveDiscountConfig(config);
      setMessage(success ? 'ההגדרות נשמרו בהצלחה!' : 'שגיאה בשמירת ההגדרות');
    } catch (err) {
      console.error('Error saving:', err);
      setMessage('שגיאה בשמירת ההגדרות');
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(''), 3000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" dir="rtl">
        <div className="text-gray-500">טוען...</div>
      </div>
    );
  }

  const vipEntries = Object.entries(config?.vipCommunities || {});
  const usedVipNames = new Set(vipEntries.map(([name]) => name));
  const availableForVip = allCommunities.filter(c => !usedVipNames.has(c));
  const selectedPilotCommunities = config?.pilotCommunities || [];
  const filteredCommunities = allCommunities.filter((communityName) => (
    communityName.toLowerCase().includes(communitySearch.trim().toLowerCase())
  ));

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link to="/admin" className="text-blue-600 hover:underline text-sm mb-2 inline-block">
              &larr; חזרה ללוח ניהול
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">הגדרות הנחת קהילה</h1>
            <p className="text-gray-600 mt-1">ניהול רמות הנחה וקהילות VIP</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-2.5 rounded-lg font-semibold transition-colors disabled:opacity-50"
          >
            {saving ? 'שומר...' : 'שמירה'}
          </button>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-lg text-center font-medium ${
            message.includes('שגיאה') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
          }`}>
            {message}
          </div>
        )}

        {/* ───── Enable/Disable toggle ───── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">הפעלת הנחות קהילה</h2>
              <p className="text-sm text-gray-500 mt-1">
                כאשר מופעל, הנחות יחושבו אוטומטית לפי הסכום השבועי של כל קהילה
              </p>
            </div>
            <button
              onClick={handleToggleEnabled}
              className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${
                config?.enabled ? 'bg-green-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  config?.enabled ? 'translate-x-1' : 'translate-x-8'
                }`}
              />
            </button>
          </div>
          <div className="mt-5 pt-5 border-t border-gray-100 flex items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-gray-800">החלה אוטומטית בחיוב V7</h3>
              <p className="text-sm text-gray-500 mt-1">
                כאשר מופעל, ההנחה שהקהילה השיגה תוחל אוטומטית בעת השלמת השקילה והחיוב.
                ברירת המחדל כבויה; ניתן תמיד להחיל ידנית במסך V7.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={config?.autoApplyInV7 === true}
              onClick={handleToggleAutoApplyInV7}
              className={`relative inline-flex h-7 w-14 flex-shrink-0 items-center rounded-full transition-colors ${
                config?.autoApplyInV7 === true ? 'bg-green-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  config?.autoApplyInV7 === true ? 'translate-x-1' : 'translate-x-8'
                }`}
              />
            </button>
          </div>
        </div>

        {/* ───── Community availability ───── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-gray-800">זמינות לפי קהילה</h2>
            <p className="text-sm text-gray-500 mt-1">
              לפיילוט אפשר להציג ולהחיל את ההנחה רק בקהילות שתבחרו.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="זמינות הנחת קהילה">
            <button
              type="button"
              role="radio"
              aria-checked={config?.availabilityMode !== 'selected'}
              onClick={() => handleAvailabilityModeChange('all')}
              className={`min-h-12 rounded-lg border px-4 py-3 text-right transition-colors ${
                config?.availabilityMode !== 'selected'
                  ? 'border-blue-500 bg-blue-50 text-blue-800'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="block font-semibold">כל הקהילות</span>
              <span className="block text-xs mt-1 opacity-80">ההנחה זמינה בכל קהילה פעילה</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={config?.availabilityMode === 'selected'}
              onClick={() => handleAvailabilityModeChange('selected')}
              className={`min-h-12 rounded-lg border px-4 py-3 text-right transition-colors ${
                config?.availabilityMode === 'selected'
                  ? 'border-blue-500 bg-blue-50 text-blue-800'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="block font-semibold">קהילות נבחרות — פיילוט</span>
              <span className="block text-xs mt-1 opacity-80">רק הקהילות המסומנות ישתתפו</span>
            </button>
          </div>

          {config?.availabilityMode === 'selected' && (
            <div className="mt-5 border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-200 p-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm font-medium text-gray-700">
                  נבחרו {selectedPilotCommunities.length} מתוך {allCommunities.length} קהילות
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAllPilotCommunities}
                    className="min-h-11 px-3 text-sm font-medium text-blue-600 hover:bg-blue-100 rounded-lg"
                  >
                    בחירת הכל
                  </button>
                  <button
                    type="button"
                    onClick={handleClearPilotCommunities}
                    className="min-h-11 px-3 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg"
                  >
                    ניקוי
                  </button>
                </div>
              </div>

              <div className="p-3 border-b border-gray-100">
                <label htmlFor="pilot-community-search" className="sr-only">חיפוש קהילה</label>
                <input
                  id="pilot-community-search"
                  type="search"
                  value={communitySearch}
                  onChange={(event) => setCommunitySearch(event.target.value)}
                  placeholder="חיפוש קהילה..."
                  className="w-full min-h-11 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              {selectedPilotCommunities.length === 0 && (
                <div className="m-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                  לא נבחרו קהילות. לאחר השמירה ההנחה לא תוצג ולא תוחל באף קהילה.
                </div>
              )}

              <div className="grid gap-2 p-3 sm:grid-cols-2 max-h-72 overflow-y-auto">
                {filteredCommunities.map((communityName) => {
                  const checked = selectedPilotCommunities.includes(communityName);
                  return (
                    <label
                      key={communityName}
                      className={`min-h-11 flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer ${
                        checked
                          ? 'border-blue-300 bg-blue-50'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleTogglePilotCommunity(communityName)}
                        className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-800">{communityName}</span>
                    </label>
                  );
                })}
                {filteredCommunities.length === 0 && (
                  <p className="sm:col-span-2 text-center text-sm text-gray-400 py-5">
                    לא נמצאו קהילות מתאימות
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ───── Discount tiers table ───── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">רמות הנחה</h2>
            <button
              onClick={handleAddTier}
              className="bg-blue-50 text-blue-600 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-100 transition-colors"
            >
              + הוסף רמה
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-600">#</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-600">
                    סף תצוגה (&#8362;)
                    <span className="block text-xs font-normal text-gray-400">מה המשתמש רואה</span>
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-600">
                    סף אמיתי (&#8362;)
                    <span className="block text-xs font-normal text-gray-400">סף בפועל להפעלה</span>
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-600">
                    אחוז הנחה
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-600">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {(config?.tiers || []).map((tier, idx) => (
                  <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm text-gray-500">{idx + 1}</td>
                    <td className="py-3 px-4">
                      <input
                        type="number"
                        value={tier.displayThreshold}
                        onChange={(e) => handleTierChange(idx, 'displayThreshold', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                      />
                    </td>
                    <td className="py-3 px-4">
                      <input
                        type="number"
                        value={tier.realThreshold}
                        onChange={(e) => handleTierChange(idx, 'realThreshold', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                      />
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.1"
                          value={tier.discountPercent}
                          onChange={(e) => handleTierChange(idx, 'discountPercent', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                        />
                        <span className="text-gray-500">%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => handleRemoveTier(idx)}
                        className="text-red-500 hover:text-red-700 text-sm font-medium"
                      >
                        מחק
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(config?.tiers || []).length === 0 && (
            <p className="text-center text-gray-400 py-6">אין רמות הנחה. הוסיפו רמה חדשה.</p>
          )}
        </div>

        {/* ───── VIP Communities ───── */}
        <div className="bg-white rounded-xl shadow-sm border-2 border-yellow-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">&#9733;</span>
              <div>
                <h2 className="text-lg font-semibold text-gray-800">קהילות VIP</h2>
                <p className="text-sm text-gray-500">קהילות שנהנות מהטבות מיוחדות</p>
              </div>
            </div>
            <button
              onClick={() => setAddingVip(true)}
              className="bg-yellow-50 text-yellow-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-yellow-100 transition-colors border border-yellow-200"
            >
              + הוסף קהילת VIP
            </button>
          </div>

          {/* Add VIP modal/inline */}
          {addingVip && (
            <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center gap-3">
              <select
                value={newVipCommunity}
                onChange={(e) => setNewVipCommunity(e.target.value)}
                className="flex-1 px-3 py-2 border border-yellow-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
              >
                <option value="">בחרו קהילה...</option>
                {availableForVip.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <button
                onClick={handleAddVip}
                disabled={!newVipCommunity}
                className="bg-yellow-500 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-yellow-600 disabled:opacity-50 transition-colors"
              >
                הוסף
              </button>
              <button
                onClick={() => { setAddingVip(false); setNewVipCommunity(''); }}
                className="text-gray-500 hover:text-gray-700 text-sm"
              >
                ביטול
              </button>
            </div>
          )}

          {/* VIP list */}
          {vipEntries.length === 0 ? (
            <p className="text-center text-gray-400 py-6">אין קהילות VIP עדיין</p>
          ) : (
            <div className="space-y-4">
              {vipEntries.map(([communityName, vipData]) => (
                <div key={communityName} className="border border-yellow-100 rounded-lg p-4 bg-yellow-50/50">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="bg-yellow-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">VIP</span>
                      <h3 className="font-semibold text-gray-800">{communityName}</h3>
                    </div>
                    <button
                      onClick={() => handleRemoveVip(communityName)}
                      className="text-red-500 hover:text-red-700 text-sm font-medium"
                    >
                      הסר VIP
                    </button>
                  </div>

                  {/* Perks */}
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">הטבות:</p>
                    {PERK_DEFINITIONS.map(perkDef => {
                      const perkValue = vipData.perks?.[perkDef.id] || perkDef.defaultValue;
                      const isEnabled = perkValue?.enabled || false;
                      return (
                        <div key={perkDef.id} className={`rounded-lg border p-3 transition-colors ${isEnabled ? 'bg-white border-yellow-200' : 'bg-gray-50 border-gray-200'}`}>
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-gray-800">{perkDef.label}</p>
                              <p className="text-xs text-gray-500">{perkDef.description}</p>
                            </div>
                            <button
                              onClick={() => handleTogglePerk(communityName, perkDef.id)}
                              className={`relative inline-flex h-6 w-12 items-center rounded-full transition-colors ${
                                isEnabled ? 'bg-yellow-500' : 'bg-gray-300'
                              }`}
                            >
                              <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                                  isEnabled ? 'translate-x-1' : 'translate-x-7'
                                }`}
                              />
                            </button>
                          </div>
                          {/* Perk-specific config */}
                          {isEnabled && perkDef.renderConfig && (
                            perkDef.renderConfig(
                              perkValue,
                              config?.tiers || [],
                              (newVal) => handlePerkConfigChange(communityName, perkDef.id, newVal)
                            )
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ───── Explanation ───── */}
        <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-6">
          <h3 className="font-semibold text-yellow-800 mb-2">איך זה עובד?</h3>
          <ul className="text-sm text-yellow-700 space-y-2">
            <li>
              <strong>סף תצוגה</strong> - הסכום שהמשתמש רואה בעמוד הקהילה כיעד.
            </li>
            <li>
              <strong>סף אמיתי</strong> - הסכום שבפועל צריך להגיע אליו כדי שההנחה תופעל.
              אפשר לשים סף נמוך יותר כדי לעודד הזמנות.
            </li>
            <li>
              <strong>אחוז הנחה</strong> - ההנחה שתחושב על סכום ההזמנה כאשר הסף הושג.
            </li>
            <li>
              <strong>קהילות VIP</strong> - קהילות שמקבלות הטבות מיוחדות.
              ההטבה הראשונה: "הנחה מובטחת" - הקהילה מקבלת את ההנחה גם אם לא הגיעה לסף.
              אפשר להוסיף הטבות נוספות בעתיד.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default CommunityDiscountConfig;
