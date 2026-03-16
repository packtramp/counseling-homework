import { useState, useEffect, useCallback } from 'react';
import { db } from '../config/firebase';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, Timestamp, getDocs, orderBy, increment } from 'firebase/firestore';
// Note: addDoc, updateDoc, serverTimestamp used by handlePrayed; form CRUD moved to PrayerRequestPage

/**
 * Prayer Requests Tile - displays and manages prayer requests
 *
 * Props:
 * - user: { uid } - current authenticated user
 * - userProfile: { name, counselorId, ... } - current user's profile
 * - role: 'counselee' | 'counselor' | 'accountability' - viewing context
 * - isCounselor: boolean - is the current user a counselor
 * - watchingUsers: array - people whose data I can see (their PRs show in AP section)
 * - counseleeUids: array - UIDs of my counselees (counselor only, their PRs show in Counselee section)
 * - targetUid: string|null - if viewing someone else's PRs (AP/counselor detail view), their UID
 * - targetName: string|null - name of the person whose detail view we're in
 * - onPrayerCountUpdate: (count) => void - callback to update prayer counter in dashboard header
 * - getAuthToken: () => Promise<string> - function to get Firebase auth token
 * - onAdd: () => void - callback to open full-page add form (dashboard manages overlay)
 * - onEdit: (pr) => void - callback to open full-page edit form (dashboard manages overlay)
 */
