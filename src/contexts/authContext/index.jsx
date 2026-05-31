import React, { useContext, useState, useEffect } from "react";
import { auth, db } from "../../firebase/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { doSignOut } from "../../firebase/auth";
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, initializeUser);
    return unsubscribe;
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
  
      // Fetch user role from Firestore
      try {
        let resolvedRole = 'user';

        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          resolvedRole = userDoc.data().role;
        } else {
          const marketplaceRole = await fetchMarketplaceCustomerRole(user.uid);
          if (marketplaceRole) {
            resolvedRole = marketplaceRole;
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
    signOut,
    setCurrentUser
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}