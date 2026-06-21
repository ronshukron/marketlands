import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import Swal from 'sweetalert2';
import { db } from '../../firebase/firebase';
import usePickupSpots from '../../hooks/usePickupSpots';
import {
  loadCommunityBroadcastTemplate,
  saveCommunityBroadcastTemplate,
} from '../../services/communityBroadcastService';
import {
  cleanupDuplicateCommunities,
  deleteCommunity,
  getDeterministicCommunityColor,
  migrateNitzanimNames,
  saveCommunity,
  seedCommunitiesFromStatic,
} from '../../services/pickupSpotsService';
import {
  buildAutoDeliveryNoteFromSchedule,
  buildCommunityBroadcastMessage,
  buildCommunityStoreLink,
  buildWhatsAppShareUrl,
  DEFAULT_BROADCAST_TEMPLATE,
} from '../../utils/communityBroadcastMessage';

const REGION_OPTIONS = ['צפון', 'מרכז', 'דרום', 'שומרון', 'שפלה', 'אשקלון אשדוד', 'חבל תקומה', 'אחר'];
const OPTION_CHOICES = [
  { value: 'pickup', label: 'איסוף' },
  { value: 'homeDelivery', label: 'משלוח עד הבית' },
];

const formatFirestoreError = (err) => {
  if (err?.code === 'permission-denied') {
    return 'אין הרשאת מחיקה ל-Firestore. עדכנו את כללי communities (ראו docs/Communities-Firestore-Rules.snippet.txt) ופרסמו ב-Firebase Console.';
  }
  return err?.message || 'שגיאה לא ידועה';
};

const emptyForm = {
  name: '',
  region: 'אחר',
  options: ['pickup'],
  deliveryFee: 25,
  color: '#4F46E5',
  sortOrder: 0,
  active: true,
  aliases: '',
  whatsappGroupLink: '',
  storeLink: '',
  broadcastDeliveryNote: '',
};

const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  }
};

