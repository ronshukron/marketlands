import { auth, db } from "./firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updatePassword,
  signInWithPopup,
  GoogleAuthProvider,
} from "firebase/auth";
import { 
  doc, 
  setDoc, 
  getDoc, 
  serverTimestamp 
} from "firebase/firestore";

export const ACCOUNT_VERIFICATION_COLLECTION = 'accountVerification';
export const ACCOUNT_VERIFICATION_REQUIRED_EVENT = 'bb:account-verification-required';

export const doCreateUserWithEmailAndPassword = async (email, password, userData, collection) => {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;
  
  // Create user document in Firestore
  await setDoc(doc(db, collection, user.uid), {
    ...userData,
    createdAt: new Date()
  });

  // New customer accounts must verify their phone by SMS. Accounts created
  // before this have no record and are never asked. Guest ordering is unchanged.
  if (collection === 'users') {
    try {
      await setDoc(doc(db, ACCOUNT_VERIFICATION_COLLECTION, user.uid), {
        required: true,
        createdAt: serverTimestamp(),
      });
      window.dispatchEvent(new CustomEvent(ACCOUNT_VERIFICATION_REQUIRED_EVENT, { detail: { uid: user.uid } }));
    } catch (error) {
      console.warn('Could not record the account verification requirement', error);
    }
  }

  return userCredential;
};


export const doSignInWithEmailAndPassword = (email, password) => {
  return signInWithEmailAndPassword(auth, email, password);
};

export const doSignInWithGoogle = async () => {
  try {
    const provider = new GoogleAuthProvider();
    const userCredential = await signInWithPopup(auth, provider);
    const user = userCredential.user;
    
    const localBusinessDocRef = doc(db, "localbusiness", user.uid);
    const localBusinessDoc = await getDoc(localBusinessDocRef);
    if (localBusinessDoc.exists()) {
      return userCredential;
    }

    const businessDocRef = doc(db, "businesses", user.uid);
    const businessDoc = await getDoc(businessDocRef);
    if (businessDoc.exists()) {
      return userCredential;
    }
    
    // Check if user document exists in Firestore
    const userDocRef = doc(db, "users", user.uid);
    const userDoc = await getDoc(userDocRef);
    
    // If user document doesn't exist, create it with default values
    if (!userDoc.exists()) {
      const userData = {
        email: user.email,
        name: user.displayName || '',
        phone: user.phoneNumber || '',
        community: '',  // Default empty community
        role: 'user',
        createdAt: serverTimestamp()
      };
      
      // Create the user document
      await setDoc(userDocRef, userData);
    }
    
    return userCredential;
  } catch (error) {
    console.error("Error during Google sign-in:", error);
    throw error;
  }
};

export const doSignOut = () => {
  return auth.signOut();
};

export const doPasswordReset = (email) => {
  return sendPasswordResetEmail(auth, email);
};

export const doPasswordChange = (password) => {
  return updatePassword(auth.currentUser, password);
};

export const doSendEmailVerification = async () => {
  if (!auth.currentUser) throw new Error('UNAUTHENTICATED');
  auth.languageCode = 'he';
  try {
    // The link in the email brings the customer back to the store.
    return await sendEmailVerification(auth.currentUser, { url: `${window.location.origin}/` });
  } catch (error) {
    // A site address not listed in Firebase's authorized domains: send without the return link.
    if (error?.code === 'auth/unauthorized-continue-uri' || error?.code === 'auth/invalid-continue-uri') {
      return sendEmailVerification(auth.currentUser);
    }
    throw error;
  }
};