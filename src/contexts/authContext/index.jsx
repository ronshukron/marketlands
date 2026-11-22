import React, { useCallback, useContext, useState, useEffect } from "react";
import { auth, db } from "../../firebase/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import {
  ACCOUNT_VERIFICATION_COLLECTION,
  ACCOUNT_VERIFICATION_REQUIRED_EVENT,
  doSignOut,
} from "../../firebase/auth";
import { isDeliveryDriverAccount } from "../../utils/accountRoles";
import { LOCAL_BUSINESS_COLLECTION } from "../../constants/accountCollections";
import {
  MARKETPLACE_CUSTOMER_ROLE,
  MARKETPLACE_USERS_COLLECTION,
} from "../../constants/marketplaceUsers";

const AuthContext = React.createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userLoggedIn, setUserLoggedIn] = useState(false);
  const [isEmailUser, setIsEmailUser] = useState(false);
  const [isGoogleUser, setIsGoogleUser] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  // Only customer accounts that signed up after SMS verification was introduced
  // (accountVerification/{uid}) must verify their phone. Everyone else: false.
  const [verificationRequired, setVerificationRequired] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, initializeUser);
    return unsubscribe;
  }, []);

  // The signup writes the record right after the account exists, so the
  // first check on sign-in can miss it.
  useEffect(() => {
    const onRequired = (event) => {
      if (auth.currentUser && event?.detail?.uid === auth.currentUser.uid && !auth.currentUser.phoneNumber) {
        setVerificationRequired(true);
      }
    };
    window.addEventListener(ACCOUNT_VERIFICATION_REQUIRED_EVENT, onRequired);
    return () => window.removeEventListener(ACCOUNT_VERIFICATION_REQUIRED_EVENT, onRequired);
  }, []);

  async function checkVerificationRequired(user) {
    if (!user || user.phoneNumber) {
      setVerificationRequired(false);
      return;
    }
    try {
      const snap = await getDoc(doc(db, ACCOUNT_VERIFICATION_COLLECTION, user.uid));
      if (auth.currentUser?.uid !== user.uid) return;
      setVerificationRequired(snap.exists() && snap.data()?.required === true);
    } catch (error) {
      // Unreadable (e.g. rules not deployed yet): never lock a customer out.
      console.warn("Account verification lookup failed", error);
      setVerificationRequired(false);
    }
  }

  // After the phone was linked: refresh the token so the server sees it too.
  const completePhoneVerification = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return false;
    await user.reload();
    const fresh = auth.currentUser;
    if (!fresh?.phoneNumber) return false;
    await fresh.getIdToken(true);
    setCurrentUser({ ...fresh });
    setVerificationRequired(false);
    return true;
  }, []);

  async function fetchMarketplaceCustomerRole(uid) {
    try {
      const marketplaceUserDoc = await getDoc(doc(db, MARKETPLACE_USERS_COLLECTION, uid));
      if (marketplaceUserDoc.exists()) {
        return marketplaceUserDoc.data().role || MARKETPLACE_CUSTOMER_ROLE;
      }
    } catch (error) {
      if (error?.code === 'permission-denied') {
        console.warn(
          'marketplaceUsers: deploy Firestore rules for this collection (see docs/Marketplace-Firestore-Rules.snippet.txt)'
        );
      } else {
        console.warn('marketplaceUsers role lookup failed', error);
      }
    }
    return null;
  }

  async function initializeUser(user) {
    if (user) {
      setCurrentUser({ ...user });
      setUserLoggedIn(true);
  
      // Check if provider is email and password login
      const isEmail = user.providerData.some(
        (provider) => provider.providerId === "password"
      );
      setIsEmailUser(isEmail);
  
      // Check if the auth provider is Google
      const isGoogle = user.providerData.some(
        (provider) => provider.providerId === "google.com"
      );
      setIsGoogleUser(isGoogle);
      checkVerificationRequired(user);
      setLoading(false);

      // Fetch user role from Firestore after the store is already visible.
      try {
        let resolvedRole = 'user';

        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const explicitUserRole = userDoc.exists() ? userDoc.data().role : null;

        if (explicitUserRole && explicitUserRole !== 'user') {
          resolvedRole = explicitUserRole;
        } else {
          const coordinatorDoc = await getDoc(doc(db, 'coordinators', user.uid));
          if (coordinatorDoc.exists()) {
            resolvedRole = 'coordinator';
          } else {
            const localBusinessDoc = await getDoc(doc(db, LOCAL_BUSINESS_COLLECTION, user.uid));
            if (localBusinessDoc.exists()) {
              resolvedRole = 'localBusiness';
            } else {
              const businessDoc = await getDoc(doc(db, 'businesses', user.uid));
              if (businessDoc.exists()) {
                resolvedRole = isDeliveryDriverAccount(businessDoc.data())
                  ? 'driver'
                  : 'business';
              } else {
                const marketplaceRole = await fetchMarketplaceCustomerRole(user.uid);
                if (marketplaceRole) {
                  resolvedRole = marketplaceRole;
                }
              }
            }
          }
        }

        setUserRole(resolvedRole);
      } catch (error) {
        console.error("Error fetching user role:", error);
        setUserRole('user');
      }
    } else {
      setCurrentUser(null);
      setUserLoggedIn(false);
      setUserRole(null);
      setVerificationRequired(false);
    }
    setLoading(false);
  }
  

  const signOut = () => {
    return doSignOut().then(() => {
      setCurrentUser(null);
      setUserLoggedIn(false);
      setUserRole(null);
    }).catch((error) => {
      console.error("Logout failed: ", error);
      throw error; // Rethrow after logging
    });
  };

  const value = {
    userLoggedIn,
    isEmailUser,
    isGoogleUser,
    currentUser,
    userRole,
    loading,
    signOut,
    setCurrentUser,
    verificationRequired,
    completePhoneVerification,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}