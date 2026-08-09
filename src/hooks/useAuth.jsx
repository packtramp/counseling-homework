import { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../config/firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  // A counselor has invited this email, but the person has NOT accepted yet.
  // Nothing is bound until they do — see the security note in the auth listener.
  const [pendingCounselorInvite, setPendingCounselorInvite] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        // Fetch user profile from Firestore
        const profileDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (profileDoc.exists()) {
          setUserProfile(profileDoc.data());
        } else {
          // No profile yet — check whether someone has invited this email to be their counselee.
          //
          // SECURITY (8/3): we used to AUTO-BIND here, writing counselorId/role/approved
          // straight from the invite. But anyone can create a counseleeLink for any email
          // address, so a stranger could pre-plant one and silently become this person's
          // counselor — which routes every journal they write into the stranger's subtree.
          // Now the invite only produces a PROMPT; nothing is bound until the person
          // accepts, and the binding itself happens server-side.
          const emailKey = firebaseUser.email.toLowerCase().replace(/[.]/g, '_');
          const linkDoc = await getDoc(doc(db, 'counseleeLinks', emailKey));

          // A minimal profile so the app is usable — deliberately NO privileged fields.
          const baseProfile = {
            email: firebaseUser.email,
            name: linkDoc.exists() ? linkDoc.data().name : (firebaseUser.displayName || ''),
            timezone: (typeof Intl !== 'undefined' && Intl.DateTimeFormat().resolvedOptions().timeZone) || 'America/Chicago',
            createdAt: new Date(),
            onboardingStep: 0
          };
          await setDoc(doc(db, 'users', firebaseUser.uid), baseProfile);
          setUserProfile(baseProfile);

          if (linkDoc.exists()) {
            // NOTE: the link's `name` is the COUNSELEE's name — look up the counselor's
            // own name so the prompt says who is actually asking.
            const counselorId = linkDoc.data().counselorId;
            let counselorName = '';
            try {
              const cDoc = await getDoc(doc(db, 'users', counselorId));
              if (cDoc.exists()) counselorName = cDoc.data().name || cDoc.data().email || '';
            } catch (e) { /* name is cosmetic; prompt still works without it */ }
            setPendingCounselorInvite({ counselorId, counselorName });
          }
        }
      } else {
        setUser(null);
        setUserProfile(null);
        setPendingCounselorInvite(null);
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

  // The invitee CONSENTS to the counselor relationship. The privileged fields
  // (counselorId/counseleeDocId/role/approved) are written server-side, never here.
  const acceptCounselorInvite = async () => {
    const idToken = await auth.currentUser.getIdToken();
    const res = await fetch('/api/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ action: 'accept-counselor-invite' })
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || 'Could not accept the invitation');
    }
    const fresh = await getDoc(doc(db, 'users', auth.currentUser.uid));
    if (fresh.exists()) setUserProfile(fresh.data());
    setPendingCounselorInvite(null);
  };

  // Declining just dismisses the prompt; no relationship is created.
  const declineCounselorInvite = () => setPendingCounselorInvite(null);

  const value = {
    user,
    userProfile,
    loading,
    login,
    signup,
    logout,
    pendingCounselorInvite,
    acceptCounselorInvite,
    declineCounselorInvite,
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
