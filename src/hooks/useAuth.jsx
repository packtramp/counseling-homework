import { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../config/firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        // Fetch user profile from Firestore
        const profileDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (profileDoc.exists()) {
          setUserProfile(profileDoc.data());
        } else {
          // No profile yet - check if this email is linked to a counselor
          const emailKey = firebaseUser.email.toLowerCase().replace(/[.]/g, '_');
          const linkDoc = await getDoc(doc(db, 'counseleeLinks', emailKey));
          if (linkDoc.exists()) {
            // Auto-create counselee profile
            const linkData = linkDoc.data();
            const newProfile = {
              email: firebaseUser.email,
              name: linkData.name,
              role: 'counselee',
              counselorId: linkData.counselorId,
              counseleeDocId: linkData.counseleeDocId,
              createdAt: new Date(),
              onboardingStep: 0
            };
            await setDoc(doc(db, 'users', firebaseUser.uid), newProfile);
            setUserProfile(newProfile);
          }
        }
      } else {
        setUser(null);
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (email, password) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  const signup = async (email, password) => {
    return createUserWithEmailAndPassword(auth, email, password);
  };

  const logout = async () => {
    return signOut(auth);
  };

  const value = {
    user,
    userProfile,
    loading,
    login,
    signup,
    logout,
    // Support both old role-based system AND new flag-based system
    isCounselor: userProfile?.isCounselor === true || userProfile?.role === 'counselor',
    isSuperAdmin: userProfile?.isSuperAdmin === true,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
