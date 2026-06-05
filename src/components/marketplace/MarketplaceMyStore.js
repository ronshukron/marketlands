import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Swal from 'sweetalert2';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import { pickupSpots } from '../../data/pickupSpots';
import { MARKETPLACE_STORES_STORAGE_PREFIX } from '../../constants/marketplaceStores';
import {
  DEFAULT_MARKETPLACE_STORE_CONTENT,
  mergeStoreContentSources,
} from '../../constants/marketplaceStoreContent';
import { DEFAULT_STORE_FULFILLMENT, storeFulfillmentToForm } from '../../constants/marketplaceFulfillment';
import {
  DEFAULT_STORE_PAYMENT_LINKS,
  normalizeStorePaymentLinks,
} from '../../constants/marketplacePaymentLinks';
import StoreContentEditor from './StoreContentEditor';
import MarketplaceFulfillmentEditor from './MarketplaceFulfillmentEditor';
import MarketplacePaymentLinksEditor from './MarketplacePaymentLinksEditor';
import {
  DEFAULT_MANUAL_PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  getBusinessProfile,
  getMarketplaceSettings,
  getMarketplaceStore,
  saveMarketplaceStore,
} from '../../services/marketplaceService';
import LoadingSpinner from '../LoadingSpinner';
import defaultBackground from '../../images/Field.jpg';
import './marketplace.css';

const emptyForm = {
  title: '',
  shortDescription: '',
  storeDescription: '',
  coverImageUrl: '',
  profileImageUrl: '',
  phone: '',
  tags: '',
  homeCommunity: '',
  manualPaymentMethods: DEFAULT_MANUAL_PAYMENT_METHODS,
  ...DEFAULT_STORE_FULFILLMENT,
  visible: true,
  storeCartEnabled: true,
  status: 'active',
  ...DEFAULT_MARKETPLACE_STORE_CONTENT,
  paymentLinks: DEFAULT_STORE_PAYMENT_LINKS,
};

const uploadStoreImage = async (uid, file, kind) =>
  new Promise((resolve, reject) => {
    const storageRef = ref(
      storage,
      `${MARKETPLACE_STORES_STORAGE_PREFIX}/${uid}/${kind}_${Date.now()}_${file.name}`
    );
    const uploadTask = uploadBytesResumable(storageRef, file);
    uploadTask.on(
      'state_changed',
      null,
      reject,
      async () => {
        const url = await getDownloadURL(uploadTask.snapshot.ref);
        resolve(url);
      }
    );
  });

