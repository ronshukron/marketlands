import { db } from './firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';

export const createUserDocument = async (uid, userData, collection) => {
  try {
    await setDoc(doc(db, collection, uid), {
      ...userData,
      createdAt: new Date()
    });
  } catch (error) {
    console.error("Error creating user document: ", error);
  }
};

export const getUserDocument = async (uid, collection) => {
  try {
    const userDoc = await getDoc(doc(db, collection, uid));
    return userDoc.exists() ? userDoc.data() : null;
  } catch (error) {
    console.error("Error fetching user document: ", error);
    return null;
  }
};