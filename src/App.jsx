import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { auth } from './config/firebase';
import Login from './pages/Login';
import UnifiedDashboard from './pages/UnifiedDashboard';
import TermsOfService from './pages/TermsOfService';
import PrivacyPolicy from './pages/PrivacyPolicy';
import SmsOptIn from './pages/SmsOptIn';
import HelpPage from './pages/HelpPage';
import './App.css';

function EmailVerifyGate() {
  const { user, logout } = useAuth();
  const [resent, setResent] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [verifying, setVerifying] = useState(false);

  const handleResend = async () => {
    try {
      const token = await auth.currentUser.getIdToken();
      const resp = await fetch('/api/notify-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ action: 'resend-verify', email: user.email })
      });
      if (!resp.ok) throw new Error('Failed to send');
      setResent(true);
      setTimeout(() => setResent(false), 30000);
      setCodeError('');
    } catch (err) {
      console.error('Resend verification error:', err);
      alert('Could not send verification code. Please try again later.');
    }
  };

  const handleVerifyCode = async () => {
    if (!code || code.length !== 6) {
      setCodeError('Please enter the 6-digit code from your email.');
      return;
    }
    setVerifying(true);
    setCodeError('');
    try {
      const token = await auth.currentUser.getIdToken();
      const resp = await fetch('/api/notify-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ action: 'check-verify-code', code })
      });
      const data = await resp.json();
      if (!resp.ok) {
        setCodeError(data.error || 'Invalid code. Please try again.');
      } else {
        window.location.reload();
      }
    } catch (err) {
      setCodeError('Could not verify. Please try again.');
    }
    setVerifying(false);
  };

  return (
    <div className="login-container">
      <div className="login-card" style={{ textAlign: 'center' }}>
        <h1>Counseling Homework</h1>
        <h2 style={{ fontSize: '1.2rem', color: '#2c5282', marginBottom: '1rem' }}>Verify Your Email</h2>
        <p style={{ marginBottom: '1rem', color: '#555' }}>
          A verification code was sent to <strong>{user.email}</strong>.
        </p>
        <div style={{ marginBottom: '0.5rem' }}>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            maxLength={6}
            style={{ fontSize: '1.5rem', textAlign: 'center', letterSpacing: '8px', padding: '10px', width: '200px', border: '2px solid #cbd5e0', borderRadius: '8px' }}
          />
        </div>
        {codeError && <p style={{ color: '#e53e3e', fontSize: '0.9rem', marginBottom: '0.75rem' }}>{codeError}</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button onClick={handleVerifyCode} disabled={verifying || code.length !== 6}
            style={{ background: '#2c5282', color: 'white', padding: '10px 20px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '1rem' }}>
            {verifying ? 'Verifying...' : 'Verify'}
          </button>
          <button onClick={handleResend} disabled={resent}
            style={{ background: 'transparent', color: '#2c5282', padding: '10px 20px', border: '1px solid #2c5282', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem' }}>
            {resent ? 'Code Sent!' : 'Resend Code'}
          </button>
          <p style={{ color: '#888', fontSize: '0.85rem', margin: '0' }}>
            Check your spam/junk folder if you don't see it.
          </p>
          <button onClick={logout}
            style={{ background: 'transparent', color: '#999', padding: '8px 20px', border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}>
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (!user.emailVerified) {
    return <EmailVerifyGate />;
  }

  return children;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/tos" element={<TermsOfService />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/sms-optin" element={<SmsOptIn />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <UnifiedDashboard />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
