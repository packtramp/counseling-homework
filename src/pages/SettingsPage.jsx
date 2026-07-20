import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { db, auth, storage } from '../config/firebase';
import { doc, getDoc, updateDoc, deleteField, Timestamp, collection, getDocs, addDoc, deleteDoc, query, where, orderBy, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { updateProfile, updateEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import ProfilePhoto from '../components/ProfilePhoto';
import RichTextEditor from '../components/RichTextEditor';
import { downloadCounseleeData } from '../utils/generatePDF';
import { APP_VERSION } from '../config/version';
import SuperAdminPanel from '../components/SuperAdminPanel';
import { DEFAULT_OVERALL_TEMPLATE } from '../config/counselingTemplates';

// Curated IANA timezone list (common US + major international). Not the full 400+.
const TZ_OPTIONS = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix',
  'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu',
  'America/Toronto', 'America/Mexico_City', 'America/Sao_Paulo',
  'Europe/London', 'Europe/Dublin', 'Europe/Paris', 'Europe/Berlin',
  'Europe/Madrid', 'Europe/Rome', 'Europe/Athens', 'Europe/Moscow',
  'Africa/Lagos', 'Africa/Nairobi', 'Africa/Johannesburg', 'Africa/Cairo',
  'Asia/Jerusalem', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Kathmandu',
  'Asia/Bangkok', 'Asia/Singapore', 'Asia/Manila', 'Asia/Hong_Kong',
  'Asia/Shanghai', 'Asia/Seoul', 'Asia/Tokyo',
  'Australia/Perth', 'Australia/Sydney', 'Pacific/Auckland',
];

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, userProfile, isCounselor, isSuperAdmin, logout } = useAuth();
  const role = isCounselor ? 'counselor' : 'counselee';

  const [activeView, setActiveView] = useState(null);
  const [myProfile, setMyProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Profile form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Reminder preferences
  const [smsReminders, setSmsReminders] = useState(false);
  const [emailReminders, setEmailReminders] = useState(true);
  const defaultSchedule = {
    monday: { slot1: '09:00', slot2: '', slot3: '' },
    tuesday: { slot1: '09:00', slot2: '', slot3: '' },
    wednesday: { slot1: '09:00', slot2: '', slot3: '' },
    thursday: { slot1: '09:00', slot2: '', slot3: '' },
    friday: { slot1: '09:00', slot2: '', slot3: '' },
    saturday: { slot1: '09:00', slot2: '', slot3: '' },
    sunday: { slot1: '09:00', slot2: '', slot3: '' }
  };
  const [reminderSchedule, setReminderSchedule] = useState(defaultSchedule);
  const deviceZone = (typeof Intl !== 'undefined' && Intl.DateTimeFormat().resolvedOptions().timeZone) || 'America/Chicago';
  const [timezone, setTimezone] = useState('America/Chicago');

  // Session template
  const [sessionTemplate, setSessionTemplate] = useState('');
  const [overallTemplate, setOverallTemplate] = useState('');

  // PDF download
  const [downloading, setDownloading] = useState(false);

  // Feedback form
  const [feedbackType, setFeedbackType] = useState('Feature Request');
  const [feedbackTitle, setFeedbackTitle] = useState('');
  const [feedbackPage, setFeedbackPage] = useState('');
  const [feedbackWhatHappened, setFeedbackWhatHappened] = useState('');
  const [feedbackExpected, setFeedbackExpected] = useState('');
  const [feedbackSteps, setFeedbackSteps] = useState('');
  const [feedbackDescription, setFeedbackDescription] = useState('');
  const [feedbackWhyUseful, setFeedbackWhyUseful] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);
  const [feedbackScreenshot, setFeedbackScreenshot] = useState(null);
  const [vacationStart, setVacationStart] = useState('');
  const [vacationEnd, setVacationEnd] = useState('');
  const [vacationSaving, setVacationSaving] = useState(false);
  const [feedbackScreenshotPreview, setFeedbackScreenshotPreview] = useState(null);

  // Reminder Broadcasts (group one-way SMS) — superAdmin only for now
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null); // { id, name, ownerUid, senderUids }
  const [newGroupName, setNewGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [broadcasts, setBroadcasts] = useState([]);
  const [bcLoading, setBcLoading] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [addingContact, setAddingContact] = useState(false);
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState(null);

  // Base path helper (same logic as UnifiedDashboard)
  const getMyBasePath = () => {
    if (userProfile?.counselorId && userProfile?.counseleeDocId) {
      return `counselors/${userProfile.counselorId}/counselees/${userProfile.counseleeDocId}`;
    }
    return `counselors/${user?.uid}/counselees/${user?.uid}`;
  };

  // Load user profile from Firestore
  useEffect(() => {
    if (!user) return;
    const loadProfile = async () => {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setMyProfile(data);
        setName(data.name || '');
        setEmail(auth.currentUser?.email || '');
        setPhone(data.phone || '');
        setSmsReminders(data.smsReminders ?? false);
        setEmailReminders(data.emailReminders ?? true);
        setReminderSchedule(data.reminderSchedule || defaultSchedule);
        setTimezone(data.timezone || deviceZone);
        setSessionTemplate(data.sessionTemplate || '');
        setOverallTemplate(data.overallTemplate || DEFAULT_OVERALL_TEMPLATE);
      }
      setLoading(false);
    };
    loadProfile();
  }, [user]);

  // Profile update handler (mirrors UnifiedDashboard.handleUpdateMyProfile)
  const handleUpdateMyProfile = async (updates) => {
    const wasSmsEnabled = myProfile?.smsReminders;
    const nowSmsEnabled = updates.smsReminders;
    const phoneVal = updates.phone || myProfile?.phone;

    setMyProfile(prev => ({ ...prev, ...updates }));

    const userRef = doc(db, 'users', user.uid);
    await updateDoc(userRef, updates);

    // Send welcome SMS when user enables SMS reminders
    if (!wasSmsEnabled && nowSmsEnabled && phoneVal) {
      auth.currentUser.getIdToken().then(idToken => {
        fetch('/api/toggle-counselor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
          body: JSON.stringify({ action: 'sendWelcomeSms', phone: phoneVal })
        }).catch(err => console.error('Welcome SMS failed:', err));
      }).catch(e => console.error('Welcome SMS token error:', e));
    }

    // Also update the data doc if name or photo changed
    const dataUpdates = {};
    if (updates.name) dataUpdates.name = updates.name;
    if (updates.photoUrl) dataUpdates.counseleePhotoUrl = updates.photoUrl;
    // Denormalize timezone onto the counselee doc too (the Phase-2 nightly seal reads it there).
    if (updates.timezone) dataUpdates.timezone = updates.timezone;

    if (Object.keys(dataUpdates).length > 0) {
      const dataRef = doc(db, getMyBasePath());
      await updateDoc(dataRef, dataUpdates);
    }
  };

  // Generate 30-min increment time options
  const timeOptions = (() => {
    const opts = [{ value: '', label: '—' }];
    for (let h = 0; h < 24; h++) {
      for (const m of [0, 30]) {
        const val = h.toString().padStart(2, '0') + ':' + m.toString().padStart(2, '0');
        const displayH = h % 12 || 12;
        const ampm = h >= 12 ? 'PM' : 'AM';
        const label = m === 0 ? `${displayH} ${ampm}` : `${displayH}:${m.toString().padStart(2, '0')} ${ampm}`;
        opts.push({ value: val, label });
      }
    }
    return opts;
  })();

  const snapTo30 = (value) => {
    if (!value) return '';
    const match = value.match(/^(\d{2}):(\d{2})$/);
    if (!match) return value;
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const snapped = m < 15 ? 0 : m < 45 ? 30 : 0;
    const snappedH = m >= 45 ? (h + 1) % 24 : h;
    return snappedH.toString().padStart(2, '0') + ':' + snapped.toString().padStart(2, '0');
  };

  const updateSlot = async (day, slot, value) => {
    const newSchedule = { ...reminderSchedule, [day]: { ...reminderSchedule[day], [slot]: value } };
    setReminderSchedule(newSchedule);
    try {
      await handleUpdateMyProfile({ reminderSchedule: newSchedule });
    } catch (err) {
      console.error('Auto-save reminder failed:', err);
    }
  };

  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const dayLabels = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };

  // Form handlers
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setError(null); setSuccess(null); setSaving(true);
    try {
      if (name !== myProfile?.name) {
        await updateProfile(auth.currentUser, { displayName: name });
      }
      if (email !== auth.currentUser.email) {
        await updateEmail(auth.currentUser, email);
      }
      const updates = { name, email };
      if (role === 'counselor') updates.phone = phone;
      await handleUpdateMyProfile(updates);
      setSuccess('Profile updated successfully!');
    } catch (err) {
      if (err.code === 'auth/requires-recent-login') {
        setError('Please sign out and sign back in to change your email.');
      } else { setError(err.message); }
    } finally { setSaving(false); }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setError(null); setSuccess(null);
    if (newPassword !== confirmPassword) { setError('New passwords do not match.'); return; }
    if (newPassword.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setSaving(true);
    try {
      const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPassword);
      setSuccess('Password updated successfully!');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err) {
      if (err.code === 'auth/wrong-password') { setError('Current password is incorrect.'); }
      else { setError(err.message); }
    } finally { setSaving(false); }
  };

  const handleSaveReminders = async (e) => {
    e.preventDefault();
    setError(null); setSuccess(null);
    if (smsReminders && !phone.trim()) { setError('Phone number required for SMS reminders'); return; }
    setSaving(true);
    try {
      await handleUpdateMyProfile({ phone, reminderSchedule, smsReminders, emailReminders, timezone });
      setSuccess('Reminder preferences saved!');
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handleSaveTemplate = async (e) => {
    e.preventDefault();
    setError(null); setSuccess(null); setSaving(true);
    try {
      await handleUpdateMyProfile({ sessionTemplate, overallTemplate });
      setSuccess('Session template saved!');
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handleDownload = async () => {
    setError(null); setDownloading(true);
    try {
      const cId = myProfile?.counselorId || userProfile?.counselorId || user?.uid;
      const cDocId = myProfile?.counseleeDocId || userProfile?.counseleeDocId || user?.uid;
      await downloadCounseleeData(cId, cDocId, myProfile?.name || 'Unknown');
      setSuccess('PDF downloaded!');
    } catch (err) {
      setError('PDF error: ' + (err.message || String(err)));
    } finally { setDownloading(false); }
  };

  const handleSignOut = async () => {
    await logout();
    navigate('/login');
  };

  const openView = (view) => {
    setError(null); setSuccess(null);
    setActiveView(view);
  };

  // ---- REMINDER BROADCASTS (groups) ----
  const loadGroups = async () => {
    if (!user) return;
    setBcLoading(true);
    try {
      // Groups I own + groups I'm an invited sender on.
      const ownedSnap = await getDocs(query(collection(db, 'broadcastGroups'), where('ownerUid', '==', user.uid)));
      let senderDocs = [];
      try {
        const senderSnap = await getDocs(query(collection(db, 'broadcastGroups'), where('senderUids', 'array-contains', user.uid)));
        senderDocs = senderSnap.docs;
      } catch { /* ignore */ }
      const map = new Map();
      [...ownedSnap.docs, ...senderDocs].forEach(d => map.set(d.id, { id: d.id, ...d.data() }));
      setGroups([...map.values()].sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    } catch (err) {
      setError('Could not load groups: ' + err.message);
    } finally {
      setBcLoading(false);
    }
  };

  const loadGroupData = async (groupId) => {
    if (!user || !groupId) return;
    setBcLoading(true);
    try {
      const cSnap = await getDocs(collection(db, `broadcastGroups/${groupId}/contacts`));
      setContacts(
        cSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      );
      const bSnap = await getDocs(query(collection(db, `broadcastGroups/${groupId}/broadcasts`), orderBy('sentAt', 'desc')));
      setBroadcasts(bSnap.docs.slice(0, 10).map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      setError('Could not load group: ' + err.message);
    } finally {
      setBcLoading(false);
    }
  };

  useEffect(() => {
    if (activeView === 'broadcasts') { setSelectedGroup(null); loadGroups(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView]);

  const openGroup = (g) => {
    setError(null); setSuccess(null); setBroadcastResult(null); setBroadcastMsg('');
    setSelectedGroup(g);
    loadGroupData(g.id);
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    setError(null); setSuccess(null);
    if (!newGroupName.trim()) { setError('Group name required'); return; }
    setCreatingGroup(true);
    try {
      const ref = await addDoc(collection(db, 'broadcastGroups'), {
        name: newGroupName.trim(),
        ownerUid: user.uid,
        senderUids: [user.uid],
        createdAt: serverTimestamp(),
      });
      setNewGroupName('');
      await loadGroups();
      openGroup({ id: ref.id, name: newGroupName.trim(), ownerUid: user.uid, senderUids: [user.uid] });
    } catch (err) {
      setError('Could not create group: ' + err.message);
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleDeleteGroup = async (g) => {
    if (g.ownerUid !== user.uid) { setError('Only the group owner can delete it.'); return; }
    if (!window.confirm(`Delete the "${g.name}" group and all its contacts? This cannot be undone.`)) return;
    try {
      // Best-effort: delete contact docs, then the group doc.
      const cSnap = await getDocs(collection(db, `broadcastGroups/${g.id}/contacts`));
      await Promise.all(cSnap.docs.map(d => deleteDoc(doc(db, `broadcastGroups/${g.id}/contacts/${d.id}`))));
      await deleteDoc(doc(db, `broadcastGroups/${g.id}`));
      setSelectedGroup(null);
      await loadGroups();
    } catch (err) { setError('Could not delete group: ' + err.message); }
  };

  const fmtPhoneDisplay = (p) => {
    const d = String(p || '').replace(/\D/g, '');
    if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    if (d.length === 11 && d[0] === '1') return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
    return p;
  };

  const isGroupOwner = selectedGroup && selectedGroup.ownerUid === user?.uid;

  const handleAddContact = async (e) => {
    e.preventDefault();
    setError(null); setSuccess(null);
    if (!selectedGroup) return;
    const digits = newContactPhone.replace(/\D/g, '');
    if (!newContactName.trim()) { setError('Name required'); return; }
    if (digits.length < 10) { setError('Enter a valid phone number'); return; }
    setAddingContact(true);
    try {
      await addDoc(collection(db, `broadcastGroups/${selectedGroup.id}/contacts`), {
        name: newContactName.trim(),
        phone: digits,
        active: true,
        optOut: false,
        createdAt: serverTimestamp(),
      });
      setNewContactName(''); setNewContactPhone('');
      await loadGroupData(selectedGroup.id);
    } catch (err) {
      setError('Could not add contact: ' + err.message);
    } finally {
      setAddingContact(false);
    }
  };

  const handleToggleContactActive = async (c) => {
    if (!selectedGroup) return;
    try {
      await updateDoc(doc(db, `broadcastGroups/${selectedGroup.id}/contacts/${c.id}`), { active: !(c.active !== false) });
      setContacts(prev => prev.map(x => x.id === c.id ? { ...x, active: !(x.active !== false) } : x));
    } catch (err) { setError('Could not update: ' + err.message); }
  };

  const handleDeleteContact = async (c) => {
    if (!selectedGroup) return;
    if (!window.confirm(`Remove ${c.name} from the ${selectedGroup.name} list?`)) return;
    try {
      await deleteDoc(doc(db, `broadcastGroups/${selectedGroup.id}/contacts/${c.id}`));
      setContacts(prev => prev.filter(x => x.id !== c.id));
    } catch (err) { setError('Could not remove: ' + err.message); }
  };

  const handleSendBroadcast = async () => {
    setError(null); setSuccess(null); setBroadcastResult(null);
    if (!selectedGroup) return;
    const msg = broadcastMsg.trim();
    if (!msg) { setError('Type a reminder first'); return; }
    const activeCount = contacts.filter(c => c.active !== false && c.optOut !== true).length;
    if (activeCount === 0) { setError('No active contacts to send to'); return; }
    if (!window.confirm(`Send this reminder to ${activeCount} active contact${activeCount > 1 ? 's' : ''} in ${selectedGroup.name}?`)) return;
    setBroadcastSending(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const resp = await fetch('/api/toggle-counselor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({ action: 'sendBroadcast', groupId: selectedGroup.id, message: msg }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Send failed');
      setBroadcastResult(data);
      setSuccess(`Sent to ${data.sentCount} contact${data.sentCount !== 1 ? 's' : ''}${data.failCount ? `, ${data.failCount} failed` : ''}.`);
      setBroadcastMsg('');
      await loadGroupData(selectedGroup.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBroadcastSending(false);
    }
  };

  if (loading) return <div className="loading">Loading...</div>;

  // Sub-view header
  const SubViewHeader = ({ title }) => (
    <div className="settings-page-header">
      <button className="settings-back-btn" onClick={() => setActiveView(null)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
        <span>Settings</span>
      </button>
      <h1 className="settings-page-title">{title}</h1>
    </div>
  );

  // ---- SUB-VIEWS ----

  if (activeView === 'profile') {
    return (
      <div className="settings-page">
        <SubViewHeader title="Profile" />
        <div className="settings-sub-view">
          {error && <div className="settings-error">{error}</div>}
          {success && <div className="settings-success">{success}</div>}
          <form onSubmit={handleSaveProfile}>
            {role === 'counselee' && userProfile?.counselorId && userProfile?.counseleeDocId && (
              <div className="form-group profile-photo-section">
                <label>Profile Photo</label>
                <ProfilePhoto
                  photoUrl={myProfile?.counseleePhotoUrl}
                  counselorId={userProfile.counselorId}
                  counseleeId={userProfile.counseleeDocId}
                  onPhotoUpdate={(url, fieldName) => handleUpdateMyProfile({ [fieldName]: url })}
                  editable={true} size="medium" uploadedBy="counselee"
                />
              </div>
            )}
            {role === 'counselor' && user?.uid && (
              <div className="form-group profile-photo-section">
                <label>Profile Photo</label>
                <ProfilePhoto
                  photoUrl={myProfile?.photoUrl}
                  counselorId={user.uid}
                  onPhotoUpdate={(url) => handleUpdateMyProfile({ photoUrl: url })}
                  editable={true} size="medium" uploadedBy="counselor-self"
                />
              </div>
            )}
            <div className="form-group">
              <label>Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            {role === 'counselor' && (
              <div className="form-group">
                <label>Phone</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 123-4567" />
                <small className="form-hint">Visible to your counselees</small>
              </div>
            )}
            <button type="submit" className="save-btn" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (activeView === 'password') {
    return (
      <div className="settings-page">
        <SubViewHeader title="Password" />
        <div className="settings-sub-view">
          {error && <div className="settings-error">{error}</div>}
          {success && <div className="settings-success">{success}</div>}
          <form onSubmit={handleChangePassword}>
            <div className="form-group">
              <label>Current Password</label>
              <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>New Password</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} />
            </div>
            <div className="form-group">
              <label>Confirm New Password</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={6} />
            </div>
            <button type="submit" className="save-btn" disabled={saving}>
              {saving ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (activeView === 'reminders') {
    return (
      <div className="settings-page">
        <SubViewHeader title="Reminders" />
        <div className="settings-sub-view">
          {error && <div className="settings-error">{error}</div>}
          {success && <div className="settings-success">{success}</div>}
          <form onSubmit={handleSaveReminders}>
            <div className="form-group checkbox-group">
              <label className="checkbox-label">
                <input type="checkbox" checked={emailReminders} onChange={e => setEmailReminders(e.target.checked)} />
                <span>Email reminders</span>
              </label>
              <small className="form-hint">Sent to {auth.currentUser?.email}</small>
            </div>
            <div className="form-group checkbox-group">
              <label className="checkbox-label">
                <input type="checkbox" checked={smsReminders} onChange={e => setSmsReminders(e.target.checked)} />
                <span>I agree to receive reminder messages from Counseling Homework via text. Message frequency varies. Message and data rates may apply. Reply STOP to unsubscribe or HELP for assistance at any time.</span>
              </label>
              <small className="form-hint" style={{ marginTop: '6px', display: 'block', fontWeight: 600 }}>
                Reminders only — we do not send marketing or promotional messages.
              </small>
            </div>
            <div className="form-group">
              <label>Phone Number</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 123-4567" required={smsReminders} />
              <small className="form-hint">{smsReminders ? 'Standard message rates may apply.' : 'Required only if SMS reminders are enabled.'}</small>
            </div>
            <div className="form-group">
              <label>Your Timezone</label>
              <select value={timezone} onChange={e => setTimezone(e.target.value)}>
                {(TZ_OPTIONS.includes(timezone) ? TZ_OPTIONS : [timezone, ...TZ_OPTIONS]).map(z => (
                  <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>
                ))}
              </select>
              <small className="form-hint" style={{ display: 'block' }}>
                Reminder times below are in your timezone. Detected on this device: {deviceZone.replace(/_/g, ' ')}
                {timezone !== deviceZone && (
                  <> — <button type="button" onClick={() => setTimezone(deviceZone)} style={{ background: 'none', border: 'none', color: '#2c5282', cursor: 'pointer', padding: 0, textDecoration: 'underline', font: 'inherit' }}>use this</button></>
                )}
              </small>
            </div>
            <div className="form-group reminder-schedule">
              <label>Weekly Schedule</label>
              <small className="form-hint" style={{ marginBottom: '8px', display: 'block' }}>
                Set up to 3 reminder times per day. Slot 1 is your main reminder.
                Slots 2-3 are for Think Lists (3x/day) or follow-up reminders.
              </small>
              <div className="schedule-grid">
                <div className="schedule-header">
                  <span></span><span>Main</span><span>+2</span><span>+3</span>
                </div>
                {days.map(day => (
                  <div key={day} className="schedule-row">
                    <span className="day-label">{dayLabels[day]}</span>
                    {['slot1', 'slot2', 'slot3'].map(slot => (
                      <select key={slot} value={snapTo30(reminderSchedule[day]?.[slot])} onChange={e => updateSlot(day, slot, e.target.value)}>
                        {timeOptions.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <button type="submit" className="save-btn" disabled={saving}>
              {saving ? 'Saving...' : 'Save Preferences'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (activeView === 'template' && role === 'counselor') {
    return (
      <div className="settings-page">
        <SubViewHeader title="Session Template" />
        <div className="settings-sub-view">
          {error && <div className="settings-error">{error}</div>}
          {success && <div className="settings-success">{success}</div>}
          <form onSubmit={handleSaveTemplate}>
            <div className="form-group">
              <label>Session Notes Template</label>
              <small className="form-hint" style={{ marginBottom: '8px', display: 'block' }}>
                Create a template with questions or sections. This will pre-populate when you create a new session.
              </small>
              <RichTextEditor
                content={sessionTemplate}
                onChange={setSessionTemplate}
                placeholder="Enter your session template here... e.g., Opening Questions, Progress Review, New Assignments, Prayer Requests..."
              />
            </div>
            <div className="form-group" style={{ marginTop: '1.5rem' }}>
              <label>Overall Summary Template</label>
              <small className="form-hint" style={{ marginBottom: '8px', display: 'block' }}>
                The big-picture summary you keep per counselee (background, idols, hope log, topics to cover, put off/put on).
                Each counselee starts from a copy of this — only you ever see it. Use the ☑ checklist and ▦ table buttons.
              </small>
              <RichTextEditor
                content={overallTemplate}
                onChange={setOverallTemplate}
                placeholder="Your overall summary structure..."
              />
            </div>
            <button type="submit" className="save-btn" disabled={saving}>
              {saving ? 'Saving...' : 'Save Templates'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (activeView === 'download') {
    return (
      <div className="settings-page">
        <SubViewHeader title="Download My Data" />
        <div className="settings-sub-view">
          {error && <div className="settings-error">{error}</div>}
          {success && <div className="settings-success">{success}</div>}
          <p style={{ fontSize: '0.9rem', color: '#4a5568', marginBottom: 16, lineHeight: 1.5 }}>
            Download all your counseling data as a PDF file including homework, journals, think lists, heart journal entries, and activity history.
          </p>
          <button className="save-btn" disabled={downloading} onClick={handleDownload}>
            {downloading ? 'Generating PDF...' : 'Download My Data'}
          </button>
        </div>
      </div>
    );
  }

  if (activeView === 'admin' && isSuperAdmin) {
    return (
      <div className="settings-page">
        <SubViewHeader title="Super Admin" />
        <div className="settings-sub-view">
          <SuperAdminPanel user={user} auth={auth} db={db} />
        </div>
      </div>
    );
  }

  if (activeView === 'broadcasts' && isSuperAdmin && !selectedGroup) {
    // ---- GROUP LIST ----
    return (
      <div className="settings-page">
        <SubViewHeader title="Reminder Broadcasts" />
        <div className="settings-sub-view">
          {error && <div className="settings-error">{error}</div>}
          {success && <div className="settings-success">{success}</div>}

          <p style={{ fontSize: '0.9rem', color: '#4a5568', margin: '0 0 20px', lineHeight: 1.5 }}>
            Create a group, add people, and send one-way text reminders. Each person gets a private
            text — no group thread. Recipients can reply <strong>STOP</strong> to opt out automatically.
          </p>

          {bcLoading ? (
            <p style={{ color: '#718096' }}>Loading…</p>
          ) : groups.length === 0 ? (
            <p style={{ color: '#a0aec0', fontStyle: 'italic', marginBottom: 20 }}>No groups yet. Create your first below.</p>
          ) : (
            <div style={{ marginBottom: 20 }}>
              {groups.map(g => (
                <button
                  key={g.id}
                  className="settings-row"
                  onClick={() => openGroup(g)}
                  style={{ width: '100%' }}
                >
                  <span className="settings-row-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
                  </span>
                  <span className="settings-row-content">
                    <span className="settings-row-label">{g.name}</span>
                    <span className="settings-row-detail">{g.ownerUid === user?.uid ? 'You own this group' : 'Shared with you (sender)'}</span>
                  </span>
                  <span className="settings-row-chevron">&rsaquo;</span>
                </button>
              ))}
            </div>
          )}

          <form onSubmit={handleCreateGroup} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="text"
              value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              placeholder="New group name (e.g., Men's Group)"
              style={{ flex: '1 1 180px', padding: '0.5rem', borderRadius: 6, border: '1px solid #cbd5e0' }}
            />
            <button type="submit" className="save-btn" style={{ flex: '0 0 auto', margin: 0 }} disabled={creatingGroup}>
              {creatingGroup ? 'Creating…' : '+ New Group'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (activeView === 'broadcasts' && isSuperAdmin && selectedGroup) {
    // ---- SELECTED GROUP ----
    const activeContacts = contacts.filter(c => c.active !== false && c.optOut !== true);
    return (
      <div className="settings-page">
        <div className="settings-page-header">
          <button className="settings-back-btn" onClick={() => { setSelectedGroup(null); loadGroups(); }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
            <span>Groups</span>
          </button>
          <h1 className="settings-page-title">{selectedGroup.name}</h1>
        </div>
        <div className="settings-sub-view">
          {error && <div className="settings-error">{error}</div>}
          {success && <div className="settings-success">{success}</div>}

          {/* COMPOSE */}
          <div className="form-group">
            <label>Reminder Message</label>
            <textarea
              className="feedback-textarea"
              value={broadcastMsg}
              onChange={e => setBroadcastMsg(e.target.value)}
              placeholder="e.g., Men's group tonight at 7pm at the church. See you there!"
              rows={4}
              maxLength={1000}
            />
            <small className="form-hint" style={{ display: 'block' }}>
              {broadcastMsg.length} characters &middot; sends to {activeContacts.length} active contact{activeContacts.length !== 1 ? 's' : ''}
            </small>
          </div>
          <button
            className="save-btn"
            disabled={broadcastSending || !broadcastMsg.trim() || activeContacts.length === 0}
            onClick={handleSendBroadcast}
          >
            {broadcastSending ? 'Sending…' : `Send to ${activeContacts.length} active`}
          </button>

          {broadcastResult && broadcastResult.results?.some(r => r.status === 'failed') && (
            <div style={{ marginTop: 12, fontSize: '0.85rem' }}>
              {broadcastResult.results.filter(r => r.status === 'failed').map((r, i) => (
                <div key={i} style={{ color: '#e53e3e' }}>✕ {r.name || r.phone}: {r.error}</div>
              ))}
            </div>
          )}

          {/* CONTACTS */}
          <div style={{ marginTop: 28 }}>
            <h3 style={{ fontSize: '1rem', margin: '0 0 4px', color: '#2d3748' }}>Contacts ({contacts.length})</h3>
            <p style={{ fontSize: '0.8rem', color: '#718096', margin: '0 0 12px' }}>
              Toggle off to skip someone without deleting. Remove drops them entirely.
            </p>

            {isGroupOwner && (
              <form onSubmit={handleAddContact} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                <input
                  type="text"
                  value={newContactName}
                  onChange={e => setNewContactName(e.target.value)}
                  placeholder="Name"
                  style={{ flex: '1 1 120px', padding: '0.5rem', borderRadius: 6, border: '1px solid #cbd5e0' }}
                />
                <input
                  type="tel"
                  value={newContactPhone}
                  onChange={e => setNewContactPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  style={{ flex: '1 1 140px', padding: '0.5rem', borderRadius: 6, border: '1px solid #cbd5e0' }}
                />
                <button type="submit" className="save-btn" style={{ flex: '0 0 auto', margin: 0 }} disabled={addingContact}>
                  {addingContact ? 'Adding…' : 'Add'}
                </button>
              </form>
            )}

            {bcLoading ? (
              <p style={{ color: '#718096' }}>Loading…</p>
            ) : contacts.length === 0 ? (
              <p style={{ color: '#a0aec0', fontStyle: 'italic' }}>No contacts yet.{isGroupOwner ? ' Add your first above.' : ''}</p>
            ) : (
              <div>
                {contacts.map(c => {
                  const isActive = c.active !== false && c.optOut !== true;
                  return (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #edf2f7' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: isActive ? '#2d3748' : '#a0aec0' }}>{c.name}</div>
                        <div style={{ fontSize: '0.8rem', color: '#718096' }}>
                          {fmtPhoneDisplay(c.phone)}{c.optOut ? ' · opted out' : ''}
                        </div>
                      </div>
                      {isGroupOwner && (
                        <>
                          <button
                            onClick={() => handleToggleContactActive(c)}
                            disabled={c.optOut === true}
                            title={isActive ? 'Active — tap to pause' : 'Paused — tap to activate'}
                            style={{
                              fontSize: '0.75rem', padding: '3px 10px', borderRadius: 12, border: 'none', cursor: c.optOut ? 'not-allowed' : 'pointer',
                              background: isActive ? '#c6f6d5' : '#e2e8f0', color: isActive ? '#276749' : '#718096', fontWeight: 600
                            }}
                          >
                            {isActive ? 'Active' : 'Paused'}
                          </button>
                          <button
                            onClick={() => handleDeleteContact(c)}
                            title="Remove"
                            style={{ background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer', fontSize: '1.1rem', padding: '0 4px' }}
                          >
                            ✕
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* HISTORY */}
          {broadcasts.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <h3 style={{ fontSize: '1rem', margin: '0 0 12px', color: '#2d3748' }}>Recent Sends</h3>
              {broadcasts.map(b => {
                const when = b.sentAt?.toDate?.() || (b.sentAt?.seconds ? new Date(b.sentAt.seconds * 1000) : null);
                return (
                  <div key={b.id} style={{ padding: '10px 0', borderBottom: '1px solid #edf2f7' }}>
                    <div style={{ fontSize: '0.85rem', color: '#2d3748' }}>{b.message}</div>
                    <div style={{ fontSize: '0.75rem', color: '#718096', marginTop: 4 }}>
                      {when ? when.toLocaleString() : '—'} · {b.sentCount}/{b.recipientCount} sent{b.failCount ? ` · ${b.failCount} failed` : ''}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* DELETE GROUP */}
          {isGroupOwner && (
            <div style={{ marginTop: 32 }}>
              <button
                onClick={() => handleDeleteGroup(selectedGroup)}
                style={{ background: 'none', border: '1px solid #e53e3e', color: '#e53e3e', borderRadius: 6, padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                Delete this group
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (activeView === 'vacation') {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const minEnd = vacationStart
      ? new Date(new Date(vacationStart).getTime() + 86400000).toISOString().split('T')[0]
      : tomorrowStr;

    const existingStart = userProfile?.vacationStart?.toDate?.() || (userProfile?.vacationStart?.seconds ? new Date(userProfile.vacationStart.seconds * 1000) : null);
    const existingEnd = userProfile?.vacationEnd?.toDate?.() || (userProfile?.vacationEnd?.seconds ? new Date(userProfile.vacationEnd.seconds * 1000) : null);
    const isOnVacation = existingStart && existingEnd && new Date() >= existingStart && new Date() <= existingEnd;

    const handleSetVacation = async () => {
      if (!vacationStart || !vacationEnd) return;
      setVacationSaving(true);
      try {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
          vacationStart: Timestamp.fromDate(new Date(vacationStart + 'T00:00:00')),
          vacationEnd: Timestamp.fromDate(new Date(vacationEnd + 'T23:59:59')),
        });
        window.location.reload();
      } catch (err) {
        console.error('Error setting vacation:', err);
        alert('Failed to set vacation. Please try again.');
        setVacationSaving(false);
      }
    };

    const handleCancelVacation = async () => {
      if (!window.confirm('Cancel your vacation?')) return;
      setVacationSaving(true);
      try {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
          vacationStart: deleteField(),
          vacationEnd: deleteField(),
        });
        setVacationStart('');
        setVacationEnd('');
        window.location.reload();
      } catch (err) {
        console.error('Error cancelling vacation:', err);
        alert('Failed to cancel vacation. Please try again.');
        setVacationSaving(false);
      }
    };

    return (
      <div className="settings-page">
        <SubViewHeader title="Set Vacation" />
        <div className="settings-sub-view">
          <p style={{ fontSize: '0.9rem', color: '#718096', marginBottom: '1.5rem' }}>
            Set vacation dates to pause streaks and reminders while you're away.
          </p>

          {(isOnVacation || (existingStart && existingEnd)) && (
            <div style={{
              background: isOnVacation ? '#c6f6d5' : '#bee3f8',
              border: `1px solid ${isOnVacation ? '#68d391' : '#63b3ed'}`,
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1.5rem',
              textAlign: 'center'
            }}>
              <strong style={{ color: isOnVacation ? '#276749' : '#2a4365' }}>
                {isOnVacation ? "You're on vacation!" : 'Upcoming vacation'}
              </strong>
              <p style={{ margin: '0.5rem 0 0.75rem', color: isOnVacation ? '#2f855a' : '#2b6cb0', fontSize: '0.9rem' }}>
                {existingStart.toLocaleDateString()} — {existingEnd.toLocaleDateString()}
              </p>
              <button
                onClick={handleCancelVacation}
                disabled={vacationSaving}
                style={{
                  background: '#e53e3e',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '0.5rem 1.25rem',
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                {vacationSaving ? 'Cancelling...' : 'Cancel Vacation'}
              </button>
            </div>
          )}

          <div className="form-group">
            <label>Start Date</label>
            <input
              type="date"
              value={vacationStart || (existingStart && !vacationStart ? '' : vacationStart)}
              min={tomorrowStr}
              onChange={(e) => {
                setVacationStart(e.target.value);
                if (vacationEnd && e.target.value >= vacationEnd) {
                  setVacationEnd('');
                }
              }}
              style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid #cbd5e0', fontSize: '1rem' }}
            />
          </div>

          <div className="form-group" style={{ marginTop: '1rem' }}>
            <label>End Date</label>
            <input
              type="date"
              value={vacationEnd}
              min={minEnd}
              onChange={(e) => setVacationEnd(e.target.value)}
              disabled={!vacationStart}
              style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid #cbd5e0', fontSize: '1rem' }}
            />
          </div>

          <button
            onClick={handleSetVacation}
            disabled={!vacationStart || !vacationEnd || vacationSaving}
            style={{
              marginTop: '1.5rem',
              width: '100%',
              padding: '0.75rem',
              background: (!vacationStart || !vacationEnd) ? '#a0aec0' : '#3182ce',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1rem',
              cursor: (!vacationStart || !vacationEnd) ? 'not-allowed' : 'pointer'
            }}
          >
            {vacationSaving ? 'Saving...' : 'Set Vacation'}
          </button>
        </div>
      </div>
    );
  }

  if (activeView === 'feedback') {
    const isBug = feedbackType === 'Bug Report';
    const feedbackPages = ['Dashboard', 'Homework', 'Sessions', 'Heart Journals', 'Think Lists', 'Prayer Requests', 'Accountability Partners', 'Calendar', 'Settings', 'Other'];

    const handleFeedbackSubmit = async (e) => {
      e.preventDefault();
      setFeedbackSubmitting(true);
      setError(null);
      try {
        const idToken = await auth.currentUser.getIdToken();
        const payload = {
          action: 'feedback',
          type: feedbackType,
          title: feedbackTitle,
          page: feedbackPage,
          email: auth.currentUser?.email || '',
          displayName: myProfile?.name || auth.currentUser?.displayName || '',
          uid: user?.uid,
        };
        if (isBug) {
          payload.whatHappened = feedbackWhatHappened;
          payload.expected = feedbackExpected;
          payload.steps = feedbackSteps;
        } else {
          payload.description = feedbackDescription;
          payload.whyUseful = feedbackWhyUseful;
        }
        // Upload screenshot if present
        if (feedbackScreenshot) {
          const timestamp = Date.now();
          const storageRef = ref(storage, `feedback/${user.uid}/${timestamp}-${feedbackScreenshot.name}`);
          await uploadBytes(storageRef, feedbackScreenshot);
          const screenshotUrl = await getDownloadURL(storageRef);
          payload.screenshotUrl = screenshotUrl;
        }
        const resp = await fetch('/api/notify-signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
          body: JSON.stringify(payload),
        });
        if (!resp.ok) throw new Error((await resp.json()).error || 'Failed to submit');
        setFeedbackSuccess(true);
        setTimeout(() => {
          setActiveView(null);
          setFeedbackSuccess(false);
          setFeedbackTitle(''); setFeedbackPage(''); setFeedbackWhatHappened(''); setFeedbackExpected(''); setFeedbackSteps(''); setFeedbackDescription(''); setFeedbackWhyUseful('');
          setFeedbackScreenshot(null); setFeedbackScreenshotPreview(null);
          setFeedbackType('Feature Request');
        }, 2500);
      } catch (err) {
        setError(err.message);
      } finally {
        setFeedbackSubmitting(false);
      }
    };

    if (feedbackSuccess) {
      return (
        <div className="settings-page">
          <SubViewHeader title="Send Feedback" />
          <div className="settings-sub-view">
            <div className="feedback-success">
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <h3>Thanks for your feedback!</h3>
              <p>We'll review it shortly.</p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="settings-page">
        <SubViewHeader title="Send Feedback" />
        <div className="settings-sub-view">
          {error && <div className="settings-error">{error}</div>}
          <form onSubmit={handleFeedbackSubmit}>
            <div className="form-group">
              <label>Type</label>
              <div className="feedback-toggle-row">
                <button type="button" className={`feedback-toggle-btn${feedbackType === 'Feature Request' ? ' feedback-toggle-active feedback-toggle-feature' : ''}`} onClick={() => setFeedbackType('Feature Request')}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  Feature Request
                </button>
                <button type="button" className={`feedback-toggle-btn${feedbackType === 'Bug Report' ? ' feedback-toggle-active feedback-toggle-bug' : ''}`} onClick={() => setFeedbackType('Bug Report')}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  Bug Report
                </button>
              </div>
            </div>
            <div className="form-group">
              <label>From</label>
              <div style={{ padding: '8px 12px', background: 'var(--color-gray-50)', borderRadius: '6px', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                {auth.currentUser?.email}
              </div>
            </div>
            <div className="form-group">
              <label>Title <span style={{ color: 'var(--color-danger)' }}>*</span></label>
              <input type="text" value={feedbackTitle} onChange={e => setFeedbackTitle(e.target.value)} placeholder={isBug ? 'Brief description of the bug' : 'Brief description of the feature'} required />
            </div>
            <div className="form-group">
              <label>Page</label>
              <div className="feedback-chip-row">
                {feedbackPages.map(p => (
                  <button type="button" key={p} className={`feedback-chip${feedbackPage === p ? ' feedback-chip-selected' : ''}`} onClick={() => setFeedbackPage(feedbackPage === p ? '' : p)}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            {isBug ? (
              <>
                <div className="form-group">
                  <label>What's happening? <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                  <textarea className="feedback-textarea" value={feedbackWhatHappened} onChange={e => setFeedbackWhatHappened(e.target.value)} placeholder="Describe what went wrong..." required rows={3} />
                </div>
                <div className="form-group">
                  <label>Expected behavior</label>
                  <textarea className="feedback-textarea" value={feedbackExpected} onChange={e => setFeedbackExpected(e.target.value)} placeholder="What did you expect to happen?" rows={2} />
                </div>
                <div className="form-group">
                  <label>Steps to reproduce</label>
                  <textarea className="feedback-textarea" value={feedbackSteps} onChange={e => setFeedbackSteps(e.target.value)} placeholder="1. Go to...\n2. Click on...\n3. See error" rows={3} />
                </div>
              </>
            ) : (
              <>
                <div className="form-group">
                  <label>Describe the feature <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                  <textarea className="feedback-textarea" value={feedbackDescription} onChange={e => setFeedbackDescription(e.target.value)} placeholder="What would you like to see?" required rows={3} />
                </div>
                <div className="form-group">
                  <label>Why would this be useful?</label>
                  <textarea className="feedback-textarea" value={feedbackWhyUseful} onChange={e => setFeedbackWhyUseful(e.target.value)} placeholder="How would this help you?" rows={2} />
                </div>
              </>
            )}
            <div className="form-group">
              <label>Screenshot (optional)</label>
              <div className="feedback-screenshot-area">
                {feedbackScreenshotPreview ? (
                  <div className="feedback-screenshot-preview">
                    <img src={feedbackScreenshotPreview} alt="Screenshot preview" />
                    <button type="button" className="feedback-screenshot-remove" onClick={() => { setFeedbackScreenshot(null); setFeedbackScreenshotPreview(null); }}>✕</button>
                  </div>
                ) : (
                  <label className="feedback-screenshot-btn">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    Add Screenshot
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async (e) => {
                      const file = e.target.files[0];
                      if (file && file.type.startsWith('image/')) {
                        // Resize to max 800px, JPEG 80% quality
                        const resized = await new Promise((resolve) => {
                          const img = new Image();
                          img.onload = () => {
                            const maxDim = 800;
                            let { width, height } = img;
                            if (width > maxDim || height > maxDim) {
                              const ratio = Math.min(maxDim / width, maxDim / height);
                              width = Math.round(width * ratio);
                              height = Math.round(height * ratio);
                            }
                            const canvas = document.createElement('canvas');
                            canvas.width = width;
                            canvas.height = height;
                            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                            canvas.toBlob(resolve, 'image/jpeg', 0.8);
                          };
                          img.src = URL.createObjectURL(file);
                        });
                        setFeedbackScreenshot(resized);
                        const reader = new FileReader();
                        reader.onload = (ev) => setFeedbackScreenshotPreview(ev.target.result);
                        reader.readAsDataURL(resized);
                      }
                    }} />
                  </label>
                )}
              </div>
            </div>
            <button type="submit" className="feedback-submit-btn" disabled={feedbackSubmitting}>
              {feedbackSubmitting ? 'Submitting...' : 'Submit Feedback'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ---- MAIN SETTINGS LIST ----
  return (
    <div className="settings-page">
      <div className="settings-page-header">
        <button className="settings-back-btn" onClick={() => navigate('/')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          <span>Back</span>
        </button>
        <h1 className="settings-page-title">Settings</h1>
        <span className="settings-version">v{APP_VERSION}</span>
      </div>

      <div className="settings-list">
        {/* ACCOUNT */}
        <div className="settings-section">
          <div className="settings-section-title">Account</div>
          <div className="settings-group">
            <button className="settings-row" onClick={() => openView('profile')}>
              <span className="settings-row-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </span>
              <span className="settings-row-content">
                <span className="settings-row-label">Profile</span>
                <span className="settings-row-detail">{myProfile?.name || 'Set up your profile'}</span>
              </span>
              <span className="settings-row-chevron">&rsaquo;</span>
            </button>
            <button className="settings-row" onClick={() => openView('password')}>
              <span className="settings-row-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              </span>
              <span className="settings-row-content">
                <span className="settings-row-label">Password</span>
                <span className="settings-row-detail">Change password</span>
              </span>
              <span className="settings-row-chevron">&rsaquo;</span>
            </button>
            <button className="settings-row settings-row-danger" onClick={handleSignOut}>
              <span className="settings-row-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              </span>
              <span className="settings-row-content">
                <span className="settings-row-label">Sign Out</span>
              </span>
            </button>
          </div>
        </div>

        {/* PREFERENCES */}
        <div className="settings-section">
          <div className="settings-section-title">Preferences</div>
          <div className="settings-group">
            <button className="settings-row" onClick={() => openView('reminders')}>
              <span className="settings-row-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
              </span>
              <span className="settings-row-content">
                <span className="settings-row-label">Reminders</span>
                <span className="settings-row-detail">Email & SMS schedule</span>
              </span>
              <span className="settings-row-chevron">&rsaquo;</span>
            </button>
            {role === 'counselor' && (
              <button className="settings-row" onClick={() => openView('template')}>
                <span className="settings-row-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                </span>
                <span className="settings-row-content">
                  <span className="settings-row-label">Session Template</span>
                  <span className="settings-row-detail">Pre-fill session notes</span>
                </span>
                <span className="settings-row-chevron">&rsaquo;</span>
              </button>
            )}
          </div>
        </div>

        {/* GROUP REMINDERS (superAdmin only — hidden until public) */}
        {isSuperAdmin && (
          <div className="settings-section">
            <div className="settings-section-title">Group Reminders</div>
            <div className="settings-group">
              <button className="settings-row" onClick={() => openView('broadcasts')}>
                <span className="settings-row-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 11-5.8-1.6"/></svg>
                </span>
                <span className="settings-row-content">
                  <span className="settings-row-label">Reminder Broadcasts</span>
                  <span className="settings-row-detail">One-way text reminders to a group</span>
                </span>
                <span className="settings-row-right">
                  <span className="new-badge">NEW</span>
                  <span className="settings-row-chevron">&rsaquo;</span>
                </span>
              </button>
            </div>
          </div>
        )}

        {/* VACATION */}
        <div className="settings-section">
          <div className="settings-section-title">Vacation</div>
          <div className="settings-group">
            <button className="settings-row" onClick={() => openView('vacation')}>
              <span className="settings-row-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              </span>
              <span className="settings-row-content">
                <span className="settings-row-label">Set Vacation</span>
                <span className="settings-row-detail">{(() => {
                  const vs = userProfile?.vacationStart?.toDate?.() || (userProfile?.vacationStart?.seconds ? new Date(userProfile.vacationStart.seconds * 1000) : null);
                  const ve = userProfile?.vacationEnd?.toDate?.() || (userProfile?.vacationEnd?.seconds ? new Date(userProfile.vacationEnd.seconds * 1000) : null);
                  if (vs && ve) {
                    const now = new Date();
                    const active = now >= vs && now <= ve;
                    return active
                      ? `On vacation until ${ve.toLocaleDateString()}`
                      : `Upcoming: ${vs.toLocaleDateString()} — ${ve.toLocaleDateString()}`;
                  }
                  return 'Pause streaks & reminders';
                })()}</span>
              </span>
              <span className="settings-row-right">
                {(() => {
                  const vs = userProfile?.vacationStart?.toDate?.() || (userProfile?.vacationStart?.seconds ? new Date(userProfile.vacationStart.seconds * 1000) : null);
                  const ve = userProfile?.vacationEnd?.toDate?.() || (userProfile?.vacationEnd?.seconds ? new Date(userProfile.vacationEnd.seconds * 1000) : null);
                  if (vs && ve) {
                    const active = new Date() >= vs && new Date() <= ve;
                    return <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', background: active ? '#c6f6d5' : '#bee3f8', color: active ? '#276749' : '#2a4365', fontWeight: 600 }}>{active ? 'Active' : 'Scheduled'}</span>;
                  }
                  return <span className="new-badge">NEW</span>;
                })()}
                <span className="settings-row-chevron">&rsaquo;</span>
              </span>
            </button>
          </div>
        </div>

        {/* DATA */}
        <div className="settings-section">
          <div className="settings-section-title">Data</div>
          <div className="settings-group">
            <button className="settings-row" onClick={() => openView('download')}>
              <span className="settings-row-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              </span>
              <span className="settings-row-content">
                <span className="settings-row-label">Download My Data</span>
                <span className="settings-row-detail">Export as PDF</span>
              </span>
              <span className="settings-row-chevron">&rsaquo;</span>
            </button>
          </div>
        </div>

        {/* SUPPORT */}
        <div className="settings-section">
          <div className="settings-section-title">Support</div>
          <div className="settings-group">
            <button className="settings-row" onClick={() => openView('feedback')}>
              <span className="settings-row-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
              </span>
              <span className="settings-row-content">
                <span className="settings-row-label">Send Feedback</span>
                <span className="settings-row-detail">Bug reports & feature requests</span>
              </span>
              <span className="settings-row-right">
                <span className="new-badge">NEW</span>
                <span className="settings-row-chevron">&rsaquo;</span>
              </span>
            </button>
            <button className="settings-row" onClick={() => navigate('/help')}>
              <span className="settings-row-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              </span>
              <span className="settings-row-content">
                <span className="settings-row-label">Help</span>
                <span className="settings-row-detail">How to use the app</span>
              </span>
              <span className="settings-row-chevron">&rsaquo;</span>
            </button>
            <button className="settings-row" onClick={() => navigate('/tos')}>
              <span className="settings-row-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              </span>
              <span className="settings-row-content">
                <span className="settings-row-label">Terms of Service</span>
              </span>
              <span className="settings-row-chevron">&rsaquo;</span>
            </button>
            <button className="settings-row" onClick={() => navigate('/privacy')}>
              <span className="settings-row-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </span>
              <span className="settings-row-content">
                <span className="settings-row-label">Privacy Policy</span>
              </span>
              <span className="settings-row-chevron">&rsaquo;</span>
            </button>
          </div>
        </div>

        {/* PRIVACY & SAFETY NOTICE */}
        <div className="settings-section">
          <div className="settings-section-title">Privacy &amp; Safety</div>
          <div className="settings-group">
            <div className="settings-row settings-row-static" style={{ display: 'block' }}>
              <p style={{ margin: '0 0 8px', fontSize: '0.9rem', lineHeight: 1.5 }}>
                This app is a <strong>free tool made by one person</strong> (a hobbyist), not a
                software company. We guard your information as best we can, but no app is ever
                perfectly secure.
              </p>
              <p style={{ margin: '0 0 8px', fontSize: '0.9rem', lineHeight: 1.5 }}>
                <strong>Please don&apos;t enter anything you wouldn&apos;t want someone else to see.</strong>{' '}
                Keep sensitive struggles general — the category is enough. No graphic detail or names needed.
              </p>
              <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.5 }}>
                You can use a <strong>first name or nickname</strong> — you don&apos;t have to use your
                real full name. Sharing less protects you.
              </p>
            </div>
          </div>
        </div>

        {/* ABOUT */}
        <div className="settings-section">
          <div className="settings-section-title">About</div>
          <div className="settings-group">
            <div className="settings-row settings-row-static">
              <span className="settings-row-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              </span>
              <span className="settings-row-content">
                <span className="settings-row-label">Counseling Homework</span>
                <span className="settings-row-detail">v{APP_VERSION} Beta</span>
                <span className="settings-row-detail">A division of Dorsett Group Realty</span>
              </span>
            </div>
          </div>
        </div>

        {isSuperAdmin && (
          <div className="settings-section">
            <div className="settings-section-title">Admin</div>
            <div className="settings-group">
              <button className="settings-row" onClick={() => openView('admin')}>
                <span className="settings-row-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                </span>
                <span className="settings-row-content">
                  <span className="settings-row-label">Super Admin</span>
                  <span className="settings-row-detail">User management & invites</span>
                </span>
                <span className="settings-row-chevron">&rsaquo;</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
