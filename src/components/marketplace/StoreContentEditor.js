import React from 'react';

const StoreContentEditor = ({ form, setForm }) => {
  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updateWhatsappContact = (index, key, value) => {
    setForm((current) => {
      const contacts = [...(current.whatsappContacts || [])];
      contacts[index] = { ...contacts[index], [key]: value };
      return { ...current, whatsappContacts: contacts };
    });
  };

  const addWhatsappContact = () => {
    setForm((current) => ({
      ...current,
      whatsappContacts: [...(current.whatsappContacts || []), { label: '', phone: '' }],
    }));
  };

  const removeWhatsappContact = (index) => {
    setForm((current) => ({
      ...current,
      whatsappContacts: (current.whatsappContacts || []).filter((_, i) => i !== index),
    }));
  };

  return (
    <div className="mp-stack">
      <h2 className="mp-section-title">תוכן דף הבסטה</h2>
      <p className="mp-section-note text-sm">
        הסעיפים הבאים מוצגים ללקוחות בדף הבסטה הציבורי (כמו &quot;קצת עלינו&quot;, יצירת קשר ומדיניות).
      </p>

      <label className="mp-form-label">
        קצת עלינו
        <textarea
          className="mp-input"
          rows={4}
          value={form.aboutUs}
          onChange={(e) => updateField('aboutUs', e.target.value)}
          placeholder="ספרו על הבסטה, מתי נפתחתם, מה מיוחד בכם..."
        />
      </label>

      <label className="mp-form-label">
        הודעה ללקוחות
        <textarea
          className="mp-input"
          rows={3}
          value={form.customerNotice}
          onChange={(e) => updateField('customerNotice', e.target.value)}
          placeholder="הודעות מיוחדות, מועדי סגירת הזמנות, קישורים..."
        />
      </label>

      <label className="mp-form-label">
        יצירת קשר — הקדמה
        <textarea
          className="mp-input"
          rows={2}
          value={form.contactIntro}
          onChange={(e) => updateField('contactIntro', e.target.value)}
          placeholder="למשל: בנושאי חוסרים וזיכויים בהודעת ווטסאפ בלבד"
        />
      </label>

      <label className="mp-form-label">
        אימייל ליצירת קשר
        <input
          className="mp-input"
          type="email"
          value={form.email}
          onChange={(e) => updateField('email', e.target.value)}
          placeholder="service@example.com"
        />
      </label>

      <div>
        <p className="mp-form-label mb-2">אנשי קשר ב-WhatsApp (בנוסף לטלפון הראשי)</p>
        {(form.whatsappContacts || []).map((contact, index) => (
          <div key={index} className="mp-whatsapp-row">
            <input
              className="mp-input"
              value={contact.label}
              onChange={(e) => updateWhatsappContact(index, 'label', e.target.value)}
              placeholder="שם / תיאור"
            />
            <input
              className="mp-input"
              value={contact.phone}
              onChange={(e) => updateWhatsappContact(index, 'phone', e.target.value)}
              placeholder="05X-XXXXXXX"
            />
            <button
              type="button"
              className="mp-btn mp-btn-wood text-sm"
              onClick={() => removeWhatsappContact(index)}
            >
              הסרה
            </button>
          </div>
        ))}
        <button type="button" className="mp-btn mp-btn-wood text-sm mt-2" onClick={addWhatsappContact}>
          + הוספת WhatsApp
        </button>
      </div>

      <label className="mp-form-label">
        הערות ומידע נוסף
        <textarea
          className="mp-input"
          rows={3}
          value={form.additionalNotes}
          onChange={(e) => updateField('additionalNotes', e.target.value)}
        />
      </label>

      <label className="mp-form-label">
        מדיניות החזרות וביטולים
        <textarea
          className="mp-input"
          rows={4}
          value={form.returnsPolicy}
          onChange={(e) => updateField('returnsPolicy', e.target.value)}
        />
      </label>

      <label className="mp-form-label">
        אתר / קישור חיצוני
        <input
          className="mp-input"
          value={form.websiteUrl}
          onChange={(e) => updateField('websiteUrl', e.target.value)}
          placeholder="https://..."
        />
      </label>

      <label className="mp-form-label">
        רשתות חברתיות (קישור אחד בכל שורה)
        <textarea
          className="mp-input"
          rows={2}
          value={form.socialLinks}
          onChange={(e) => updateField('socialLinks', e.target.value)}
          placeholder="פייסבוק, אינסטגרם..."
        />
      </label>
    </div>
  );
};

export default StoreContentEditor;