export default function PrayerRequestsTile({
  user,
  userProfile,
  role = 'counselee',
  isCounselor = false,
  watchingUsers = [],
  counseleeUids = [],
  targetUid = null,
  targetName = null,
  onPrayerCountUpdate,
  getAuthToken,
  onAdd,
  onEdit
}) {
  const isOwnerView = !targetUid; // Am I viewing my own dashboard?
  const canAdd = isOwnerView; // Only add PRs on your own dashboard

  // State
  const [myPrayerRequests, setMyPrayerRequests] = useState([]);
  const [apPrayerRequests, setApPrayerRequests] = useState([]); // PRs from people I watch (AP)
  const [counseleePrayerRequests, setCounseleePrayerRequests] = useState([]); // PRs from my counselees
  const [prayedRecently, setPrayedRecently] = useState(() => {
    // Restore cooldowns from localStorage (1-hour per PR)
    try {
      const stored = JSON.parse(localStorage.getItem('prayedCooldowns') || '{}');
      const now = Date.now();
      const active = {};
      for (const [prId, ts] of Object.entries(stored)) {
        if (now - ts < 3600000) active[prId] = true;
      }
      return active;
    } catch { return {}; }
  });

  const now = new Date();

  // Helper: format date
  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };


  // ── Listeners ──

  // Listen to MY prayer requests
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, `users/${user.uid}/prayerRequests`),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      // Client-side filter for expiry (avoids composite index requirement)
      const now = new Date();
      const active = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(pr => {
          if (!pr.expiresAt) return true;
          const exp = pr.expiresAt.toDate ? pr.expiresAt.toDate() : new Date(pr.expiresAt);
          return exp > now;
        });
      setMyPrayerRequests(active);
    }, (err) => console.error('PR listener error:', err));
    return unsub;
  }, [user?.uid]);

  // Listen to AP prayer requests (people I watch)
  useEffect(() => {
    if (!isOwnerView || watchingUsers.length === 0) {
      setApPrayerRequests([]);
      return;
    }
    const unsubs = watchingUsers.map(person => {
      if (!person.uid) return null;
      const q = query(
        collection(db, `users/${person.uid}/prayerRequests`),
        orderBy('createdAt', 'desc')
      );
      return onSnapshot(q, (snap) => {
        const nowDate = new Date();
        const prs = snap.docs
          .map(d => ({ id: d.id, ownerUid: person.uid, ownerName: person.name, ...d.data() }))
          .filter(pr => {
            if (!pr.expiresAt) return true;
            const exp = pr.expiresAt.toDate ? pr.expiresAt.toDate() : new Date(pr.expiresAt);
            return exp > nowDate;
          });
        setApPrayerRequests(prev => {
          const filtered = prev.filter(p => p.ownerUid !== person.uid);
          return [...filtered, ...prs];
        });
      }, (err) => console.error('AP PR listener error:', err));
    }).filter(Boolean);
    return () => unsubs.forEach(u => u());
  }, [isOwnerView, watchingUsers]);

  // Listen to target user's prayer requests (when viewing AP/counselee detail)
  useEffect(() => {
    if (!targetUid) return;
    const q = query(
      collection(db, `users/${targetUid}/prayerRequests`),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const nowDate = new Date();
      const prs = snap.docs
        .map(d => ({ id: d.id, ownerUid: targetUid, ownerName: targetName, ...d.data() }))
        .filter(pr => {
          if (!pr.expiresAt) return true;
          const exp = pr.expiresAt.toDate ? pr.expiresAt.toDate() : new Date(pr.expiresAt);
          return exp > nowDate;
        });
      setApPrayerRequests(prs);
    }, (err) => console.error('Target PR listener error:', err));
    return unsub;
  }, [targetUid, targetName]);

  // Listen to counselee prayer requests (counselor only, own dashboard)
  useEffect(() => {
    if (!isOwnerView || !isCounselor || counseleeUids.length === 0) {
      setCounseleePrayerRequests([]);
      return;
    }
    const unsubs = counseleeUids.map(({ uid, name }) => {
      if (!uid) return null;
      const q = query(
        collection(db, `users/${uid}/prayerRequests`),
        orderBy('createdAt', 'desc')
      );
      return onSnapshot(q, (snap) => {
        const nowDate = new Date();
        const prs = snap.docs
          .map(d => ({ id: d.id, ownerUid: uid, ownerName: name, ...d.data() }))
          .filter(pr => {
            if (!pr.expiresAt) return true;
            const exp = pr.expiresAt.toDate ? pr.expiresAt.toDate() : new Date(pr.expiresAt);
            return exp > nowDate;
          });
        setCounseleePrayerRequests(prev => {
          const filtered = prev.filter(p => p.ownerUid !== uid);
          return [...filtered, ...prs];
        });
      }, (err) => console.error('Counselee PR listener error:', err));
    }).filter(Boolean);
    return () => unsubs.forEach(u => u());
  }, [isOwnerView, isCounselor, counseleeUids]);

  // Update prayer count for dashboard header
  useEffect(() => {
    if (!onPrayerCountUpdate) return;
    const totalPrayers = myPrayerRequests.reduce((sum, pr) => sum + (pr.prayerCount || 0), 0);
    onPrayerCountUpdate(totalPrayers);
  }, [myPrayerRequests, onPrayerCountUpdate]);

  // ── Actions ──

  const handleDelete = useCallback(async (pr) => {
    if (!window.confirm('Delete this prayer request? This cannot be undone.')) return;
    try {
      await deleteDoc(doc(db, `users/${user.uid}/prayerRequests/${pr.id}`));
    } catch (err) {
      console.error('Failed to delete prayer request:', err);
      alert('Failed to delete. Please try again.');
    }
  }, [user?.uid]);

  const handlePrayed = useCallback(async (pr) => {
    if (!user?.uid || !pr.ownerUid || prayedRecently[pr.id]) return;

    // Client-side cooldown check (avoids composite index on prayers subcollection)
    try {
      const prayersRef = collection(db, `users/${pr.ownerUid}/prayerRequests/${pr.id}/prayers`);

      // Record prayer
      await addDoc(prayersRef, {
        prayerUid: user.uid,
        prayerName: userProfile?.name || 'Someone',
        prayedAt: serverTimestamp()
      });

      // Increment prayer count on PR doc
      await updateDoc(doc(db, `users/${pr.ownerUid}/prayerRequests/${pr.id}`), {
        prayerCount: increment(1)
      });

      // Visual feedback + 1-hour cooldown via localStorage
      setPrayedRecently(prev => ({ ...prev, [pr.id]: true }));
      try {
        const stored = JSON.parse(localStorage.getItem('prayedCooldowns') || '{}');
        stored[pr.id] = Date.now();
        localStorage.setItem('prayedCooldowns', JSON.stringify(stored));
      } catch { /* localStorage unavailable */ }

      // Send email (max 1/day handled server-side)
      try {
        const token = await getAuthToken();
        await fetch('/api/send-encouragement', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            type: 'prayer-prayed',
            senderUid: user.uid,
            senderName: userProfile?.name || 'Someone',
            recipientUid: pr.ownerUid,
            prayerText: pr.text?.substring(0, 100)
          })
        });
      } catch (emailErr) {
        console.error('Failed to send prayed notification:', emailErr);
      }
    } catch (err) {
      console.error('Failed to record prayer:', err);
      alert('Unable to record prayer. Please try again.');
    }
  }, [user?.uid, userProfile?.name, prayedRecently, getAuthToken]);

  // ── Render helpers ──

  const renderPRItem = (pr, showOwner, showActions) => (
    <li key={`${pr.ownerUid}-${pr.id}`} className="pr-item">
      <div className="pr-item-content">
        {showOwner && <span className="pr-owner">{pr.ownerName || 'Unknown'}</span>}
        {showOwner && <span className="pr-separator"> - </span>}
        <span className="pr-text">{pr.text?.substring(0, 120)}{pr.text?.length > 120 ? '...' : ''}</span>
      </div>
      <div className="pr-item-actions">
        {showActions === 'pray' && (
          <button
            className={`pr-prayed-btn ${prayedRecently[pr.id] ? 'pr-prayed-active' : ''}`}
            onClick={(e) => { e.stopPropagation(); handlePrayed(pr); }}
            title="I prayed for this"
          >
            {prayedRecently[pr.id] ? '✓ Prayed!' : '🙏 Pray'}
          </button>
        )}
        {showActions === 'edit' && (
          <>
            <span className="pr-date">{formatDate(pr.createdAt)}</span>
            <button className="pr-edit-btn" onClick={() => onEdit && onEdit(pr)} title="Edit">✏️</button>
            <button className="pr-delete-btn" onClick={() => handleDelete(pr)} title="Delete">🗑️</button>
          </>
        )}
      </div>
    </li>
  );

  // ── Main Tile Render ──

  // If viewing someone else's detail, just show their PRs with prayed buttons
  if (targetUid) {
    const targetPRs = apPrayerRequests.filter(p => p.ownerUid === targetUid);
    return (
      <div className="pr-tile">
        <div className="pr-tile-header">
          <span className="pr-tile-title">Prayer Requests ({targetPRs.length})</span>
        </div>
        <div className="pr-tile-content">
          {targetPRs.length === 0 ? (
            <p className="empty-list">No active prayer requests.</p>
          ) : (
            <ul className="pr-list">
              {targetPRs.map(pr => renderPRItem(pr, false, 'pray'))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // Owner view: show all three sections
  const totalCount = apPrayerRequests.length + counseleePrayerRequests.length + myPrayerRequests.length;

  return (
    <div className="pr-tile">
      <div className="pr-tile-header">
        <span className="pr-tile-title">Prayer Requests ({totalCount})</span>
        {canAdd && onAdd && (
          <button className="pr-add-btn" onClick={onAdd} title="New Prayer Request">
            <span className="pr-add-icon" role="img" aria-label="prayer">🙏</span>
          </button>
        )}
      </div>
      <div className="pr-tile-content">
        {totalCount === 0 ? (
          <p className="empty-list">No active prayer requests.</p>
        ) : (
          <>
            {/* AP Prayer Requests */}
            {apPrayerRequests.length > 0 && (
              <div className="pr-section">
                <div className="pr-section-heading">AP Prayer Requests</div>
                <ul className="pr-list">
                  {apPrayerRequests.map(pr => renderPRItem(pr, true, 'pray'))}
                </ul>
              </div>
            )}

            {/* Counselee Prayer Requests (counselors only) */}
            {isCounselor && counseleePrayerRequests.length > 0 && (
              <div className="pr-section">
                <div className="pr-section-heading">Counselee Prayer Requests</div>
                <ul className="pr-list">
                  {counseleePrayerRequests.map(pr => renderPRItem(pr, true, 'pray'))}
                </ul>
              </div>
            )}

            {/* My Prayer Requests */}
            {myPrayerRequests.length > 0 && (
              <div className="pr-section">
                <div className="pr-section-heading">My Prayer Requests</div>
                <ul className="pr-list">
                  {myPrayerRequests.map(pr => renderPRItem(pr, false, 'edit'))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
