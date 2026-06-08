import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import "bootstrap/dist/css/bootstrap.min.css"
import { getPickupSpotsSync, resolveCommunityName } from './services/pickupSpotsService';
import { persistReferralCodeFromUrl } from './services/referralService';

// Pre-render: parse URL for community/pickup spot and referral code
(function syncUrlParams() {
  try {
    persistReferralCodeFromUrl();
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('community') || params.get('pickupSpot') || params.get('spot');
    if (!raw) return;
    const decoded = decodeURIComponent(raw).replace(/\+/g, ' ').trim();
    const resolved = resolveCommunityName(decoded) || decoded;

    const normalize = (s) => (s || '').toString().trim().toLowerCase();
    const candidates = new Set([resolved, decoded, decoded.replace(/[-_]/g, ' ')]);
    const { pickupSpots } = getPickupSpotsSync();
    const match = pickupSpots.find((name) => {
      const n = normalize(name);
      for (const c of candidates) {
        if (normalize(c) === n) return true;
      }
      return false;
    });

    localStorage.setItem('selectedPickupSpot', match || resolved);
  } catch (e) {
    // ignore
  }
})();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
