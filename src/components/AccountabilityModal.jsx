import { useState } from 'react';
import { auth, db } from '../config/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';

export default function AccountabilityModal({ isOpen, onClose, onAddPartner, existingPartners = [], currentUserUid }) {
  const [searchEmail, setSearchEmail] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [success, setSuccess] = useState('');

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

      // If still not found, check counseleeLinks which stores lowercase emails
      if (snapshot.empty) {
        const emailKey = emailLower.replace(/[.]/g, '_');
        const linkDoc = await getDoc(doc(db, 'counseleeLinks', emailKey));
        if (linkDoc.exists()) {
          // Found via counseleeLinks, look up the user by counseleeDocId
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
        setError('No user found with that email. They need to have an account first.');
        return;
      }

      const userDoc = snapshot.docs ? snapshot.docs[0] : snapshot;
      const userData = userDoc.data();

      // Check if it's the current user
      if (userDoc.id === currentUserUid) {
        setError("You can't add yourself as an accountability partner");
        return;
      }

      // Check if already a partner
      if (existingPartners.some(p => p.uid === userDoc.id)) {
        setError('This person is already your accountability partner');
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
      setSuccess(`${searchResult.name} added as your accountability partner!`);
      setSearchResult(null);
      setSearchEmail('');
      // Auto-close after a brief delay
      setTimeout(() => {
        onClose();
        setSuccess('');
      }, 1500);
    } catch (err) {
      setError(err.message || 'Failed to add accountability partner');
    } finally {
      setAdding(false);
    }
  };

  const handleClose = () => {
    setSearchEmail('');
    setSearchResult(null);
    setError('');
    setSuccess('');
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content accountability-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Accountability Partner</h2>
          <button className="modal-close" onClick={handleClose}>&times;</button>
        </div>

        <div className="modal-body">
          <p className="modal-description">
            Accountability partners can view your homework progress to help keep you on track.
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

          {error && <div className="error">{error}</div>}
          {success && <div className="success">{success}</div>}

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
        </div>

        <div className="modal-footer">
          <button className="cancel-btn" onClick={handleClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
