import { useState } from 'react';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import React from 'react';

const PAGE_SIZE = 20;

const SuperAdminPanel = React.memo(function SuperAdminPanel({ user, auth, db }) {
  const [adminSearchQuery, setAdminSearchQuery] = useState('');
  const [adminSearchResults, setAdminSearchResults] = useState([]);
  const [adminSearchLoading, setAdminSearchLoading] = useState(false);
  const [adminSearchError, setAdminSearchError] = useState('');
  const [adminToggling, setAdminToggling] = useState(null);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteData, setInviteData] = useState({ name: '', email: '' });
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [allUsers, setAllUsers] = useState([]);
  const [allUsersLoading, setAllUsersLoading] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editUserForm, setEditUserForm] = useState({ name: '', email: '' });
  const [editUserLoading, setEditUserLoading] = useState(false);
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);
  const [page, setPage] = useState(0);

  const totalPages = Math.ceil(allUsers.length / PAGE_SIZE);
  const pagedUsers = allUsers.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleAdminSearch = async () => {
    if (!adminSearchQuery || adminSearchQuery.length < 2) {
      setAdminSearchError('Enter at least 2 characters');
      return;
    }
    setAdminSearchError('');
    setAdminSearchLoading(true);
    setAdminSearchResults([]);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const response = await fetch(`/api/list-users?q=${encodeURIComponent(adminSearchQuery)}`, {
        headers: { 'Authorization': `Bearer ${idToken}` }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Search failed');
      }
      setAdminSearchResults(data.users || []);
      if (data.users?.length === 0) {
        setAdminSearchError('No users found. Click "Invite User" to create a new account.');
      }
    } catch (error) {
      setAdminSearchError(error.message);
    } finally {
      setAdminSearchLoading(false);
    }
  };

  const handleToggleCounselor = async (targetUid, currentValue) => {
    setAdminToggling(targetUid);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const response = await fetch('/api/toggle-counselor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ targetUid, isCounselor: !currentValue })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Toggle failed');
      }
      setAdminSearchResults(prev =>
        prev.map(u => u.uid === targetUid ? { ...u, isCounselor: !currentValue } : u)
      );
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      setAdminToggling(null);
    }
  };

  const handleInviteUser = async (e) => {
    e.preventDefault();
    if (!inviteData.name || !inviteData.email) {
      setInviteError('Name and email are required');
      return;
    }
    setInviteError('');
    setInviteSuccess('');
    setInviteLoading(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const response = await fetch('/api/send-invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          email: inviteData.email.toLowerCase().trim(),
          name: inviteData.name.trim(),
          inviterName: user.displayName || 'Admin',
          inviterUid: user.uid
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Invite failed');
      }
      const emailKey = inviteData.email.toLowerCase().trim().replace(/[.]/g, '_');
      await setDoc(doc(db, 'pendingInvites', emailKey), {
        inviterUid: user.uid,
        inviterName: user.displayName || 'Admin',
        invitedEmail: inviteData.email.toLowerCase().trim(),
        invitedName: inviteData.name.trim(),
        createdAt: serverTimestamp()
      });
      setInviteSuccess('Invite sent!');
      setInviteData({ name: '', email: '' });
      if (adminSearchQuery) {
        handleAdminSearch();
      }
    } catch (error) {
      setInviteError(error.message);
    } finally {
      setInviteLoading(false);
    }
  };

  const handleLoadAllUsers = async () => {
    setAllUsersLoading(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const response = await fetch('/api/list-users', {
        headers: { 'Authorization': `Bearer ${idToken}` }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load users');
      }
      setAllUsers(data.users || []);
    } catch (error) {
      console.error('Error loading all users:', error);
      alert('Error: ' + error.message);
    } finally {
      setAllUsersLoading(false);
    }
  };

  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return 'Never';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp._seconds ? timestamp._seconds * 1000 : timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const handleEditUser = (userToEdit) => {
    setEditingUser(userToEdit);
    setEditUserForm({ name: userToEdit.name || '', email: userToEdit.email || '' });
  };

  const handleSaveUserEdit = async () => {
    if (!editingUser) return;
    setEditUserLoading(true);
    try {
      await updateDoc(doc(db, 'users', editingUser.uid), {
        name: editUserForm.name,
        email: editUserForm.email
      });
      setAllUsers(prev => prev.map(u =>
        u.uid === editingUser.uid ? { ...u, name: editUserForm.name, email: editUserForm.email } : u
      ));
      setEditingUser(null);
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      setEditUserLoading(false);
    }
  };

  const handleResetPassword = async (targetEmail) => {
    if (!window.confirm(`Send password reset email to ${targetEmail}?`)) return;
    setResetPasswordLoading(true);
    try {
      const { sendPasswordResetEmail } = await import('firebase/auth');
      await sendPasswordResetEmail(auth, targetEmail);
      alert('Password reset email sent!');
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      setResetPasswordLoading(false);
    }
  };

  const handleDeleteUser = async (targetUser) => {
    if (targetUser.isSuperAdmin) {
      alert('Cannot delete a superAdmin account.');
      return;
    }
    if (!window.confirm(`DELETE ${targetUser.name || targetUser.email}?\n\nThis will permanently remove:\n- Firebase Auth account\n- Firestore user profile\n- All AP links referencing this user\n- All partner requests\n\nThis cannot be undone.`)) return;
    if (!window.confirm(`Are you SURE? Type confirms delete of ${targetUser.email}.`)) return;
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ adminDelete: true, targetUid: targetUser.uid })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Delete failed');
      setAllUsers(prev => prev.filter(u => u.uid !== targetUser.uid));
      setEditingUser(null);
      alert(`Deleted ${targetUser.name || targetUser.email}. Cleaned: Auth=${data.cleaned.auth}, AP links=${data.cleaned.apLinks}, Partner requests=${data.cleaned.partnerRequests}`);
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };

  return (
    <>
      <div className="admin-search-section">
        <h3>Search Users</h3>
        <div className="admin-search-row">
          <input
            type="text"
            placeholder="Search by name or email..."
            value={adminSearchQuery}
            onChange={(e) => setAdminSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdminSearch()}
            className="admin-search-input"
          />
          <button
            className="admin-search-btn"
            onClick={handleAdminSearch}
            disabled={adminSearchLoading}
          >
            {adminSearchLoading ? 'Searching...' : 'Search'}
          </button>
          <button
            className="admin-invite-btn"
            onClick={() => setShowInviteForm(!showInviteForm)}
          >
            {showInviteForm ? 'Cancel' : '+ Invite User'}
          </button>
        </div>

        {adminSearchError && (
          <p className="admin-error">{adminSearchError}</p>
        )}

        {showInviteForm && (
          <form className="admin-invite-form" onSubmit={handleInviteUser}>
            <h4>Invite New User</h4>
            <input
              type="text"
              placeholder="Full Name"
              value={inviteData.name}
              onChange={(e) => setInviteData({ ...inviteData, name: e.target.value })}
              required
            />
            <input
              type="email"
              placeholder="Email Address"
              value={inviteData.email}
              onChange={(e) => setInviteData({ ...inviteData, email: e.target.value })}
              required
            />
            {inviteError && <p className="admin-error">{inviteError}</p>}
            {inviteSuccess && <p className="admin-success">{inviteSuccess}</p>}
            <button type="submit" disabled={inviteLoading}>
              {inviteLoading ? 'Sending...' : 'Send Invite'}
            </button>
          </form>
        )}

        {adminSearchResults.length > 0 && (
          <div className="admin-results">
            <table className="admin-users-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Counselor</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {adminSearchResults.map(u => (
                  <tr key={u.uid} className={u.isSuperAdmin ? 'superadmin-row' : ''}>
                    <td>{u.name || '(no name)'}</td>
                    <td>{u.email}</td>
                    <td>
                      <span className={`counselor-badge ${u.isCounselor ? 'yes' : 'no'}`}>
                        {u.isCounselor ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td>
                      <button
                        className={`toggle-counselor-btn ${u.isCounselor ? 'remove' : 'add'}`}
                        onClick={() => handleToggleCounselor(u.uid, u.isCounselor)}
                        disabled={adminToggling === u.uid || u.uid === user.uid}
                        title={u.uid === user.uid ? "Can't modify yourself" : ''}
                      >
                        {adminToggling === u.uid
                          ? '...'
                          : u.isCounselor
                            ? 'Remove Counselor'
                            : 'Make Counselor'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="admin-all-users-section">
        <div className="admin-all-users-header">
          <h3>All Users {allUsers.length > 0 ? `(${allUsers.length})` : ''}</h3>
          <button
            className="admin-load-btn"
            onClick={() => { setPage(0); handleLoadAllUsers(); }}
            disabled={allUsersLoading}
          >
            {allUsersLoading ? 'Loading...' : allUsers.length > 0 ? 'Refresh' : 'Load All Users'}
          </button>
        </div>

        {allUsers.length > 0 && (
          <>
            <div className="admin-users-scroll">
              <table className="admin-users-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Last Login</th>
                    <th>Last Activity</th>
                    <th>APs</th>
                    <th>Role</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedUsers.map(u => (
                    <tr key={u.uid} className={u.isSuperAdmin ? 'superadmin-row' : ''}>
                      <td>
                        <button className="admin-name-btn" onClick={() => handleEditUser(u)}>
                          {u.name || '(no name)'}
                        </button>
                      </td>
                      <td className="email-cell">{u.email}</td>
                      <td className="time-cell">{formatTimeAgo(u.lastLogin)}</td>
                      <td className="time-cell">{formatTimeAgo(u.lastActivity)}</td>
                      <td className="ap-count-cell">{u.apCount || 0}</td>
                      <td>
                        {u.isSuperAdmin && <span className="role-badge superadmin">Admin</span>}
                        {u.isCounselor && !u.isSuperAdmin && <span className="role-badge counselor">Counselor</span>}
                        {!u.isCounselor && !u.isSuperAdmin && <span className="role-badge user">User</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '12px 0' }}>
                <button
                  className="admin-load-btn"
                  onClick={() => setPage(p => p - 1)}
                  disabled={page === 0}
                  style={{ minWidth: '36px' }}
                >
                  &laquo;
                </button>
                <span style={{ fontSize: '0.85rem', color: '#666' }}>
                  {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, allUsers.length)} of {allUsers.length}
                </span>
                <button
                  className="admin-load-btn"
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= totalPages - 1}
                  style={{ minWidth: '36px' }}
                >
                  &raquo;
                </button>
              </div>
            )}
          </>
        )}

        {/* Edit User Modal */}
        {editingUser && (
          <div className="modal-overlay" onClick={() => setEditingUser(null)}>
            <div className="modal-content admin-edit-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Edit User</h2>
                <button className="modal-close" onClick={() => setEditingUser(null)}>&times;</button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label>Name</label>
                  <input
                    type="text"
                    value={editUserForm.name}
                    onChange={(e) => setEditUserForm({ ...editUserForm, name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={editUserForm.email}
                    onChange={(e) => setEditUserForm({ ...editUserForm, email: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>UID</label>
                  <input type="text" value={editingUser.uid} disabled className="disabled-input" />
                </div>
                <div className="form-group">
                  <label>Role</label>
                  <div className="role-display">
                    {editingUser.isSuperAdmin && <span className="role-badge superadmin">Admin</span>}
                    {editingUser.isCounselor && !editingUser.isSuperAdmin && <span className="role-badge counselor">Counselor</span>}
                    {!editingUser.isCounselor && !editingUser.isSuperAdmin && <span className="role-badge user">User</span>}
                  </div>
                </div>
                <div className="admin-edit-actions">
                  <button
                    className="reset-password-btn"
                    onClick={() => handleResetPassword(editingUser.email)}
                    disabled={resetPasswordLoading}
                  >
                    {resetPasswordLoading ? 'Sending...' : 'Send Password Reset Email'}
                  </button>
                  {!editingUser.isSuperAdmin && (
                    <button
                      className="admin-delete-user-btn"
                      onClick={() => handleDeleteUser(editingUser)}
                    >
                      Delete User
                    </button>
                  )}
                </div>
              </div>
              <div className="modal-footer">
                <button className="cancel-btn" onClick={() => setEditingUser(null)}>Cancel</button>
                <button
                  className="save-btn"
                  onClick={handleSaveUserEdit}
                  disabled={editUserLoading}
                >
                  {editUserLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
});

export default SuperAdminPanel;
