import { useState, useCallback } from 'react';
import { db } from '../config/firebase';
import { collection, addDoc, updateDoc, doc, serverTimestamp, Timestamp } from 'firebase/firestore';

/**
 * PrayerRequestPage - Full-page prayer request add/edit form
 *
 * Props:
 * - user: { uid } - current authenticated user
 * - userProfile: { name, ... } - current user's profile
 * - editingPR: object|null - existing PR to edit (null = new)
 * - onClose: () => void - called when closing/cancelling
 * - onSaved: () => void - called after successful save
 * - getAuthToken: () => Promise<string> - function to get Firebase auth token
 */
export default function PrayerRequestPage({ user, userProfile, editingPR = null, onClose, onSaved, getAuthToken }) {
  const [formText, setFormText] = useState(editingPR?.text || '');
  const [formExpiry, setFormExpiry] = useState(() => {
    if (editingPR?.expiresAt) {
      const expDate = editingPR.expiresAt.toDate ? editingPR.expiresAt.toDate() : new Date(editingPR.expiresAt);
      return expDate.toISOString().split('T')[0];
    }
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().split('T')[0];
  });
  const [formOutcome, setFormOutcome] = useState(editingPR?.outcome || '');
  const [saving, setSaving] = useState(false);

  const getMinExpiry = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  };

  const getMaxExpiry = () => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().split('T')[0];
  };

  const handleSave = useCallback(async () => {
    if (!formText.trim()) return;
    const trimmed = formText.trim().substring(0, 500);

    if (!editingPR) {
      const confirmed = window.confirm(
        'You are saving this prayer request. All your APs will get an email and pray for you. Click OK to continue or Cancel to stop.'
      );
      if (!confirmed) return;
    }

    setSaving(true);
    try {
      const expiryDate = new Date(formExpiry);
      expiryDate.setHours(23, 59, 59, 999);

      if (editingPR?.id) {
        await updateDoc(doc(db, `users/${user.uid}/prayerRequests/${editingPR.id}`), {
          text: trimmed,
          expiresAt: Timestamp.fromDate(expiryDate),
          outcome: formOutcome.trim() || null
        });
      } else {
        await addDoc(collection(db, `users/${user.uid}/prayerRequests`), {
          text: trimmed,
          createdAt: serverTimestamp(),
          expiresAt: Timestamp.fromDate(expiryDate),
          outcome: null,
          ownerUid: user.uid,
          ownerName: userProfile?.name || 'Unknown',
          prayerCount: 0
        });

        try {
          const token = await getAuthToken();
          await fetch('/api/send-encouragement', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
              type: 'prayer-new',
              senderUid: user.uid,
              senderName: userProfile?.name || 'Someone',
              prayerText: trimmed
            })
          });
        } catch (emailErr) {
          console.error('Failed to send prayer notification emails:', emailErr);
        }
      }
      onSaved?.();
      onClose();
    } catch (err) {
      console.error('Failed to save prayer request:', err);
      alert('Failed to save prayer request. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [formText, formExpiry, formOutcome, editingPR, user?.uid, userProfile?.name, getAuthToken, onClose, onSaved]);

  return (
    <div className="pr-form-page">
      <div className="pr-form-header">
        <button className="pr-back-btn" onClick={onClose}>← Back</button>
        <h2>{editingPR?.id ? 'Edit Prayer Request' : 'New Prayer Request'}</h2>
      </div>
      <div className="pr-form-body">
        <label className="pr-form-label">Prayer Request</label>
        <textarea
          className="pr-form-textarea"
          value={formText}
          onChange={(e) => setFormText(e.target.value.substring(0, 500))}
          placeholder="What would you like prayer for?"
          rows={5}
          maxLength={500}
        />
        <span className="pr-char-count">{formText.length}/500</span>

        <label className="pr-form-label">Please pray through</label>
        <input
          type="date"
          className="pr-form-date"
          value={formExpiry}
          min={getMinExpiry()}
          max={getMaxExpiry()}
          onChange={(e) => setFormExpiry(e.target.value)}
        />
        <span className="pr-date-hint"><em>Prayer requests can be set up to 1 month out to keep things fresh. You can always edit and extend for another month.</em></span>

        {editingPR?.id && (
          <>
            <label className="pr-form-label">Outcome (optional)</label>
            <textarea
              className="pr-form-textarea pr-form-outcome"
              value={formOutcome}
              onChange={(e) => setFormOutcome(e.target.value.substring(0, 500))}
              placeholder="What happened? How did God answer?"
              rows={3}
              maxLength={500}
            />
          </>
        )}

        <div className="pr-form-buttons">
          <button className="pr-cancel-btn" onClick={onClose}>Cancel</button>
          <button
            className="pr-save-btn"
            onClick={handleSave}
            disabled={saving || !formText.trim() || !formExpiry}
          >
            {saving ? 'Saving...' : editingPR?.id ? 'Update' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}
