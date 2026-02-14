import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getDiscountConfig, saveDiscountConfig } from '../../services/communityDiscountService';
import { pickupSpotsData } from '../../data/pickupSpots';

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

  const allCommunities = Object.keys(pickupSpotsData);

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
