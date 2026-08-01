import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  doCreateUserWithEmailAndPassword,
  doSignInWithEmailAndPassword,
} from '../firebase/auth';
import { db } from '../firebase/firebase';
import {
  MARKETPLACE_CUSTOMER_ROLE,
  MARKETPLACE_USERS_COLLECTION,
} from '../constants/marketplaceUsers';
import { resolveMarketplaceCommunityName } from '../utils/marketplaceCommunityIdentity';

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const cleanObject = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));

export const buildMarketplaceUserProfile = ({
  email,
  name = '',
  phone = '',
  community = '',
  source = 'marketplace_checkout',
}) =>
  cleanObject({
    email: normalizeEmail(email),
    name: String(name || '').trim(),
    phone: String(phone || '').trim(),
    community: resolveMarketplaceCommunityName(community),
    role: MARKETPLACE_CUSTOMER_ROLE,
    source,
    updatedAt: serverTimestamp(),
  });

export const upsertMarketplaceUserProfile = async (uid, profile) => {
  if (!uid) throw new Error('Missing user id');

  const ref = doc(db, MARKETPLACE_USERS_COLLECTION, uid);
  const existing = await getDoc(ref);
  const payload = buildMarketplaceUserProfile(profile);

  if (!existing.exists()) {
    await setDoc(ref, {
      ...payload,
      createdAt: serverTimestamp(),
    });
  } else {
    await setDoc(
      ref,
      {
        ...payload,
        createdAt: existing.data()?.createdAt || serverTimestamp(),
      },
      { merge: true }
    );
  }
};

/**
 * Creates a Firebase Auth user + marketplaceUsers doc, or signs in if email exists.
 * @returns {Promise<import('firebase/auth').User>}
 */
const mapAuthErrorToHebrew = (error) => {
  switch (error?.code) {
    case 'auth/invalid-email':
      return 'כתובת אימייל לא תקינה';
    case 'auth/user-disabled':
      return 'החשבון הושבת';
    case 'auth/user-not-found':
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'אימייל או סיסמה שגויים';
    case 'auth/too-many-requests':
      return 'יותר מדי ניסיונות. נסו שוב מאוחר יותר';
    default:
      return error?.message || 'ההתחברות נכשלה';
  }
};

/**
 * Sign in existing Firebase user and ensure marketplaceUsers profile exists.
 */
export const signInMarketplaceCustomer = async ({ email, password }) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error('נדרש אימייל');
  }
  if (!password) {
    throw new Error('נדרשת סיסמה');
  }

  try {
    const userCredential = await doSignInWithEmailAndPassword(normalizedEmail, password);
    const { uid, displayName } = userCredential.user;

    await upsertMarketplaceUserProfile(uid, {
      email: normalizedEmail,
      name: displayName || '',
      source: 'marketplace_login',
    });

    return userCredential.user;
  } catch (error) {
    const err = new Error(mapAuthErrorToHebrew(error));
    err.code = error?.code;
    throw err;
  }
};

export const registerMarketplaceCustomer = async ({
  email,
  password,
  name = '',
  phone = '',
  community = '',
  source = 'marketplace_register',
}) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error('נדרש אימייל');
  }
  if (!password || password.length < 6) {
    throw new Error('סיסמה חייבת להכיל לפחות 6 תווים');
  }

  try {
    const userCredential = await doCreateUserWithEmailAndPassword(
      normalizedEmail,
      password,
      buildMarketplaceUserProfile({
        email: normalizedEmail,
        name,
        phone,
        community,
        source,
      }),
      MARKETPLACE_USERS_COLLECTION
    );
    return userCredential.user;
  } catch (error) {
    if (error?.code === 'auth/email-already-in-use') {
      const err = new Error('כבר קיים חשבון עם אימייל זה. התחברו או השתמשו ב"שכחתי סיסמה".');
      err.code = error.code;
      throw err;
    }
    const err = new Error(mapAuthErrorToHebrew(error));
    err.code = error?.code;
    throw err;
  }
};

