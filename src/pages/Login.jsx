import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { db } from '../config/firebase';
import { doc, setDoc, updateDoc, getDoc, deleteDoc, serverTimestamp, collection, addDoc } from 'firebase/firestore';
// Email verification is sent server-side via notify-signup API (Resend)

export default function Login() {
  const [searchParams] = useSearchParams();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignup, setIsSignup] = useState(searchParams.get('signup') === 'true');
  const { login, signup } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (isSignup && !name.trim()) {
      setError('Name is required');
      return;
    }

    if (isSignup && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (isSignup && password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      if (isSignup) {
        // Create Firebase Auth account
        const userCredential = await signup(email, password);
        const uid = userCredential.user.uid;

        // Default reminder schedule: 9am, 3pm, 8pm every day
        const defaultSchedule = {};
        ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].forEach(day => {
          defaultSchedule[day] = { slot1: '09:00', slot2: '15:00', slot3: '20:00' };
        });

        // Create user profile in Firestore
        await setDoc(doc(db, 'users', uid), {
          email: email,
          name: name.trim(),
          isCounselor: false,
          isSuperAdmin: false,
          createdAt: serverTimestamp(),
          lastLogin: serverTimestamp(),
          tosAcceptedAt: serverTimestamp(),
          emailReminders: true,
          smsReminders: false,
          reminderSchedule: defaultSchedule,
          onboardingStep: 0
        });

        // Initialize self-counselor data structure
        await setDoc(doc(db, `counselors/${uid}/counselees/${uid}`), {
          name: name.trim(),
          email: email,
          uid: uid,
          status: 'active',
          currentStreak: 0,
          createdAt: serverTimestamp(),
          isSelf: true,
          emailReminders: true,
          smsReminders: false,
          reminderSchedule: defaultSchedule
        });

        // Notify superAdmin + send verification email via Resend (fire and forget)
        const signupToken = await userCredential.user.getIdToken();
        fetch('/api/notify-signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${signupToken}` },
          body: JSON.stringify({ email, name: name.trim(), uid })
        }).catch((err) => console.error('Notify-signup error:', err));

        // Check for pending accountability partner invites — convert to partnerRequest
        // so the new user sees an invite tile on their dashboard (no auto-linking)
        try {
          const emailKey = email.toLowerCase().replace(/[.]/g, '_');
          const inviteDoc = await getDoc(doc(db, 'pendingInvites', emailKey));

          if (inviteDoc.exists()) {
            const invite = inviteDoc.data();
            const inviterUid = invite.inviterUid;
            const inviterName = invite.inviterName;

            // Get inviter's info
            const inviterDoc = await getDoc(doc(db, 'users', inviterUid));
            const inviterData = inviterDoc.exists() ? inviterDoc.data() : { name: inviterName, email: '' };

            let inviterDataPath = `counselors/${inviterUid}/counselees/${inviterUid}`;
            if (inviterData.counselorId && inviterData.counseleeDocId) {
              inviterDataPath = `counselors/${inviterData.counselorId}/counselees/${inviterData.counseleeDocId}`;
            }

            // Create a partnerRequest so it appears as an invite tile on the dashboard
            await addDoc(collection(db, 'partnerRequests'), {
              requesterUid: inviterUid,
              requesterName: inviterData.name || inviterName,
              requesterEmail: inviterData.email || '',
              requesterDataPath: inviterDataPath,
              targetUid: uid,
              targetName: name.trim(),
              targetEmail: email.toLowerCase(),
              status: 'pending',
              createdAt: serverTimestamp()
            });

            // Delete the pending invite (it's now a partnerRequest)
            await deleteDoc(doc(db, 'pendingInvites', emailKey));
          }
        } catch (inviteErr) {
          // Silent fail - don't block signup if invite conversion fails
          console.log('Could not process pending invite:', inviteErr.message);
        }
      } else {
        const userCredential = await login(email, password);
        // Update lastLogin timestamp
        try {
          await updateDoc(doc(db, 'users', userCredential.user.uid), {
            lastLogin: serverTimestamp()
          });
        } catch (e) {
          // User doc might not exist for legacy users - create it
          console.log('Could not update lastLogin:', e.message);
        }
      }
      navigate('/');
    } catch (err) {
      if (isSignup) {
        if (err.code === 'auth/email-already-in-use') {
          setError('An account with this email already exists');
        } else {
          setError('Could not create account. Please try again.');
        }
      } else {
        setError('Invalid email or password');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>Counseling Homework</h1>
        <form onSubmit={handleSubmit}>
          {isSignup && (
            <div className="form-group">
              <label htmlFor="name">Full Name</label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                placeholder="Your full name"
              />
            </div>
          )}
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={isSignup ? 'new-password' : 'current-password'}
            />
          </div>
          {isSignup && (
            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
          )}
          {error && <div className="error">{error}</div>}
          {isSignup && (
            <p style={{ fontSize: '0.8rem', color: '#718096', margin: '8px 0 4px', lineHeight: 1.5 }}>
              By signing up, you agree to our{' '}
              <a href="/tos" target="_blank" rel="noopener noreferrer" style={{ color: '#3182ce' }}>Terms of Service</a>
              {' '}and{' '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: '#3182ce' }}>Privacy Policy</a>,
              including receiving email reminders and notifications.
            </p>
          )}
          <button type="submit" disabled={loading}>
            {loading ? (isSignup ? 'Creating account...' : 'Signing in...') : (isSignup ? 'Create Account' : 'Sign In')}
          </button>
        </form>
        <p className="toggle-auth">
          {isSignup ? (
            <>Already have an account? <button type="button" onClick={() => setIsSignup(false)}>Sign In</button></>
          ) : (
            <>New here? <button type="button" onClick={() => setIsSignup(true)}>Create Account</button></>
          )}
        </p>
      </div>
    </div>
  );
}