const CommunityAdmin = () => {
  const { pickupSpots, pickupSpotsData, loaded } = usePickupSpots();
  const [form, setForm] = useState(emptyForm);
  const [editingName, setEditingName] = useState('');
  const [previewCommunity, setPreviewCommunity] = useState('');
  const [broadcastTemplate, setBroadcastTemplate] = useState(DEFAULT_BROADCAST_TEMPLATE);
  const [deliverySchedules, setDeliverySchedules] = useState({});
  const [busy, setBusy] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);

  useEffect(() => {
    cleanupDuplicateCommunities().catch((error) => {
      console.error('Failed to cleanup duplicate communities:', error);
    });
  }, []);

  useEffect(() => {
    loadCommunityBroadcastTemplate().then(setBroadcastTemplate);
  }, []);

  useEffect(() => {
    getDocs(collection(db, 'deliverySchedules'))
      .then((snap) => {
        const map = {};
        snap.docs.forEach((docSnap) => {
          map[docSnap.id] = docSnap.data();
        });
        setDeliverySchedules(map);
      })
      .catch((error) => {
        console.error('Failed to load delivery schedules for broadcast:', error);
      });
  }, []);

  useEffect(() => {
    if (!editingName) return;
    const data = pickupSpotsData[editingName];
    if (!data) return;
    setForm({
      name: editingName,
      region: data.region || 'אחר',
      options: data.options || ['pickup'],
      deliveryFee: data.deliveryFee || 0,
      color: data.color || getDeterministicCommunityColor(editingName),
      sortOrder: data.sortOrder || 0,
      active: data.active !== false,
      aliases: (data.aliases || []).join(', '),
      whatsappGroupLink: data.whatsappGroupLink || '',
      storeLink: data.storeLink || '',
      broadcastDeliveryNote: data.broadcastDeliveryNote || '',
    });
    setPreviewCommunity(editingName);
  }, [editingName, pickupSpotsData]);

  const previewName = previewCommunity || editingName;
  const previewCommunityData = useMemo(() => {
    if (!previewName) return {};
    if (previewName === editingName && form.name) {
      return {
        storeLink: form.storeLink,
        broadcastDeliveryNote: form.broadcastDeliveryNote,
        whatsappGroupLink: form.whatsappGroupLink,
      };
    }
    return pickupSpotsData[previewName] || {};
  }, [previewName, editingName, form, pickupSpotsData]);

  const previewMessage = useMemo(() => {
    if (!previewName) return '';
    return buildCommunityBroadcastMessage({
      communityName: previewName,
      community: previewCommunityData,
      template: broadcastTemplate,
      deliverySchedule: deliverySchedules[previewName] || null,
    });
  }, [previewName, previewCommunityData, broadcastTemplate, deliverySchedules]);

  const previewAutoDeliveryNote = useMemo(() => {
    if (!previewName) return '';
    return buildAutoDeliveryNoteFromSchedule(deliverySchedules[previewName] || null);
  }, [previewName, deliverySchedules]);

  const previewStoreLink = useMemo(() => {
    if (!previewName) return '';
    return buildCommunityStoreLink(previewName, {
      ...broadcastTemplate,
      storeLink: previewCommunityData.storeLink,
    });
  }, [previewName, previewCommunityData.storeLink, broadcastTemplate]);

  const getMessageForCommunity = (name) => buildCommunityBroadcastMessage({
    communityName: name,
    community: pickupSpotsData[name] || {},
    template: broadcastTemplate,
    deliverySchedule: deliverySchedules[name] || null,
  });

  const handleSaveTemplate = async () => {
    setTemplateSaving(true);
    try {
      await saveCommunityBroadcastTemplate(broadcastTemplate);
      Swal.fire('נשמר', 'תבנית ההודעה נשמרה', 'success');
    } catch (error) {
      Swal.fire('שגיאה', error.message || 'שמירת התבנית נכשלה', 'error');
    } finally {
      setTemplateSaving(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      Swal.fire('שגיאה', 'שם יישוב חובה', 'error');
      return;
    }
    setBusy(true);
    try {
      await saveCommunity({
        ...form,
        aliases: form.aliases.split(',').map((v) => v.trim()).filter(Boolean),
      });
      Swal.fire('נשמר', 'היישוב נשמר בהצלחה', 'success');
      if (!editingName) setForm(emptyForm);
    } catch (error) {
      Swal.fire('שגיאה', error.message || 'שמירה נכשלה', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (name) => {
    const result = await Swal.fire({
      title: `למחוק את "${name}"?`,
      text: 'פעולה זו תסיר את היישוב מרשימת הבחירה',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'מחק',
      cancelButtonText: 'ביטול',
    });
    if (!result.isConfirmed) return;
    setBusy(true);
    try {
      await deleteCommunity(name);
      if (editingName === name) {
        setEditingName('');
        setForm(emptyForm);
      }
      if (previewCommunity === name) setPreviewCommunity('');
      Swal.fire('נמחק', 'היישוב הוסר', 'success');
    } catch (error) {
      Swal.fire('שגיאה', formatFirestoreError(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleCopyMessage = async (name) => {
    const message = getMessageForCommunity(name);
    const ok = await copyText(message);
    if (ok) {
      Swal.fire({ toast: true, position: 'top', icon: 'success', title: `הודעה עבור ${name} הועתקה`, showConfirmButton: false, timer: 1800 });
    } else {
      Swal.fire('שגיאה', 'העתקה נכשלה', 'error');
    }
  };

  const handleWhatsAppShare = (name) => {
    const url = buildWhatsAppShareUrl(getMessageForCommunity(name));
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleOpenGroup = (name) => {
    const link = pickupSpotsData[name]?.whatsappGroupLink;
    if (!link) {
      Swal.fire('אין קישור', `ל"${name}" לא הוגדר קישור לקבוצת וואטסאפ`, 'info');
      return;
    }
    window.open(link, '_blank', 'noopener,noreferrer');
  };

  const runSeed = async () => {
    setBusy(true);
    try {
      await seedCommunitiesFromStatic();
      Swal.fire('הושלם', 'היישובים נטענו מקובץ ברירת המחדל ל-Firestore', 'success');
    } catch (error) {
      Swal.fire('שגיאה', error.message || 'טעינה נכשלה', 'error');
    } finally {
      setBusy(false);
    }
  };

  const runNitzanimMigration = async () => {
    const result = await Swal.fire({
      title: 'מיזוג ניצנים ה/ג → ניצנים',
      text: 'יפעיל עדכון על הזמנות ולוחות משלוח קיימים',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'הרץ מיגרציה',
      cancelButtonText: 'ביטול',
    });
    if (!result.isConfirmed) return;
    setBusy(true);
    try {
      const count = await migrateNitzanimNames();
      Swal.fire('הושלם', `עודכנו ${count} רשומות`, 'success');
    } catch (error) {
      Swal.fire('שגיאה', error.message || 'מיגרציה נכשלה', 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggleOption = (value) => {
    setForm((prev) => ({
      ...prev,
      options: prev.options.includes(value)
        ? prev.options.filter((opt) => opt !== value)
        : [...prev.options, value],
    }));
  };

  return (
    <div className="max-w-7xl mx-auto p-6" dir="rtl">
      <h1 className="text-3xl font-bold mb-2">ניהול יישובים / נקודות איסוף</h1>
      <p className="text-gray-600 mb-6">עריכת קהילות, קישורי וואטסאפ, ושליחת הודעות שבועיות לקבוצות.</p>

      <div className="flex flex-wrap gap-3 mb-6">
        <button type="button" onClick={runSeed} disabled={busy} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
          טען יישובים ל-DB
        </button>
        <button type="button" onClick={runNitzanimMigration} disabled={busy} className="px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50">
          מיגרציית ניצנים
        </button>
        <button type="button" onClick={() => { setEditingName(''); setForm(emptyForm); setPreviewCommunity(''); }} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">
          יישוב חדש
        </button>
      </div>

      <div className="bg-white rounded-lg shadow p-5 mb-6 space-y-4 border-t-4 border-green-600">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">תבנית הודעה שבועית (משותפת לכל הקהילות)</h2>
            <p className="text-sm text-gray-600 mt-1">הקישור לכל קהילה נבנה אוטומטית לפי שם היישוב. אפשר לדרוס לכל קהילה בנפרד.</p>
          </div>
          <button type="button" onClick={handleSaveTemplate} disabled={templateSaving} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
            {templateSaving ? 'שומר...' : 'שמור תבנית'}
          </button>
        </div>

        <label className="block">
          <span className="text-sm text-gray-600">פתיחה</span>
          <input
            value={broadcastTemplate.intro}
            onChange={(e) => setBroadcastTemplate((p) => ({ ...p, intro: e.target.value }))}
            className="w-full border rounded px-3 py-2 mt-1"
          />
        </label>

        <label className="block">
          <span className="text-sm text-gray-600">מוצרים / עסקים (גוף ההודעה)</span>
          <textarea
            value={broadcastTemplate.productsBody}
            onChange={(e) => setBroadcastTemplate((p) => ({ ...p, productsBody: e.target.value }))}
            rows={8}
            className="w-full border rounded px-3 py-2 mt-1 font-mono text-sm leading-relaxed"
          />
        </label>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="block">
            <span className="text-sm text-gray-600">כותרת לקישור</span>
            <input
              value={broadcastTemplate.linkLabel}
              onChange={(e) => setBroadcastTemplate((p) => ({ ...p, linkLabel: e.target.value }))}
              className="w-full border rounded px-3 py-2 mt-1"
            />
          </label>
          <label className="block">
            <span className="text-sm text-gray-600">כתובת האתר</span>
            <input
              value={broadcastTemplate.siteBaseUrl}
              onChange={(e) => setBroadcastTemplate((p) => ({ ...p, siteBaseUrl: e.target.value }))}
              className="w-full border rounded px-3 py-2 mt-1"
              dir="ltr"
            />
          </label>
          <label className="block">
            <span className="text-sm text-gray-600">קטגוריה בקישור</span>
            <input
              value={broadcastTemplate.category}
              onChange={(e) => setBroadcastTemplate((p) => ({ ...p, category: e.target.value }))}
              className="w-full border rounded px-3 py-2 mt-1"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-sm text-gray-600">הערת משלוח גיבוי (כשאין לוח משלוחים ליישוב)</span>
          <input
            value={broadcastTemplate.defaultDeliveryNote}
            onChange={(e) => setBroadcastTemplate((p) => ({ ...p, defaultDeliveryNote: e.target.value }))}
            className="w-full border rounded px-3 py-2 mt-1"
            placeholder="מגיעים ברביעי."
          />
          <p className="text-xs text-gray-500 mt-1">ברירת המחדל לכל קהילה נקבעת אוטומטית לפי יום המשלוח בשבוע הנוכחי/הקרוב מלוח המשלוחים.</p>
        </label>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-5 space-y-4 xl:col-span-1">
          <h2 className="text-xl font-semibold">{editingName ? `עריכת ${editingName}` : 'הוספת יישוב'}</h2>
          <label className="block">
            <span className="text-sm text-gray-600">שם יישוב</span>
            <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className="w-full border rounded px-3 py-2 mt-1" disabled={!!editingName} />
          </label>
          <label className="block">
            <span className="text-sm text-gray-600">אזור</span>
            <select value={form.region} onChange={(e) => setForm((p) => ({ ...p, region: e.target.value }))} className="w-full border rounded px-3 py-2 mt-1">
              {REGION_OPTIONS.map((region) => <option key={region} value={region}>{region}</option>)}
            </select>
          </label>
          <div>
            <span className="text-sm text-gray-600">אפשרויות משלוח</span>
            <div className="flex gap-4 mt-2">
              {OPTION_CHOICES.map((opt) => (
                <label key={opt.value} className="flex items-center gap-2">
                  <input type="checkbox" checked={form.options.includes(opt.value)} onChange={() => toggleOption(opt.value)} />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm text-gray-600">דמי משלוח (₪)</span>
              <input type="number" value={form.deliveryFee} onChange={(e) => setForm((p) => ({ ...p, deliveryFee: e.target.value }))} className="w-full border rounded px-3 py-2 mt-1" />
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">צבע (V7)</span>
              <input type="color" value={form.color} onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))} className="w-full h-10 border rounded mt-1" />
            </label>
          </div>
          <label className="block">
            <span className="text-sm text-gray-600">כינויים (מופרדים בפסיק)</span>
            <input value={form.aliases} onChange={(e) => setForm((p) => ({ ...p, aliases: e.target.value }))} className="w-full border rounded px-3 py-2 mt-1" placeholder="ניצנים ה, ניצנים ג" />
          </label>

          <div className="border-t pt-4 space-y-3">
            <h3 className="font-semibold text-sm text-gray-800">וואטסאפ ושידור</h3>
            <label className="block">
              <span className="text-sm text-gray-600">קישור לקבוצת וואטסאפ</span>
              <input
                value={form.whatsappGroupLink}
                onChange={(e) => setForm((p) => ({ ...p, whatsappGroupLink: e.target.value }))}
                className="w-full border rounded px-3 py-2 mt-1 text-sm"
                dir="ltr"
                placeholder="https://chat.whatsapp.com/..."
              />
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">קישור לאתר (ריק = אוטומטי לפי שם היישוב)</span>
              <input
                value={form.storeLink}
                onChange={(e) => setForm((p) => ({ ...p, storeLink: e.target.value }))}
                className="w-full border rounded px-3 py-2 mt-1 text-xs"
                dir="ltr"
                placeholder={previewStoreLink || 'ייבנה אוטומטית'}
              />
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">הערת משלוח לקהילה (ריק = אוטומטי לפי לוח משלוחים)</span>
              <input
                value={form.broadcastDeliveryNote}
                onChange={(e) => setForm((p) => ({ ...p, broadcastDeliveryNote: e.target.value }))}
                className="w-full border rounded px-3 py-2 mt-1"
                placeholder={previewAutoDeliveryNote || broadcastTemplate.defaultDeliveryNote}
              />
            </label>
          </div>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))} />
            <span>פעיל</span>
          </label>
          <button type="button" onClick={handleSave} disabled={busy} className="w-full py-3 bg-green-600 text-white font-bold rounded hover:bg-green-700 disabled:opacity-50">
            שמור יישוב
          </button>
        </div>

        <div className="bg-white rounded-lg shadow p-5 xl:col-span-1">
          <h2 className="text-xl font-semibold mb-4">יישובים ({loaded ? pickupSpots.length : '...'})</h2>
          <div className="max-h-[36rem] overflow-y-auto divide-y">
            {pickupSpots.map((name) => {
              const hasGroup = Boolean(pickupSpotsData[name]?.whatsappGroupLink);
              const selected = previewCommunity === name;
              return (
                <div key={name} className={`py-3 space-y-2 ${selected ? 'bg-green-50 -mx-2 px-2 rounded' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewCommunity(name)}
                      className="flex items-center gap-3 min-w-0 text-right flex-1"
                    >
                      <span className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: pickupSpotsData[name]?.color || getDeterministicCommunityColor(name) }} />
                      <div className="min-w-0">
                        <div className="font-medium truncate">{name}</div>
                        <div className="text-xs text-gray-500">{pickupSpotsData[name]?.region || 'אחר'}</div>
                      </div>
                    </button>
                    <div className="flex gap-1 shrink-0">
                      <button type="button" onClick={() => setEditingName(name)} className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded">ערוך</button>
                      <button type="button" onClick={() => handleDelete(name)} className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded">מחק</button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <button type="button" onClick={() => handleCopyMessage(name)} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded">
                      העתק
                    </button>
                    <button type="button" onClick={() => handleWhatsAppShare(name)} className="px-2 py-1 text-xs bg-green-100 text-green-800 hover:bg-green-200 rounded">
                      שתף בוואטסאפ
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenGroup(name)}
                      disabled={!hasGroup}
                      className="px-2 py-1 text-xs bg-emerald-100 text-emerald-800 hover:bg-emerald-200 rounded disabled:opacity-40"
                    >
                      {hasGroup ? 'פתח קבוצה' : 'אין קבוצה'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-5 xl:col-span-1 space-y-3">
          <h2 className="text-xl font-semibold">
            {previewName ? `תצוגה מלאה — ${previewName}` : 'תצוגת הודעה'}
          </h2>
          {!previewName ? (
            <p className="text-sm text-gray-500">לחצו על יישוב מהרשימה כדי לראות את ההודעה המלאה עם הקישור שלו.</p>
          ) : (
            <>
              <div className="text-xs text-gray-500 break-all" dir="ltr">
                <span className="font-medium text-gray-700">קישור: </span>
                {previewStoreLink}
              </div>
              <textarea
                readOnly
                value={previewMessage}
                rows={18}
                className="w-full border rounded px-3 py-2 text-sm leading-relaxed bg-gray-50 font-sans"
              />
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => handleCopyMessage(previewName)} className="px-3 py-2 bg-gray-700 text-white rounded text-sm hover:bg-gray-800">
                  העתק הודעה
                </button>
                <button type="button" onClick={() => handleWhatsAppShare(previewName)} className="px-3 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700">
                  שתף בוואטסאפ
                </button>
                {previewCommunityData.whatsappGroupLink && (
                  <button type="button" onClick={() => handleOpenGroup(previewName)} className="px-3 py-2 bg-emerald-600 text-white rounded text-sm hover:bg-emerald-700">
                    פתח קבוצה
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CommunityAdmin;