export const registerOrSignInMarketplaceCustomer = async ({
  email,
  password,
  name,
  phone,
  community,
  source = 'marketplace_checkout',
}) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error('נדרש אימייל');
  }
  if (!password || password.length < 6) {
    throw new Error('סיסמה חייבת להכיל לפחות 6 תווים');
  }

  const profile = { email: normalizedEmail, name, phone, community, source };

  try {
    const userCredential = await doCreateUserWithEmailAndPassword(
      normalizedEmail,
      password,
      {
        ...profile,
        createdAt: new Date(),
      },
      MARKETPLACE_USERS_COLLECTION
    );
    return userCredential.user;
  } catch (error) {
    if (error?.code !== 'auth/email-already-in-use') {
      throw error;
    }

    let userCredential;
    try {
      userCredential = await doSignInWithEmailAndPassword(normalizedEmail, password);
    } catch (signInError) {
      if (signInError?.code === 'auth/wrong-password' || signInError?.code === 'auth/invalid-credential') {
        const err = new Error('סיסמה שגויה לחשבון הקיים. התחברו מהתפריט או הזינו סיסמה נכונה.');
        err.code = signInError.code;
        throw err;
      }
      throw signInError;
    }
    const { uid } = userCredential.user;

    const existingRef = doc(db, MARKETPLACE_USERS_COLLECTION, uid);
    const existing = await getDoc(existingRef);
    if (!existing.exists()) {
      await setDoc(existingRef, {
        ...buildMarketplaceUserProfile(profile),
        createdAt: serverTimestamp(),
      });
    } else {
      await upsertMarketplaceUserProfile(uid, profile);
    }

    return userCredential.user;
  }
};

export const getMarketplaceUserProfile = async (uid) => {
  if (!uid) return null;
  const snap = await getDoc(doc(db, MARKETPLACE_USERS_COLLECTION, uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

/**
 * Loads name / phone / email / community for checkout prefill (marketplaceUsers, then site users).
 */
export const loadCheckoutCustomerProfile = async (authUser) => {
  if (!authUser?.uid) return null;

  const merged = {
    userId: authUser.uid,
    name: String(authUser.displayName || '').trim(),
    phone: '',
    email: String(authUser.email || '').trim(),
    community: '',
  };

  try {
    const marketplaceProfile = await getMarketplaceUserProfile(authUser.uid);
    if (marketplaceProfile) {
      merged.name = merged.name || String(marketplaceProfile.name || '').trim();
      merged.phone = merged.phone || String(marketplaceProfile.phone || '').trim();
      merged.email = merged.email || String(marketplaceProfile.email || '').trim();
      merged.community = merged.community || String(marketplaceProfile.community || '').trim();
    }
  } catch (error) {
    if (error?.code !== 'permission-denied') {
      console.warn('loadCheckoutCustomerProfile: marketplaceUsers', error);
    }
  }

  if (!merged.name || !merged.phone || !merged.community) {
    try {
      const siteUserSnap = await getDoc(doc(db, 'users', authUser.uid));
      if (siteUserSnap.exists()) {
        const siteUser = siteUserSnap.data();
        merged.name = merged.name || String(siteUser.name || '').trim();
        merged.phone = merged.phone || String(siteUser.phone || '').trim();
        merged.email = merged.email || String(siteUser.email || '').trim();
        merged.community = merged.community || String(siteUser.community || '').trim();
      }
    } catch (error) {
      if (error?.code !== 'permission-denied') {
        console.warn('loadCheckoutCustomerProfile: users', error);
      }
    }
  }

  return merged;
};

/**
 * Ensures checkout orders are tied to a signed-in marketplace account.
 */
export const resolveMarketplaceOrderAccount = async ({
  currentUser,
  customer,
  createAccount,
  password,
  source = 'marketplace_checkout',
}) => {
  if (currentUser?.uid) {
    const email = normalizeEmail(currentUser.email || customer?.email);
    if (!email) {
      throw new Error('חסר אימייל בחשבון. עדכנו אימייל בפרופיל או הזינו אימייל בטופס.');
    }
    await upsertMarketplaceUserProfile(currentUser.uid, {
      email,
      name: customer?.name,
      phone: customer?.phone,
      community: customer?.community,
      source: 'marketplace_existing_session',
    }).catch((error) => {
      console.warn('Could not refresh marketplace user profile', error);
    });
    return { userId: currentUser.uid, email };
  }

  if (!createAccount) {
    throw new Error('יש לסמן יצירת חשבון כדי לשלוח את ההזמנה.');
  }

  const email = normalizeEmail(customer?.email);
  if (!email) {
    throw new Error('נדרש אימייל ליצירת חשבון ולשיוך ההזמנה.');
  }

  const user = await registerOrSignInMarketplaceCustomer({
    email,
    password,
    name: customer?.name,
    phone: customer?.phone,
    community: customer?.community,
    source,
  });

  return {
    userId: user.uid,
    email: normalizeEmail(user.email || email),
  };
};
