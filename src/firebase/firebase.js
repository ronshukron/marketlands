import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage'; 

const firebaseConfig = {
    apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
    authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
    storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.REACT_APP_FIREBASE_APP_ID
}

const getFirestoreSettings = () => {
    if (typeof navigator === 'undefined') {
        return { experimentalAutoDetectLongPolling: true };
    }

    const userAgent = navigator.userAgent || '';
    const isIos = /iPad|iPhone|iPod/.test(userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isInAppBrowser = /WhatsApp|FBAN|FBAV|Instagram|Line|MicroMessenger/i.test(userAgent);

    if (isIos || isInAppBrowser) {
        return { experimentalForceLongPolling: true };
    }

    return { experimentalAutoDetectLongPolling: true };
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app)
const db = initializeFirestore(app, getFirestoreSettings())
const storage = getStorage(app); 
export { app, auth, db, storage };


// rules_version = '2';

// service firebase.storage {
//   match /b/{bucket}/o {
//     match /{allPaths=**} {
//       allow read, write: if false;
//     }
//   }
// }