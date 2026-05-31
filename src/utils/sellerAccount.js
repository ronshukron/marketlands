import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { LOCAL_BUSINESS_COLLECTION } from '../constants/accountCollections';

/**
 * Profile for marketplace seller (localbusiness) or legacy business account.
 */
export const getSellerAccountProfile = async (uid) => {
  if (!uid) return null;

  const localRef = doc(db, LOCAL_BUSINESS_COLLECTION, uid);
  const localSnap = await getDoc(localRef);
  if (localSnap.exists()) {
    return {
      id: localSnap.id,
      ...localSnap.data(),
      accountCollection: LOCAL_BUSINESS_COLLECTION,
    };
  }

  const businessRef = doc(db, 'businesses', uid);
  const businessSnap = await getDoc(businessRef);
  if (businessSnap.exists()) {
    return {
      id: businessSnap.id,
      ...businessSnap.data(),
      accountCollection: 'businesses',
    };
  }

  return null;
};
