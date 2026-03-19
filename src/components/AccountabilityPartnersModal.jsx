import { useState, useEffect } from 'react';
import { db, auth } from '../config/firebase';
import { collection, query, where, getDocs, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import ProfilePhoto from './ProfilePhoto';

/**
 * Accountability Partners Modal - manage accountability relationships
 * Note: "You Can View" section has been moved to dashboard tiles
 *
 * Props:
 * - isOpen: boolean
 * - onClose: () => void
 * - myPartners: array - people who can view my data (I added them)
 * - onAddPartner: (partnerData) => void
 * - onRemovePartner: (partnerUid) => void
 * - currentUserUid: string
 */
export default function AccountabilityPartnersModal({
  isOpen,
  onClose,
  myPartners = [],
  onAddPartner,
  onRemovePartner,
  currentUserUid,
  currentUserName,
  myCounselorId,
  defaultTab = 'view'
}) {
  const [activeTab, setActiveTab] = useState(defaultTab); // 'view' | 'add'
  useEffect(() => { if (isOpen) setActiveTab(defaultTab); }, [isOpen, defaultTab]);
  const [searchEmail, setSearchEmail] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [success, setSuccess] = useState('');
  // Invite flow state (when user not found)
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviting, setInviting] = useState(false);

  if (!isOpen) return null;

  const handleSearch = async () => {
    if (!searchEmail || !searchEmail.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setError('');
    setSearchResult(null);
    setSuccess('');
    setSearching(true);

    try {
      const emailLower = searchEmail.toLowerCase().trim();

      // Search users collection by email (lowercase)
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', emailLower));
      let snapshot = await getDocs(q);

      // If not found, try original case (for legacy data)
      if (snapshot.empty) {
        const qOriginal = query(usersRef, where('email', '==', searchEmail.trim()));
        snapshot = await getDocs(qOriginal);
      }

      // If still not found, check counseleeLinks
      if (snapshot.empty) {
        const emailKey = emailLower.replace(/[.]/g, '_');
        const linkDoc = await getDoc(doc(db, 'counseleeLinks', emailKey));
        if (linkDoc.exists()) {
          const linkData = linkDoc.data();
          const counseleeDoc = await getDoc(doc(db, `counselors/${linkData.counselorId}/counselees/${linkData.counseleeDocId}`));
          if (counseleeDoc.exists() && counseleeDoc.data().uid) {
            const userDocRef = await getDoc(doc(db, 'users', counseleeDoc.data().uid));
            if (userDocRef.exists()) {
              snapshot = { empty: false, docs: [userDocRef] };
            }
          }
        }
      }

      if (snapshot.empty) {
        // User not found - show invite form
        setShowInviteForm(true);
        setInviteName('');
        setInvitePhone('');
        return;
      }

      // User found - hide invite form
      setShowInviteForm(false);

      const userDoc = snapshot.docs ? snapshot.docs[0] : snapshot;
      const userData = userDoc.data();

      if (userDoc.id === currentUserUid) {
        setError("You can't add yourself as an accountability partner");
        return;
      }

      if (myPartners.some(p => p.uid === userDoc.id)) {
        setError('This person is already your accountability partner');
        return;
      }

      // Block counselor-counselee pairing
      if (myCounselorId === userDoc.id || userData.counselorId === currentUserUid) {
        setError('You cannot add your counselor or counselee as an accountability partner. That relationship already provides data access.');
        return;
      }

      setSearchResult({
        uid: userDoc.id,
        name: userData.name || 'Unknown',
        email: userData.email
      });
    } catch (err) {
      console.error('Search error:', err);
      setError('Error searching for user. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  const handleAdd = async () => {
    if (!searchResult) return;

    setAdding(true);
    setError('');

    try {
      await onAddPartner(searchResult);
      setSuccess(`${searchResult.name} added!`);
      setSearchResult(null);
      setSearchEmail('');
      setTimeout(() => {
        setActiveTab('view');
        setSuccess('');
      }, 1500);
    } catch (err) {
      setError(err.message || 'Failed to add accountability partner');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (partnerUid, partnerName) => {
    if (!window.confirm(`Remove ${partnerName} as your accountability partner?`)) return;
    try {
      await onRemovePartner(partnerUid);
    } catch (err) {
      setError(err.message || 'Failed to remove partner');
    }
  };

  const handleInvite = async () => {
    if (!searchEmail) return;

    setInviting(true);
    setError('');

    try {
      const idToken = await auth.currentUser.getIdToken();
      const response = await fetch('/api/send-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({
          email: searchEmail.toLowerCase().trim(),
          name: inviteName.trim() || null,
          phone: invitePhone.trim() || null,
          inviterName: currentUserName || 'Someone',
          inviterUid: currentUserUid
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to send invite');

      // Store pending invite in Firestore for auto-linking on signup
      const emailKey = searchEmail.toLowerCase().trim().replace(/[.]/g, '_');
      await setDoc(doc(db, 'pendingInvites', emailKey), {
        inviterUid: currentUserUid,
        inviterName: currentUserName || 'Someone',
        invitedEmail: searchEmail.toLowerCase().trim(),
        invitedName: inviteName.trim() || null,
        createdAt: serverTimestamp()
      });

      setSuccess('Invite sent! They will receive an email' + (invitePhone ? ' and text message' : '') + '.');
      setShowInviteForm(false);
      setSearchEmail('');
      setInviteName('');
      setInvitePhone('');
    } catch (err) {
      setError(err.message || 'Failed to send invite');
    } finally {
      setInviting(false);
    }
  };

  const handleClose = () => {
    setSearchEmail('');
    setSearchResult(null);
    setError('');
    setSuccess('');
    setShowInviteForm(false);
    setInviteName('');
    setInvitePhone('');
    setActiveTab('view');
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content ap-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Accountability Partners</h2>
          <button className="modal-close" onClick={handleClose}>&times;</button>
        </div>

        <div className="ap-modal-tabs">
          <button
            className={`ap-modal-tab ${activeTab === 'view' ? 'active' : ''}`}
            onClick={() => setActiveTab('view')}
          >
            My Partners
          </button>
          <button
            className={`ap-modal-tab ${activeTab === 'add' ? 'active' : ''}`}
            onClick={() => setActiveTab('add')}
          >
            + Add New
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="error">{error}</div>}
          {success && <div className="success">{success}</div>}

          {activeTab === 'view' && (
            <div className="ap-lists">
              {/* People who can view my data (I added them) */}
              <div className="ap-section">
                <h4>Can View Your Data ({myPartners.length})</h4>
                <p className="ap-section-desc">These people can see your homework, journals, and progress.</p>
                {myPartners.length === 0 ? (
                  <p className="ap-empty">No one yet. Add a partner to share your progress.</p>
                ) : (
                  <ul className="ap-list">
                    {myPartners.map(partner => (
                      <li key={partner.uid} className="ap-list-item">
                        <ProfilePhoto size="small" />
                        <div className="ap-list-info">
                          <span className="ap-list-name">{partner.name}</span>
                          <span className="ap-list-email">{partner.email}</span>
                        </div>
                        <button
                          className="ap-remove-btn"
                          onClick={() => handleRemove(partner.uid, partner.name)}
                          title="Remove partner"
                        >
                          &times;
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {activeTab === 'add' && (
            <div className="ap-add-section">
              <p className="ap-add-desc">
                Add someone as your accountability partner. They'll be able to view your homework progress, journals, and session notes.
              </p>

              <div className="accountability-search">
                <label>Search by email:</label>
                <div className="search-row">
                  <input
                    type="email"
                    value={searchEmail}
                    onChange={(e) => setSearchEmail(e.target.value)}
                    placeholder="email@example.com"
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  />
                  <button onClick={handleSearch} disabled={searching}>
                    {searching ? 'Searching...' : 'Search'}
                  </button>
                </div>
              </div>

              {searchResult && (
                <div className="accountability-result">
                  <div className="result-info">
                    <strong>{searchResult.name}</strong>
                    <span>{searchResult.email}</span>
                  </div>
                  <button
                    className="add-partner-btn"
                    onClick={handleAdd}
                    disabled={adding}
                  >
                    {adding ? 'Adding...' : 'Add Partner'}
                  </button>
                </div>
              )}

              {showInviteForm && (
                <div className="invite-form">
                  <p className="invite-notice">No account found for <strong>{searchEmail}</strong>. Send them an invite!</p>
                  <div className="invite-fields">
                    <div className="form-group">
                      <label>Name (optional):</label>
                      <input
                        type="text"
                        value={inviteName}
                        onChange={(e) => setInviteName(e.target.value)}
                        placeholder="Their name"
                      />
                    </div>
                    <div className="form-group">
                      <label>Phone (optional, for SMS):</label>
                      <input
                        type="tel"
                        value={invitePhone}
                        onChange={(e) => setInvitePhone(e.target.value)}
                        placeholder="(555) 123-4567"
                      />
                    </div>
                  </div>
                  <button
                    className="add-partner-btn invite-btn"
                    onClick={handleInvite}
                    disabled={inviting}
                  >
                    {inviting ? 'Sending...' : 'Send Invite'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="cancel-btn" onClick={handleClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