const MarketplaceMyStore = () => {
  const { currentUser, userRole } = useAuth();
  const [form, setForm] = useState(emptyForm);
  const [business, setBusiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingProfile, setUploadingProfile] = useState(false);
  const [globalSettings, setGlobalSettings] = useState(null);

  useEffect(() => {
    const load = async () => {
      if (!currentUser) {
        setLoading(false);
        return;
      }

      try {
        const [profile, store, settings] = await Promise.all([
          getBusinessProfile(currentUser.uid),
          getMarketplaceStore(currentUser.uid),
          getMarketplaceSettings(),
        ]);
        setBusiness(profile);
        setGlobalSettings(settings);
        const mergedContent = mergeStoreContentSources(store, profile);
        setForm({
          ...emptyForm,
          ...mergedContent,
          ...storeFulfillmentToForm(store),
          paymentLinks: normalizeStorePaymentLinks(store),
          title: store?.title || profile?.businessName || '',
          shortDescription: store?.shortDescription || profile?.shortDescription || '',
          storeDescription: mergedContent.storeDescription,
          coverImageUrl: store?.coverImageUrl || profile?.backgroundImageUrl || '',
          profileImageUrl: store?.profileImageUrl || profile?.profileImageUrl || '',
          phone: store?.phone || profile?.phone || '',
          tags: (store?.tags || []).join(', '),
          homeCommunity: store?.homeCommunity || profile?.communityName || '',
          manualPaymentMethods: store?.manualPaymentMethods || DEFAULT_MANUAL_PAYMENT_METHODS,
          visible: store?.visible !== false,
          storeCartEnabled: store?.storeCartEnabled !== false,
          status: store?.status || 'active',
        });
      } catch (error) {
        console.error('Failed to load my store', error);
        Swal.fire({ icon: 'error', title: 'שגיאה בטעינת דף הבסטה' });
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [currentUser]);

  const togglePaymentMethod = (method) => {
    setForm((current) => {
      const set = new Set(current.manualPaymentMethods);
      set.has(method) ? set.delete(method) : set.add(method);
      return { ...current, manualPaymentMethods: [...set] };
    });
  };

  const handleImageUpload = async (file, field, setUploading) => {
    if (!currentUser || !file) return;
    setUploading(true);
    try {
      const url = await uploadStoreImage(currentUser.uid, file, field === 'coverImageUrl' ? 'cover' : 'profile');
      setForm((c) => ({ ...c, [field]: url }));
    } catch (error) {
      console.error('Image upload failed', error);
      Swal.fire({ icon: 'error', title: 'שגיאה בהעלאת תמונה' });
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!currentUser) return;

    setSaving(true);
    try {
      await saveMarketplaceStore({
        businessId: currentUser.uid,
        businessData: business || {},
        storeData: form,
      });
      Swal.fire({
        icon: 'success',
        title: 'דף הבסטה נשמר',
        timer: 1600,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error('Failed to save store', error);
      Swal.fire({ icon: 'error', title: 'שגיאה בשמירה' });
    } finally {
      setSaving(false);
    }
  };

  if (userRole !== 'business' && userRole !== 'localBusiness') {
    return (
      <div className="mp-page mp-bench-page" dir="rtl">
        <div className="mp-main mp-bench mp-empty text-center">
          <p className="mp-section-note">גישה לדף הבסטה מותרת לבעלי בסטה בלבד.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mp-page mp-bench-page flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  const previewUrl = `/community-marketplace/store/${currentUser?.uid}`;

  return (
    <div className="mp-page mp-bench-page" dir="rtl">
      <div className="mp-main mp-bench mp-stack">
        <header className="mp-bench-header">
          <div className="mp-bench-header-main">
            <span className="mp-weekly-board-label">שדה ושכונה · בסטה</span>
            <h1 className="mp-bench-title mp-section-title-chalk">
              {form.title || business?.businessName || 'דף הבסטה שלי'}
            </h1>
            <p className="mp-bench-subtitle">
              כך הלקוחות רואים אתכם בכרטיס ובדף הציבורי בשוק.
            </p>
          </div>
          <div className="mp-bench-header-actions">
            <Link to="/marketplace/dashboard" className="mp-link">
              לוח הבסטה
            </Link>
            {currentUser && (
              <Link
                to={previewUrl}
                className="mp-btn mp-btn-wood mp-bench-btn-sm"
                target="_blank"
                rel="noopener noreferrer"
              >
                תצוגה מקדימה
              </Link>
            )}
          </div>
        </header>

        <form onSubmit={handleSubmit} className="mp-bench-panel mp-bench-panel--form mp-my-store-form mp-stack">
          <section className="mp-my-store-section">
            <h2 className="mp-bench-panel-title mp-section-title-chalk">תמונות</h2>
            <div className="mp-store-images-grid">
              <div className="mp-store-image-block">
                <span className="mp-form-label">תמונת קאבר (רקע)</span>
                <div className="mp-store-image-preview mp-store-cover-preview">
                  <img src={form.coverImageUrl || defaultBackground} alt="קאבר" />
                </div>
                <label className="mp-store-upload-btn">
                  {uploadingCover ? 'מעלה...' : 'העלאת קאבר'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingCover}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(file, 'coverImageUrl', setUploadingCover);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
              <div className="mp-store-image-block">
                <span className="mp-form-label">תמונת פרופיל / לוגו</span>
                <div className="mp-store-image-preview mp-store-profile-preview">
                  <img src={form.profileImageUrl || defaultBackground} alt="פרופיל" />
                </div>
                <label className="mp-store-upload-btn">
                  {uploadingProfile ? 'מעלה...' : 'העלאת תמונה'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingProfile}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(file, 'profileImageUrl', setUploadingProfile);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            </div>
          </section>

          <section className="mp-my-store-section">
            <h2 className="mp-bench-panel-title mp-section-title-chalk">פרטי הבסטה</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="mp-form-label">
                <span className="mp-form-label-text">שם הכרטיס בשוק</span>
                <input
                  className="mp-input"
                  value={form.title}
                  onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))}
                  required
                />
              </label>
              <label className="mp-form-label">
                <span className="mp-form-label-text">טלפון ליצירת קשר</span>
                <input
                  className="mp-input"
                  value={form.phone}
                  onChange={(e) => setForm((c) => ({ ...c, phone: e.target.value }))}
                  placeholder="05X-XXXXXXX"
                />
              </label>
              <label className="mp-form-label md:col-span-2">
                <span className="mp-form-label-text">תיאור קצר (מופיע בכרטיס בשוק)</span>
                <textarea
                  className="mp-textarea"
                  rows={2}
                  value={form.shortDescription}
                  onChange={(e) => setForm((c) => ({ ...c, shortDescription: e.target.value }))}
                />
              </label>
              <label className="mp-form-label md:col-span-2">
                <span className="mp-form-label-text">תיאור מלא (מופיע בדף הבסטה)</span>
                <textarea
                  className="mp-textarea"
                  rows={5}
                  value={form.storeDescription}
                  onChange={(e) => setForm((c) => ({ ...c, storeDescription: e.target.value }))}
                />
              </label>
              <label className="mp-form-label">
                <span className="mp-form-label-text">קהילת בית</span>
                <select
                  className="mp-select"
                  value={form.homeCommunity}
                  onChange={(e) => setForm((c) => ({ ...c, homeCommunity: e.target.value }))}
                >
                  <option value="">בחרו קהילה</option>
                  {pickupSpots.map((spot) => (
                    <option key={spot} value={spot}>
                      {spot}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mp-form-label">
                <span className="mp-form-label-text">תגיות (מופרדות בפסיקים)</span>
                <input
                  className="mp-input"
                  value={form.tags}
                  onChange={(e) => setForm((c) => ({ ...c, tags: e.target.value }))}
                />
              </label>
            </div>
          </section>

          <section className="mp-my-store-section">
            <MarketplaceFulfillmentEditor
              mode="store"
              value={form}
              onChange={(patch) => setForm((c) => ({ ...c, ...patch }))}
            />
          </section>

          <section className="mp-my-store-section">
            <StoreContentEditor form={form} setForm={setForm} />
          </section>

          <section className="mp-my-store-section">
            <MarketplacePaymentLinksEditor
              paymentLinks={form.paymentLinks}
              onChange={(paymentLinks) => setForm((c) => ({ ...c, paymentLinks }))}
              disabled={globalSettings?.paymentLinksOnConfirmationEnabled === false}
              disabledNote="קישורי תשלום מושבתים כרגע על ידי המנהל. ניתן להגדיר מראש — הם יופיעו כשהתכונה תופעל."
            />
          </section>

          <section className="mp-my-store-section">
            <p className="mp-form-label mb-2">אמצעי תשלום ידניים</p>
            <div className="mp-payment-chips mp-my-store-payment-chips">
              {DEFAULT_MANUAL_PAYMENT_METHODS.map((method) => (
                <label key={method} className="mp-payment-chip mp-payment-chip-select">
                  <input
                    type="checkbox"
                    checked={form.manualPaymentMethods.includes(method)}
                    onChange={() => togglePaymentMethod(method)}
                  />
                  {PAYMENT_METHOD_LABELS[method]}
                </label>
              ))}
            </div>
          </section>

          <section className="mp-my-store-section mp-my-store-toggles">
            <label className="mp-form-checkbox">
              <input
                type="checkbox"
                checked={form.visible}
                onChange={(e) => setForm((c) => ({ ...c, visible: e.target.checked }))}
              />
              הצגת הבסטה בשוק (כרטיס + דף ציבורי)
            </label>

            <label className="mp-form-checkbox">
              <input
                type="checkbox"
                checked={form.storeCartEnabled}
                onChange={(e) => setForm((c) => ({ ...c, storeCartEnabled: e.target.checked }))}
              />
              חנות קבועה עם סל (כיבוי = רק הזמנות שבועיות / קידומים)
            </label>

            {!form.storeCartEnabled && (
              <p className="mp-alert mp-alert-warn text-sm">
                כשהחנות הקבועה כבויה, לקוחות לא יראו מוצרים לרכישה מיידית — רק הזמנות שבועיות פעילות.
                ניתן להסתיר מוצר בודד מהחנות תחת &quot;עריכת מוצר&quot;.
              </p>
            )}
          </section>

          <button type="submit" className="mp-btn mp-btn-wood" disabled={saving}>
            {saving ? 'שומר...' : 'שמירת דף הבסטה'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default MarketplaceMyStore;
