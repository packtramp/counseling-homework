import { useState, useEffect } from 'react';
import { auth } from '../config/firebase';
import { updateProfile, updateEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import ProfilePhoto from './ProfilePhoto';

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
  const [emailReminders, setEmailReminders] = useState(userProfile?.emailReminders ?? false);

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

  // Sync state when userProfile prop changes (e.g., when modal reopens)
  useEffect(() => {
    console.log('AccountSettings: userProfile changed', {
      phone: userProfile?.phone,
      smsReminders: userProfile?.smsReminders,
      emailReminders: userProfile?.emailReminders,
      reminderSchedule: userProfile?.reminderSchedule
    });
    setName(userProfile?.name || '');
    setPhone(userProfile?.phone || '');
    setSmsReminders(userProfile?.smsReminders ?? false);
    setEmailReminders(userProfile?.emailReminders ?? false);
    setReminderSchedule(userProfile?.reminderSchedule || defaultSchedule);
  }, [userProfile?.phone, userProfile?.smsReminders, userProfile?.emailReminders, userProfile?.reminderSchedule]);

  // Parse user-typed time into HH:MM format
  const parseTime = (input) => {
    if (!input || input.trim() === '') return '';
    const str = input.trim().toLowerCase();

    // Try to match various formats: "3:35pm", "3:35 pm", "15:35", "3pm", "3 pm"
    const match = str.match(/^(\d{1,2}):?(\d{2})?\s*(am|pm|a|p)?$/i);
    if (!match) return input; // Return as-is if can't parse

    let hours = parseInt(match[1], 10);
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    const period = match[3]?.toLowerCase();

    // Handle AM/PM
    if (period === 'pm' || period === 'p') {
      if (hours < 12) hours += 12;
    } else if (period === 'am' || period === 'a') {
      if (hours === 12) hours = 0;
    }

    // Validate
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return input;

    return hours.toString().padStart(2, '0') + ':' + minutes.toString().padStart(2, '0');
  };

  // Format HH:MM to display format like "3:35 PM"
  const formatTimeDisplay = (value) => {
    if (!value) return '';
    const match = value.match(/^(\d{2}):(\d{2})$/);
    if (!match) return value;
    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return minutes === '00' ? `${hours} ${ampm}` : `${hours}:${minutes} ${ampm}`;
  };

  const updateSlot = (day, slot, value) => {
    setReminderSchedule(prev => ({
      ...prev,
      [day]: { ...prev[day], [slot]: value }
    }));
  };

  const handleTimeBlur = (day, slot, value) => {
    const parsed = parseTime(value);
    updateSlot(day, slot, parsed);
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
          {role === 'counselee' && (
            <button
              className={`settings-tab ${activeTab === 'reminders' ? 'active' : ''}`}
              onClick={() => setActiveTab('reminders')}
            >
              Reminders
            </button>
          )}
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

          {activeTab === 'reminders' && role === 'counselee' && (
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
                  <span>SMS reminders</span>
                </label>
                <small className="form-hint">Reply STOP to unsubscribe. Text START to (256) 666-5595 to re-enable.</small>
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
                      <input
                        type="text"
                        placeholder="9am"
                        value={formatTimeDisplay(reminderSchedule[day]?.slot1)}
                        onChange={e => updateSlot(day, 'slot1', e.target.value)}
                        onBlur={e => handleTimeBlur(day, 'slot1', e.target.value)}
                      />
                      <input
                        type="text"
                        placeholder="—"
                        value={formatTimeDisplay(reminderSchedule[day]?.slot2)}
                        onChange={e => updateSlot(day, 'slot2', e.target.value)}
                        onBlur={e => handleTimeBlur(day, 'slot2', e.target.value)}
                      />
                      <input
                        type="text"
                        placeholder="—"
                        value={formatTimeDisplay(reminderSchedule[day]?.slot3)}
                        onChange={e => updateSlot(day, 'slot3', e.target.value)}
                        onBlur={e => handleTimeBlur(day, 'slot3', e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <button type="submit" className="save-btn" disabled={saving}>
                {saving ? 'Saving...' : 'Save Preferences'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
