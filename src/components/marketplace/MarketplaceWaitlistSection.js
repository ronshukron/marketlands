import React, { useState } from 'react';
import { pickupSpots } from '../../data/pickupSpots';
import { submitMarketplaceWaitlistEntry } from '../../services/marketplaceWaitlistService';
import './marketplace.css';

const INITIAL_FORM = {
  name: '',
  phone: '',
  email: '',
  businessKind: '',
  community: '',
};

const MarketplaceWaitlistSection = () => {
  const [form, setForm] = useState(INITIAL_FORM);
  const [status, setStatus] = useState('idle'); // idle | submitting | success | error
  const [error, setError] = useState('');

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setStatus('submitting');

    try {
      await submitMarketplaceWaitlistEntry(form);
      setForm(INITIAL_FORM);
      setStatus('success');
    } catch (err) {
      console.error('Failed to submit marketplace waitlist entry', err);
      const isPermission = err?.code === 'permission-denied';
      setError(
        isPermission
          ? 'לא ניתן לשלוח כרגע. יש לעדכן את חוקי Firestore (ראו docs/Marketplace-Waitlist-Firestore-Rules.snippet.txt).'
          : err?.message || 'לא הצלחנו לשלוח את הבקשה. נסו שוב בעוד רגע.'
      );
      setStatus('error');
    }
  };

  return (
    <section
      className="mp-panel mp-waitlist"
      aria-labelledby="mp-waitlist-title"
      dir="rtl"
    >
      <div className="mp-section-head" style={{ justifyContent: 'center' }}>
        <div className="w-full text-center">
          <p className="mp-section-kicker">פיילוט השוק · הצטרפות</p>
          <h2 id="mp-waitlist-title" className="mp-section-title mp-section-title-chalk">
           יש לכם עסק מקומי ומעוניינים לפתוח חנות בשוק?
          </h2>
          <p className="mp-section-note" style={{ maxWidth: '46ch', margin: '0.5rem auto 0' }}>
            אנחנו מחפשים 3-5 עסקים מקומיים שיצטרפו לפיילוט הראשון של השוק. השאירו פרטים ונחזור אליכם.
          </p>
        </div>
      </div>

      {status === 'success' ? (
        <div className="mp-alert mp-alert-warn" role="status">
          תודה! קיבלנו את הפרטים שלכם ונחזור אליכם בקרוב לגבי הפיילוט.
        </div>
      ) : (
        <form className="mp-stack" onSubmit={handleSubmit}>
          {error && (
            <div className="mp-alert mp-alert-error" role="alert">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="mp-filter-label" htmlFor="mp-waitlist-name">
                שם איש קשר
              </label>
              <input
                id="mp-waitlist-name"
                type="text"
                className="mp-input"
                value={form.name}
                onChange={handleChange('name')}
                placeholder="שם מלא"
                required
              />
            </div>

            <div>
              <label className="mp-filter-label" htmlFor="mp-waitlist-phone">
                טלפון
              </label>
              <input
                id="mp-waitlist-phone"
                type="tel"
                className="mp-input"
                value={form.phone}
                onChange={handleChange('phone')}
                placeholder="050-0000000"
                required
              />
            </div>

            <div>
              <label className="mp-filter-label" htmlFor="mp-waitlist-email">
                אימייל
              </label>
              <input
                id="mp-waitlist-email"
                type="email"
                className="mp-input"
                value={form.email}
                onChange={handleChange('email')}
                placeholder="name@example.com"
              />
            </div>

            <div>
              <label className="mp-filter-label" htmlFor="mp-waitlist-kind">
                סוג העסק
              </label>
              <input
                id="mp-waitlist-kind"
                type="text"
                className="mp-input"
                value={form.businessKind}
                onChange={handleChange('businessKind')}
                placeholder="חקלאי, מאפייה, דבש, וכו'"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mp-filter-label" htmlFor="mp-waitlist-community">
                קהילה / יישוב
              </label>
              <select
                id="mp-waitlist-community"
                className="mp-select"
                value={form.community}
                onChange={handleChange('community')}
              >
                <option value="">בחרו קהילה</option>
                {pickupSpots.map((spot) => (
                  <option key={spot} value={spot}>
                    {spot}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-2 flex justify-center sm:justify-start">
            <button
              type="submit"
              className="mp-btn mp-btn-primary"
              disabled={status === 'submitting'}
            >
              {status === 'submitting' ? 'שולח…' : 'הצטרפו לרשימת ההמתנה'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
};

export default MarketplaceWaitlistSection;
