import { useState, useCallback, useMemo } from 'react';
import { db } from '../config/firebase';
import { collection, addDoc, updateDoc, doc, serverTimestamp, Timestamp } from 'firebase/firestore';

/**
 * PrayerRequestPage - Full-page prayer request add/edit form
 *
 * Props:
 * - user: { uid } - current authenticated user
 * - userProfile: { name, ... } - current user's profile
 * - accountabilityPartners: [{ uid, name, email }] - owner's APs (for audience selection)
 * - editingPR: object|null - existing PR to edit (null = new)
 * - onClose: () => void
 * - onSaved: () => void
 * - getAuthToken: () => Promise<string>
 */
export default function PrayerRequestPage({
  user,
  userProfile,
  accountabilityPartners = [],
  editingPR = null,
  onClose,
  onSaved,
  getAuthToken
}) {
  const [formText, setFormText] = useState(editingPR?.text || '');
  const [formExpiry, setFormExpiry] = useState(() => {
    if (editingPR?.expiresAt) {
      const expDate = editingPR.expiresAt.toDate ? editingPR.expiresAt.toDate() : new Date(editingPR.expiresAt);
      return expDate.toISOString().split('T')[0];
    }
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });
  const [formOutcome, setFormOutcome] = useState(editingPR?.outcome || '');
  const [saving, setSaving] = useState(false);

  // Dedup APs by uid (defensive) — and sort by name for stable UI
  const apOptions = useMemo(() => {
    const seen = new Set();
    return (accountabilityPartners || [])
      .filter(ap => ap && ap.uid && !seen.has(ap.uid) && seen.add(ap.uid))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [accountabilityPartners]);

  // Selected AP uids — default: all checked on new; existing sharedWith on edit
  const [sharedWith, setSharedWith] = useState(() => {
    if (editingPR?.sharedWith && Array.isArray(editingPR.sharedWith)) {
      return new Set(editingPR.sharedWith);
    }
    // Default: all APs checked
    return new Set((accountabilityPartners || []).map(ap => ap.uid).filter(Boolean));
  });

  const toggleAP = (uid) => {
    setSharedWith(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const selectAll = () => setSharedWith(new Set(apOptions.map(ap => ap.uid)));
  const selectNone = () => setSharedWith(new Set());

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

  const selectedCount = sharedWith.size;
  const totalAPs = apOptions.length;

  const handleSave = useCallback(async () => {
    if (!formText.trim()) return;
    const trimmed = formText.trim().substring(0, 500);
    const sharedWithArr = Array.from(sharedWith);

    if (!editingPR) {
      let msg;
      if (selectedCount === 0) {
        msg = totalAPs === 0
          ? 'You are saving this prayer request. Only your counselor will see it (you have no accountability partners). Click OK to continue.'
          : 'You are saving this prayer request. You have NOT selected any accountability partners, so only your counselor will see it. Click OK to continue.';
      } else {
        msg = `You are saving this prayer request. ${selectedCount} accountability partner${selectedCount === 1 ? '' : 's'} + your counselor will get an email and pray for you. Click OK to continue or Cancel to stop.`;
      }
      const confirmed = window.confirm(msg);
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
          outcome: formOutcome.trim() || null,
          sharedWith: sharedWithArr
        });
      } else {
        await addDoc(collection(db, `users/${user.uid}/prayerRequests`), {
          text: trimmed,
          createdAt: serverTimestamp(),
          expiresAt: Timestamp.fromDate(expiryDate),
          outcome: null,
          ownerUid: user.uid,
          ownerName: userProfile?.name || 'Unknown',
          prayerCount: 0,
          sharedWith: sharedWithArr
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
              prayerText: trimmed,
              sharedWithUids: sharedWithArr
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
  }, [formText, formExpiry, formOutcome, editingPR, user?.uid, userProfile?.name, getAuthToken, onClose, onSaved, sharedWith, selectedCount, totalAPs]);

  return (
    <div className="pr-form-page">
      <div className="pr-form-header">
        <h2>{editingPR?.id ? 'Edit Prayer Request' : 'New Prayer Request'}</h2>
      </div>
      <main className="pr-form-content">
        <div className="pr-form-card">
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

          {/* Audience selection */}
          <label className="pr-form-label" style={{ marginTop: '1rem' }}>Share with</label>
          {totalAPs === 0 ? (
            <p className="pr-date-hint" style={{ marginTop: 0 }}>
              <em>You have no accountability partners yet. Only your counselor will see this prayer request.</em>
            </p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <button type="button" className="pr-ap-select-btn" onClick={selectAll}
                  style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1a202c', padding: '6px 12px', background: '#e2e8f0', border: '1px solid #a0aec0', borderRadius: '4px', cursor: 'pointer' }}>
                  Select all
                </button>
                <button type="button" className="pr-ap-select-btn" onClick={selectNone}
                  style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1a202c', padding: '6px 12px', background: '#e2e8f0', border: '1px solid #a0aec0', borderRadius: '4px', cursor: 'pointer' }}>
                  Select none
                </button>
                <span style={{ fontSize: '0.8rem', color: '#718096', alignSelf: 'center', marginLeft: 'auto' }}>
                  {selectedCount} of {totalAPs} selected
                </span>
              </div>
              <ul className="pr-ap-checklist" style={{ listStyle: 'none', padding: 0, margin: 0, border: '1px solid #e2e8f0', borderRadius: '6px', background: '#f7fafc' }}>
                {apOptions.map(ap => (
                  <li key={ap.uid} style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={sharedWith.has(ap.uid)}
                        onChange={() => toggleAP(ap.uid)}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      <span style={{ color: '#2d3748' }}>{ap.name || ap.email || 'Unknown'}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <span className="pr-date-hint">
                <em>Your counselor always sees your prayer requests. Uncheck APs you don't want to share with.</em>
              </span>
            </>
          )}

          {/* Inline action buttons (fallback so they're always reachable on long forms) */}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
            <button type="button" className="hj-footer-btn hj-back-btn" onClick={onClose} style={{ flex: 1 }}>
              Back
            </button>
            <button
              type="button"
              className="hj-footer-btn hj-submit-btn"
              onClick={handleSave}
              disabled={saving || !formText.trim() || !formExpiry}
              style={{ flex: 1 }}
            >
              {saving ? 'Saving...' : editingPR?.id ? 'Update' : 'Submit'}
            </button>
          </div>
        </div>
      </main>
      <footer className="hj-sticky-footer">
        <button type="button" className="hj-footer-btn hj-back-btn" onClick={onClose}>Back</button>
        <button
          type="button"
          className="hj-footer-btn hj-submit-btn"
          onClick={handleSave}
          disabled={saving || !formText.trim() || !formExpiry}
        >
          {saving ? 'Saving...' : editingPR?.id ? 'Update' : 'Submit'}
        </button>
      </footer>
    </div>
  );
}
