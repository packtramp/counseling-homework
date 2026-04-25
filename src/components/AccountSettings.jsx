import { useState, useEffect } from 'react';
import { auth } from '../config/firebase';
import { updateProfile, updateEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import ProfilePhoto from './ProfilePhoto';
import RichTextEditor from './RichTextEditor';
import { downloadCounseleeData } from '../utils/generatePDF';

/**
 * Account Settings Panel
 *
 * Props:
 * - isOpen: boolean - whether panel is visible
 * - onClose: () => void - close handler
 * - userProfile: object - user profile data (name, email, etc.)
 * - onUpdateProfile: (updates) => void - save profile updates to Firestore
 * - role: 'counselor' | 'counselee'
 */
export default function AccountSettings({ isOpen, onClose, userProfile, onUpdateProfile, role = 'counselee' }) {
  const [activeTab, setActiveTab] = useState('profile');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Profile form
  const [name, setName] = useState(userProfile?.name || '');
  const [email, setEmail] = useState(auth.currentUser?.email || '');

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Reminder preferences (counselee only)
  const [phone, setPhone] = useState(userProfile?.phone || '');
  const [smsReminders, setSmsReminders] = useState(userProfile?.smsReminders ?? false);
  const [emailReminders, setEmailReminders] = useState(userProfile?.emailReminders ?? true);

  // Per-day reminder schedule with 3 slots each
  const defaultSchedule = {
    monday: { slot1: '09:00', slot2: '', slot3: '' },
    tuesday: { slot1: '09:00', slot2: '', slot3: '' },
    wednesday: { slot1: '09:00', slot2: '', slot3: '' },
    thursday: { slot1: '09:00', slot2: '', slot3: '' },
    friday: { slot1: '09:00', slot2: '', slot3: '' },
    saturday: { slot1: '09:00', slot2: '', slot3: '' },
    sunday: { slot1: '09:00', slot2: '', slot3: '' }
  };
  const [reminderSchedule, setReminderSchedule] = useState(userProfile?.reminderSchedule || defaultSchedule);

  // Session template (counselor only)
  const [sessionTemplate, setSessionTemplate] = useState(userProfile?.sessionTemplate || '');

  // PDF download state
  const [downloading, setDownloading] = useState(false);

  // Sync state when userProfile prop changes (e.g., when modal reopens)
  useEffect(() => {
    setName(userProfile?.name || '');
    setPhone(userProfile?.phone || '');
    setSmsReminders(userProfile?.smsReminders ?? false);
    setEmailReminders(userProfile?.emailReminders ?? true);
    setReminderSchedule(userProfile?.reminderSchedule || defaultSchedule);
    setSessionTemplate(userProfile?.sessionTemplate || '');
  }, [userProfile?.phone, userProfile?.smsReminders, userProfile?.emailReminders, userProfile?.reminderSchedule, userProfile?.sessionTemplate]);

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

  // Snap any stored time to nearest 30-min increment
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

  const updateSlot = (day, slot, value) => {
    setReminderSchedule(prev => ({
      ...prev,
      [day]: { ...prev[day], [slot]: value }
    }));
  };

  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const dayLabels = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };

  if (!isOpen) return null;

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);

    try {
      // Update display name in Firebase Auth
      if (name !== userProfile?.name) {
        await updateProfile(auth.currentUser, { displayName: name });
      }

      // Update email in Firebase Auth (requires recent login)
      if (email !== auth.currentUser.email) {
        await updateEmail(auth.currentUser, email);
      }

      // Update profile in Firestore
      if (onUpdateProfile) {
        const updates = { name, email };
        if (role === 'counselor') {
          updates.phone = phone;
        }
        await onUpdateProfile(updates);
      }

      setSuccess('Profile updated successfully!');
    } catch (err) {
      console.error('Profile update error:', err);
      if (err.code === 'auth/requires-recent-login') {
        setError('Please sign out and sign back in to change your email.');
      } else {
        setError(err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setSaving(true);

    try {
      // Re-authenticate user first
      const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);

      // Update password
      await updatePassword(auth.currentUser, newPassword);

      setSuccess('Password updated successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      console.error('Password update error:', err);
      if (err.code === 'auth/wrong-password') {
        setError('Current password is incorrect.');
      } else {
        setError(err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Account Settings</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="settings-tabs">
          <button
            className={`settings-tab ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            Profile
          </button>
          <button
            className={`settings-tab ${activeTab === 'password' ? 'active' : ''}`}
            onClick={() => setActiveTab('password')}
          >
            Password
          </button>
          <button
            className={`settings-tab ${activeTab === 'reminders' ? 'active' : ''}`}
            onClick={() => setActiveTab('reminders')}
          >
            Reminders
          </button>
          {role === 'counselor' && (
            <button
              className={`settings-tab ${activeTab === 'template' ? 'active' : ''}`}
              onClick={() => setActiveTab('template')}
            >
              Session Template
            </button>
          )}
          <button
            className={`settings-tab ${activeTab === 'download' ? 'active' : ''}`}
            onClick={() => setActiveTab('download')}
          >
            My Data
          </button>
        </div>

        <div className="settings-content">
          {error && <div className="settings-error">{error}</div>}
          {success && <div className="settings-success">{success}</div>}

          {activeTab === 'profile' && (
            <form onSubmit={handleUpdateProfile}>
              {/* Photo upload for counselees */}
              {role === 'counselee' && userProfile?.counselorId && userProfile?.counseleeDocId && (
                <div className="form-group profile-photo-section">
                  <label>Profile Photo</label>
                  <ProfilePhoto
                    photoUrl={userProfile.counseleePhotoUrl}
                    counselorId={userProfile.counselorId}
                    counseleeId={userProfile.counseleeDocId}
                    onPhotoUpdate={(url, fieldName) => onUpdateProfile && onUpdateProfile({ [fieldName]: url })}
                    editable={true}
                    size="medium"
                    uploadedBy="counselee"
                  />
                </div>
              )}
              {/* Photo upload for counselors */}
              {role === 'counselor' && userProfile?.uid && (
                <div className="form-group profile-photo-section">
                  <label>Profile Photo</label>
                  <ProfilePhoto
                    photoUrl={userProfile.photoUrl}
                    counselorId={userProfile.uid}
                    onPhotoUpdate={(url) => onUpdateProfile && onUpdateProfile({ photoUrl: url })}
                    editable={true}
                    size="medium"
                    uploadedBy="counselor-self"
                  />
                </div>
              )}
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
              {/* Phone for counselors */}
              {role === 'counselor' && (
                <div className="form-group">
                  <label>Phone</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                  />
                  <small className="form-hint">Visible to your counselees</small>
                </div>
              )}
              <button type="submit" className="save-btn" disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          )}

          {activeTab === 'password' && (
            <form onSubmit={handleUpdatePassword}>
              <div className="form-group">
                <label>Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <div className="form-group">
                <label>Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <button type="submit" className="save-btn" disabled={saving}>
                {saving ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          )}

          {activeTab === 'reminders' && (
            <form onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              setSuccess(null);

              // Validation
              if (smsReminders && !phone.trim()) {
                setError('Phone number required for SMS reminders');
                return;
              }

              setSaving(true);
              try {
                if (onUpdateProfile) {
                  await onUpdateProfile({ phone, reminderSchedule, smsReminders, emailReminders });
                }
                setSuccess('Reminder preferences saved!');
              } catch (err) {
                setError(err.message);
              } finally {
                setSaving(false);
              }
            }}>
              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={emailReminders}
                    onChange={e => setEmailReminders(e.target.checked)}
                  />
                  <span>Email reminders</span>
                </label>
                <small className="form-hint">Sent to {auth.currentUser?.email}</small>
              </div>

              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={smsReminders}
                    onChange={e => setSmsReminders(e.target.checked)}
                  />
                  <span>I agree to receive reminder messages from Counseling Homework via text. Message frequency varies. Message and data rates may apply. Reply STOP to unsubscribe or HELP for assistance at any time.</span>
                </label>
              </div>

              {smsReminders && (
                <div className="form-group">
                  <label>Phone Number</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                    required
                  />
                  <small className="form-hint">Standard message rates may apply.</small>
                </div>
              )}

              <div className="form-group reminder-schedule">
                <label>Weekly Schedule</label>
                <small className="form-hint" style={{ marginBottom: '8px', display: 'block' }}>
                  Set up to 3 reminder times per day. Slot 1 is your main reminder.
                  Slots 2-3 are for Think Lists (3x/day) or follow-up reminders.
                </small>
                <div className="schedule-grid">
                  <div className="schedule-header">
                    <span></span>
                    <span>Main</span>
                    <span>+2</span>
                    <span>+3</span>
                  </div>
                  {days.map(day => (
                    <div key={day} className="schedule-row">
                      <span className="day-label">{dayLabels[day]}</span>
                      {['slot1', 'slot2', 'slot3'].map(slot => (
                        <select
                          key={slot}
                          value={snapTo30(reminderSchedule[day]?.[slot])}
                          onChange={e => updateSlot(day, slot, e.target.value)}
                        >
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
          )}

          {activeTab === 'template' && role === 'counselor' && (
            <form onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              setSuccess(null);
              setSaving(true);
              try {
                if (onUpdateProfile) {
                  await onUpdateProfile({ sessionTemplate });
                }
                setSuccess('Session template saved!');
              } catch (err) {
                setError(err.message);
              } finally {
                setSaving(false);
              }
            }}>
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
              <button type="submit" className="save-btn" disabled={saving}>
                {saving ? 'Saving...' : 'Save Template'}
              </button>
            </form>
          )}

          {activeTab === 'download' && (
            <div>
              <p style={{ fontSize: '0.9rem', color: '#4a5568', marginBottom: 16, lineHeight: 1.5 }}>
                Download all your counseling data as a PDF file including homework, journals, think lists, heart journal entries, and activity history.
              </p>
              <button
                className="save-btn"
                disabled={downloading}
                onClick={async () => {
                  setError(null);
                  setDownloading(true);
                  try {
                    const cId = userProfile?.counselorId || userProfile?.uid;
                    const cDocId = userProfile?.counseleeDocId || userProfile?.uid;
                    await downloadCounseleeData(cId, cDocId, userProfile?.name || 'Unknown');
                    setSuccess('PDF downloaded!');
                  } catch (err) {
                    console.error('PDF generation error:', err);
                    setError('PDF error: ' + (err.message || String(err)));
                  } finally {
                    setDownloading(false);
                  }
                }}
              >
                {downloading ? 'Generating PDF...' : 'Download My Data'}
              </button>
            </div>
          )}
        </div>

        <div style={{ padding: '8px 16px 12px', borderTop: '1px solid #e2e8f0', textAlign: 'center' }}>
          <a href="/help" target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem', color: '#718096', marginRight: 12 }}>Help</a>
          <a href="/tos" target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem', color: '#718096', marginRight: 12 }}>Terms of Service</a>
          <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem', color: '#718096' }}>Privacy Policy</a>
        </div>
      </div>
    </div>
  );
}
