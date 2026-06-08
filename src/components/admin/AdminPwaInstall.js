import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/authContext';

const ADMIN_UIDS = ['rfHOLhNoJOW8ByNypCtm3hlSNKs2'];
const PUBLIC_URL = process.env.PUBLIC_URL || '';

const ensureAdminPwaHeadTags = () => {
  if (!document.querySelector('link[rel="manifest"][data-admin-pwa]')) {
    const manifestLink = document.createElement('link');
    manifestLink.rel = 'manifest';
    manifestLink.href = `${PUBLIC_URL}/manifest.json`;
    manifestLink.setAttribute('data-admin-pwa', 'true');
    document.head.appendChild(manifestLink);
  }

  if (!document.querySelector('link[rel="apple-touch-icon"][data-admin-pwa]')) {
    const appleIcon = document.createElement('link');
    appleIcon.rel = 'apple-touch-icon';
    appleIcon.href = `${PUBLIC_URL}/logo192.png`;
    appleIcon.setAttribute('data-admin-pwa', 'true');
    document.head.appendChild(appleIcon);
  }
};

const isStandaloneDisplay = () => {
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  return Boolean(window.navigator.standalone);
};

const isIosSafari = () => {
  const ua = window.navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIos && isSafari;
};

const AdminPwaInstall = () => {
  const { currentUser, userRole } = useAuth();
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(isStandaloneDisplay());
  const [installing, setInstalling] = useState(false);

  const isAdmin = Boolean(
    currentUser && (userRole === 'admin' || ADMIN_UIDS.includes(currentUser.uid))
  );

  useEffect(() => {
    if (!isAdmin) return undefined;

    ensureAdminPwaHeadTags();
    setInstalled(isStandaloneDisplay());

    const handler = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [isAdmin]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setInstalled(true);
      }
      setDeferredPrompt(null);
    } finally {
      setInstalling(false);
    }
  };

  if (!currentUser) {
    return (
      <div className="max-w-2xl mx-auto p-6" dir="rtl">
        <p className="text-gray-600">יש להתחבר כדי לגשת לעמוד זה.</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto p-6" dir="rtl">
        <p className="text-red-600">אין הרשאה לצפות בעמוד זה.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6" dir="rtl">
      <Link to="/admin" className="text-sm text-green-700 hover:text-green-800 mb-4 inline-block">
        ← חזרה לדשבורד
      </Link>

      <h1 className="text-3xl font-bold mb-2">התקנת אפליקציית ניהול</h1>
      <p className="text-gray-600 mb-6">
        התקינו את באסטה על מסך הבית לגישה מהירה לכלי הניהול מהטלפון. זמין רק למנהלים.
      </p>

      <div className="bg-white rounded-lg shadow border border-gray-200 p-6 space-y-4">
        {installed ? (
          <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-green-800">
            האפליקציה כבר מותקנת או שאתם נמצאים במצב אפליקציה.
          </div>
        ) : deferredPrompt ? (
          <button
            type="button"
            onClick={handleInstall}
            disabled={installing}
            className="w-full py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-60"
          >
            {installing ? 'מתקין...' : 'התקנה למסך הבית'}
          </button>
        ) : isIosSafari() ? (
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 text-gray-700 space-y-2">
            <p className="font-semibold">התקנה ב-iPhone / iPad:</p>
            <ol className="list-decimal list-inside text-sm space-y-1">
              <li>לחצו על כפתור השיתוף בתחתית Safari</li>
              <li>בחרו &quot;הוסף למסך הבית&quot;</li>
              <li>אשרו את ההתקנה</li>
            </ol>
          </div>
        ) : (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-amber-900 text-sm">
            כפתור ההתקנה יופיע כאן כשהדפדפן יאפשר התקנה. נסו Chrome ב-Android או Chrome/Edge במחשב.
            אם לא מופיע — רעננו את העמוד לאחר כניסה לדשבורד.
          </div>
        )}

        <p className="text-xs text-gray-500">
          לקוחות רגילים לא רואים אפשרות התקנה — רק מנהלים דרך עמוד זה.
        </p>
      </div>
    </div>
  );
};

export default AdminPwaInstall;
