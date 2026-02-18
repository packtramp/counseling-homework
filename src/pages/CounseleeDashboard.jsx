import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useAppNavigation, getViewState } from '../hooks/useAppNavigation';
import { db } from '../config/firebase';
import { collection, query, onSnapshot, doc, updateDoc, addDoc, deleteDoc, getDoc, setDoc, serverTimestamp, arrayUnion, Timestamp, orderBy, limit } from 'firebase/firestore';
import RichTextEditor from '../components/RichTextEditor';
import HeartJournalPage from '../components/HeartJournalPage';
import HeartJournalsTile from '../components/HeartJournalsTile';
import ThinkListsTile from '../components/ThinkListsTile';
import ThinkListPage from '../components/ThinkListPage';
import HomeworkTile from '../components/HomeworkTile';
import AccountSettings from '../components/AccountSettings';
import ProfilePhoto from '../components/ProfilePhoto';
import ActivityHistoryTile from '../components/ActivityHistoryTile';
import ActivityHistoryPage from '../components/ActivityHistoryPage';
import JournalingTile from '../components/JournalingTile';
import JournalingPage from '../components/JournalingPage';
import { formatPhone } from '../utils/homeworkHelpers';

export default function CounseleeDashboard() {
  const { user, userProfile, logout } = useAuth();
  const [counseleeData, setCounseleeData] = useState(null); // Data from counselee document (includes photo)
  const [homework, setHomework] = useState([]);
  const [thinkLists, setThinkLists] = useState([]);
  const [activityLog, setActivityLog] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [completingId, setCompletingId] = useState(null);
  const [sessionNotes, setSessionNotes] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const notesTimeoutRef = useRef(null);
  const [showHeartJournal, setShowHeartJournal] = useState(false);
  const [editingJournal, setEditingJournal] = useState(null);
  const [heartJournals, setHeartJournals] = useState([]);
  const [showThinkListPage, setShowThinkListPage] = useState(false);
  const [editingThinkList, setEditingThinkList] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showActivityHistory, setShowActivityHistory] = useState(false);
  const [journals, setJournals] = useState([]);
  const [showJournalingPage, setShowJournalingPage] = useState(false);
  const [editingJournalEntry, setEditingJournalEntry] = useState(null);
  const [counselorProfile, setCounselorProfile] = useState(null);

  useEffect(() => {
    if (!userProfile?.counselorId || !userProfile?.counseleeDocId) {
      setLoading(false);
      return;
    }

    const basePath = `counselors/${userProfile.counselorId}/counselees/${userProfile.counseleeDocId}`;

    // Listen to counselee document (for photo, etc.)
    const counseleeRef = doc(db, basePath);
    const unsubCounselee = onSnapshot(counseleeRef, (snapshot) => {
      if (snapshot.exists()) {
        setCounseleeData({ id: snapshot.id, ...snapshot.data() });
      }
    }, (error) => {
      console.error('Listener error for self counselee doc:', error.code, error.message);
    });

    // Listen to counselor's user profile (for contact info on B-side)
    const counselorRef = doc(db, 'users', userProfile.counselorId);
    const unsubCounselor = onSnapshot(counselorRef, (snapshot) => {
      if (snapshot.exists()) {
        setCounselorProfile({ id: snapshot.id, ...snapshot.data() });
      }
    }, (error) => {
      console.error('Listener error for counselor profile:', error.code, error.message);
    });

    // Listen to homework (load all, filter at render time)
    const homeworkQuery = query(collection(db, `${basePath}/homework`));
    const unsubHomework = onSnapshot(homeworkQuery, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setHomework(list);
      setLoading(false);
    }, (error) => {
      console.error('Listener error for homework:', error.code, error.message);
    });

    // Listen to think lists (include drafts and active)
    const thinkQuery = query(
      collection(db, `${basePath}/thinkLists`),
      orderBy('createdAt', 'desc')
    );
    const unsubThink = onSnapshot(thinkQuery, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setThinkLists(list);
    }, (error) => {
      console.error('Listener error for think lists:', error.code, error.message);
    });

    // Listen to activity log (last 20 entries)
    const logQuery = query(
      collection(db, `${basePath}/activityLog`),
      orderBy('timestamp', 'desc'),
      limit(20)
    );
    const unsubLog = onSnapshot(logQuery, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setActivityLog(list);
    }, (error) => {
      console.error('Listener error for activity log:', error.code, error.message);
    });

    // Listen to sessions
    const sessQuery = query(
      collection(db, `${basePath}/sessions`),
      orderBy('date', 'desc')
    );
    const unsubSess = onSnapshot(sessQuery, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSessions(list);
    }, (error) => {
      console.error('Listener error for sessions:', error.code, error.message);
    });

    // Listen to heart journals
    const hjQuery = query(
      collection(db, `${basePath}/heartJournals`),
      orderBy('createdAt', 'desc')
    );
    const unsubHJ = onSnapshot(hjQuery, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setHeartJournals(list);
    }, (error) => {
      console.error('Listener error for heart journals:', error.code, error.message);
    });

    // Listen to journals
    const jnQuery = query(
      collection(db, `${basePath}/journals`),
      orderBy('createdAt', 'desc')
    );
    const unsubJN = onSnapshot(jnQuery, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setJournals(list);
    }, (error) => {
      console.error('Listener error for journals:', error.code, error.message);
    });

    return () => {
      unsubCounselee();
      unsubCounselor();
      unsubHomework();
      unsubThink();
      unsubLog();
      unsubSess();
      unsubHJ();
      unsubJN();
    };
  }, [userProfile]);

  // Browser back button handler - closes current view instead of logging out
  const handleGoBack = useCallback(() => {
    // Close views in priority order (most nested first)
    if (showJournalingPage) {
      setShowJournalingPage(false);
      setEditingJournalEntry(null);
    } else if (showActivityHistory) {
      setShowActivityHistory(false);
    } else if (showThinkListPage) {
      setShowThinkListPage(false);
      setEditingThinkList(null);
    } else if (showHeartJournal) {
      setShowHeartJournal(false);
      setEditingJournal(null);
    } else if (selectedSession) {
      setSelectedSession(null);
    }
    // If on dashboard, back button does nothing (prevents logout)
  }, [showJournalingPage, showActivityHistory, showThinkListPage, showHeartJournal, selectedSession]);

  // Get current view state for browser history
  const viewState = useMemo(() => getViewState({
    showHeartJournal,
    showThinkListPage,
    showActivityHistory,
    showJournalingPage,
    selectedSession
  }), [showHeartJournal, showThinkListPage, showActivityHistory, showJournalingPage, selectedSession]);

  // Hook into browser back button
  useAppNavigation(viewState, handleGoBack);

  const handleComplete = async (homeworkItem) => {
    if (completingId) return; // Prevent double-tap
    setCompletingId(homeworkItem.id);

    try {
      const basePath = `counselors/${userProfile.counselorId}/counselees/${userProfile.counseleeDocId}`;
      const homeworkRef = doc(db, `${basePath}/homework`, homeworkItem.id);

      // Use Firestore Timestamp for consistency with assignedDate
      await updateDoc(homeworkRef, {
        completions: arrayUnion(Timestamp.now())
      });

      // Log activity
      await addDoc(collection(db, `${basePath}/activityLog`), {
        action: 'homework_completed',
        actor: 'counselee',
        actorName: userProfile.name,
        details: `Completed "${homeworkItem.title}"`,
        timestamp: serverTimestamp()
      });
    } finally {
      setCompletingId(null);
    }
  };

  // Callback for HomeworkTile onAdd
  const handleAddHomework = async (newHomework) => {
    if (!newHomework.title.trim()) return;

    const basePath = `counselors/${userProfile.counselorId}/counselees/${userProfile.counseleeDocId}`;
    await addDoc(collection(db, `${basePath}/homework`), {
      title: newHomework.title,
      description: newHomework.description || '',
      recurring: newHomework.recurring !== false,
      assignedBy: 'self',
      assignedDate: Timestamp.now(),
      status: 'active',
      completions: [],
      weeklyTarget: parseInt(newHomework.weeklyTarget) || 7
    });

    // Log the activity
    await addDoc(collection(db, `${basePath}/activityLog`), {
      action: 'homework_added',
      actor: 'counselee',
      actorName: userProfile.name,
      details: `Added "${newHomework.title}"`,
      timestamp: serverTimestamp()
    });
  };

  // Callback for HomeworkTile onEdit
  const handleEditHomework = async (item, changes) => {
    const basePath = `counselors/${userProfile.counselorId}/counselees/${userProfile.counseleeDocId}`;

    await updateDoc(doc(db, `${basePath}/homework`, item.id), {
      title: changes.title,
      description: changes.description,
      weeklyTarget: parseInt(changes.weeklyTarget) || 7,
      recurring: changes.recurring,
      lastEditedBy: 'counselee',
      lastEditedAt: serverTimestamp(),
      counseleeChangeNote: changes.changeNotes ? changes.changeNotes.join('; ') : null
    });

    // Log the edit if there were changes
    if (changes.changeNotes) {
      await addDoc(collection(db, `${basePath}/activityLog`), {
        action: 'homework_edited',
        actor: 'counselee',
        actorName: userProfile.name,
        details: `Edited "${changes.title}": ${changes.changeNotes.join('; ')}`,
        timestamp: serverTimestamp()
      });
    }
  };

  const handleCancelHomework = async (item) => {
    if (!window.confirm(`Cancel "${item.title}"? It will move to the Done section.`)) return;

    const basePath = `counselors/${userProfile.counselorId}/counselees/${userProfile.counseleeDocId}`;

    await updateDoc(doc(db, `${basePath}/homework`, item.id), {
      status: 'cancelled',
      cancelledAt: serverTimestamp(),
      cancelledBy: 'counselee'
    });

    // Log the cancellation
    await addDoc(collection(db, `${basePath}/activityLog`), {
      action: 'homework_cancelled',
      actor: 'counselee',
      actorName: userProfile.name,
      details: `Cancelled "${item.title}"`,
      timestamp: serverTimestamp()
    });

    setEditingHomework(null);
  };

  const handleReactivateHomework = async (homeworkId) => {
    const basePath = `counselors/${userProfile.counselorId}/counselees/${userProfile.counseleeDocId}`;

    await updateDoc(doc(db, `${basePath}/homework`, homeworkId), {
      status: 'active',
      cancelledAt: null
    });

    // Log the reactivation
    await addDoc(collection(db, `${basePath}/activityLog`), {
      action: 'homework_reactivated',
      actor: 'counselee',
      actorName: userProfile.name,
      details: 'Reactivated homework',
      timestamp: serverTimestamp()
    });
  };

  // Uncheck (undo last completion) for homework in Done tab
  const handleUncheckHomework = async (homeworkItem) => {
    if (!homeworkItem.completions || homeworkItem.completions.length === 0) return;

    const basePath = `counselors/${userProfile.counselorId}/counselees/${userProfile.counseleeDocId}`;

    // Remove the most recent completion (last in array)
    const updatedCompletions = homeworkItem.completions.slice(0, -1);

    await updateDoc(doc(db, `${basePath}/homework`, homeworkItem.id), {
      completions: updatedCompletions
    });

    // Log the activity
    await addDoc(collection(db, `${basePath}/activityLog`), {
      action: 'homework_unchecked',
      actor: 'counselee',
      actorName: userProfile.name,
      details: `Unchecked "${homeworkItem.title}"`,
      timestamp: serverTimestamp()
    });
  };

  const handleNotesChange = async (newNotes) => {
    setSessionNotes(newNotes);

    // Debounce save
    if (notesTimeoutRef.current) {
      clearTimeout(notesTimeoutRef.current);
    }

    notesTimeoutRef.current = setTimeout(async () => {
      if (!selectedSession) return;
      setNotesSaving(true);
      const basePath = `counselors/${userProfile.counselorId}/counselees/${userProfile.counseleeDocId}`;
      await updateDoc(doc(db, `${basePath}/sessions`, selectedSession.id), {
        counseleeNotes: newNotes
      });
      setNotesSaving(false);
    }, 1000);
  };

  const selectSession = (session) => {
    setSelectedSession(session);
    setSessionNotes(session.counseleeNotes || '');
  };

  // Update counselee profile (for AccountSettings)
  const handleUpdateCounseleeProfile = async (updates) => {
    if (!userProfile?.counselorId || !userProfile?.counseleeDocId) {
      throw new Error('Account not properly linked. Please contact your counselor.');
    }

    const basePath = `counselors/${userProfile.counselorId}/counselees/${userProfile.counseleeDocId}`;
    const counseleeRef = doc(db, basePath);
    await updateDoc(counseleeRef, updates);

    // Log reminder setting changes
    if ('smsReminders' in updates || 'emailReminders' in updates || 'reminderSchedule' in updates || 'phone' in updates) {
      const changes = [];
      if ('smsReminders' in updates) changes.push(`SMS reminders ${updates.smsReminders ? 'enabled' : 'disabled'}`);
      if ('emailReminders' in updates) changes.push(`Email reminders ${updates.emailReminders ? 'enabled' : 'disabled'}`);
      if ('phone' in updates) changes.push('Updated phone number');
      if ('reminderSchedule' in updates) changes.push('Updated reminder schedule');
      await addDoc(collection(db, `${basePath}/activityLog`), {
        action: 'reminder_settings_changed',
        actor: 'counselee',
        actorName: userProfile?.name || 'counselee',
        details: changes.join('. '),
        timestamp: serverTimestamp()
      });
    }
  };

  // Session navigation
  const currentSessionIndex = selectedSession ? sessions.findIndex(s => s.id === selectedSession.id) : -1;
  const hasNewerSession = currentSessionIndex > 0;
  const hasOlderSession = currentSessionIndex >= 0 && currentSessionIndex < sessions.length - 1;

  const navigateSession = (direction) => {
    if (direction === 'newer' && hasNewerSession) {
      const newerSession = sessions[currentSessionIndex - 1];
      setSelectedSession(newerSession);
      setSessionNotes(newerSession.counseleeNotes || '');
    } else if (direction === 'older' && hasOlderSession) {
      const olderSession = sessions[currentSessionIndex + 1];
      setSelectedSession(olderSession);
      setSessionNotes(olderSession.counseleeNotes || '');
    }
  };

  const formatDate = (date) => {
    if (!date) return 'No date';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatLogDate = (timestamp) => {
    if (!timestamp) return '';
    const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
           d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  // Not linked to a counselor yet
  if (!userProfile?.counselorId) {
    return (
      <div className="dashboard">
        <header>
          <h1>My Homework</h1>
          <div className="header-actions">
            <button className="account-btn" onClick={() => setShowSettings(true)} title="Account Settings">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            </button>
            <button onClick={logout}>Sign Out</button>
          </div>
        </header>
        <AccountSettings
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          userProfile={{ ...userProfile, counseleePhotoUrl: counseleeData?.counseleePhotoUrl, phone: counseleeData?.phone, reminderSchedule: counseleeData?.reminderSchedule, smsReminders: counseleeData?.smsReminders, emailReminders: counseleeData?.emailReminders }}
          onUpdateProfile={handleUpdateCounseleeProfile}
          role="counselee"
        />
        <main>
          <div className="empty-state">
            <p>Your account is not yet linked to a counselor.</p>
            <p>Please contact your counselor to add your email address.</p>
          </div>
        </main>
      </div>
    );
  }

  // Full-page Heart Journal view
  if (showHeartJournal) {
    return (
      <HeartJournalPage
        userProfile={userProfile}
        editingJournal={editingJournal}
        onClose={() => {
          setShowHeartJournal(false);
          setEditingJournal(null);
        }}
        onSaved={() => {
          setEditingJournal(null);
        }}
      />
    );
  }

  // Full-page Think List view
  if (showThinkListPage) {
    return (
      <ThinkListPage
        userProfile={userProfile}
        editingThinkList={editingThinkList}
        thinkLists={thinkLists}
        homework={homework}
        onNavigate={(thinkList) => setEditingThinkList(thinkList)}
        onClose={() => {
          setShowThinkListPage(false);
          setEditingThinkList(null);
        }}
        onSaved={() => {
          setEditingThinkList(null);
        }}
        role="counselee"
      />
    );
  }

  // Full-page Activity History view
  if (showActivityHistory) {
    return (
      <ActivityHistoryPage
        activityLog={activityLog}
        counseleeName={userProfile.name}
        onClose={() => setShowActivityHistory(false)}
      />
    );
  }

  // Full-page Journaling view
  if (showJournalingPage) {
    const basePath = `counselors/${userProfile.counselorId}/counselees/${userProfile.counseleeDocId}`;
    return (
      <JournalingPage
        userProfile={userProfile}
        editingJournal={editingJournalEntry}
        journals={journals}
        homework={homework}
        onNavigate={(journal) => setEditingJournalEntry(journal)}
        basePath={basePath}
        role="counselee"
        onClose={() => setShowJournalingPage(false)}
        onSaved={() => setEditingJournalEntry(null)}
      />
    );
  }

  // Session detail view
  if (selectedSession) {
    return (
      <div className="dashboard">
        <header>
          <button className="back-btn" onClick={() => setSelectedSession(null)}>&larr; Back</button>
          <div className="session-nav">
            <button
              className="nav-arrow"
              onClick={() => navigateSession('newer')}
              disabled={!hasNewerSession}
              title="Newer session"
            >&larr;</button>
            <span className="session-nav-label">{formatDate(selectedSession.date)}</span>
            <button
              className="nav-arrow"
              onClick={() => navigateSession('older')}
              disabled={!hasOlderSession}
              title="Older session"
            >&rarr;</button>
          </div>
          <div className="header-actions">
            <button className="account-btn" onClick={() => setShowSettings(true)} title="Account Settings">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            </button>
            <button onClick={logout}>Sign Out</button>
          </div>
        </header>
        <AccountSettings
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          userProfile={{ ...userProfile, counseleePhotoUrl: counseleeData?.counseleePhotoUrl, phone: counseleeData?.phone, reminderSchedule: counseleeData?.reminderSchedule, smsReminders: counseleeData?.smsReminders, emailReminders: counseleeData?.emailReminders }}
          onUpdateProfile={handleUpdateCounseleeProfile}
          role="counselee"
        />
        <main>
          <div className="session-columns">
            <div className="session-homework-column">
              <HomeworkTile
                homework={homework}
                role="counselee"
                onComplete={handleComplete}
                onUncheck={handleUncheckHomework}
                onEdit={handleEditHomework}
                onCancel={handleCancelHomework}
                onReactivate={handleReactivateHomework}
                onAdd={handleAddHomework}
                completingId={completingId}
              />
            </div>

            <div className="session-notes-column">
              <div className="tile">
                <div className="tile-header">
                  <h3>My Notes {notesSaving && <span className="saving-indicator">(saving...)</span>}</h3>
                </div>
                <div className="tile-content">
                  <RichTextEditor
                    content={sessionNotes}
                    onChange={handleNotesChange}
                    placeholder="Your private notes for this session..."
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Activity Log */}
          {activityLog.length > 0 && (
            <div className="activity-log">
              <h4>Activity Log</h4>
              <ul>
                {activityLog.map(entry => (
                  <li key={entry.id} className="log-entry">
                    <span className="log-time">{formatLogDate(entry.timestamp)}</span>
                    <span className="log-details">{entry.details}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </main>
      </div>
    );
  }

  // Main dashboard view
  return (
    <div className="dashboard">
      <header>
        <h1>My Homework</h1>
        <div className="header-actions">
          <button className="account-btn" onClick={() => setShowSettings(true)} title="Account Settings">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
            </svg>
          </button>
          <button onClick={logout}>Sign Out</button>
        </div>
      </header>
      <AccountSettings
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        userProfile={{ ...userProfile, counseleePhotoUrl: counseleeData?.counseleePhotoUrl, phone: counseleeData?.phone, reminderSchedule: counseleeData?.reminderSchedule, smsReminders: counseleeData?.smsReminders, emailReminders: counseleeData?.emailReminders }}
        onUpdateProfile={handleUpdateCounseleeProfile}
        role="counselee"
      />
      <main>
        {/* Greeting row with counselor info - full width */}
        <div className="greeting-row">
          <ProfilePhoto
            photoUrl={counseleeData?.counseleePhotoUrl || counseleeData?.photoUrl}
            size="small"
          />
          <p className="greeting">Hi, {userProfile.name}!</p>
          {counselorProfile && (
            <div className="b-counselor-info">
              <ProfilePhoto
                photoUrl={counselorProfile.photoUrl}
                size="small"
              />
              <div className="b-counselor-details">
                <span className="b-counselor-label">Your counselor</span>
                <span className="b-counselor-name">{counselorProfile.name}</span>
                {counselorProfile.email && (
                  <a href={`mailto:${counselorProfile.email}`} className="contact-link" onClick={(e) => { e.stopPropagation(); window.location.href = `mailto:${counselorProfile.email}`; }}>
                    {counselorProfile.email}
                  </a>
                )}
                {counselorProfile.phone && (
                  <a href={`tel:${counselorProfile.phone.replace(/\D/g, '')}`} className="contact-link">
                    {formatPhone(counselorProfile.phone)}
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Two-column layout */}
        <div className="b-dashboard-grid">
          {/* Left column: Homework, Sessions, Activity Log */}
          <div className="b-dashboard-left">
            {/* Homework Section with Tabs */}
            {loading ? (
              <p>Loading...</p>
            ) : (
              <HomeworkTile
                homework={homework}
                role="counselee"
                onComplete={handleComplete}
                onUncheck={handleUncheckHomework}
                onEdit={handleEditHomework}
                onCancel={handleCancelHomework}
                onReactivate={handleReactivateHomework}
                onAdd={handleAddHomework}
                completingId={completingId}
              />
            )}

            {/* Sessions List */}
            <div className="tile">
              <div className="tile-header">
                <h3>Sessions ({sessions.length})</h3>
              </div>
              <div className="tile-content">
                {sessions.length === 0 ? (
                  <p className="empty-list">No sessions yet.</p>
                ) : (
                  <ul className="session-list">
                    {sessions.map(session => (
                      <li
                        key={session.id}
                        className="session-item"
                        onClick={() => selectSession(session)}
                      >
                        <span className="session-date">{formatDate(session.date)}</span>
                        <span className="session-meta">
                          {homework.filter(h => h.sessionId === session.id).length} homework
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <ActivityHistoryTile
              activityLog={activityLog}
              onViewAll={() => setShowActivityHistory(true)}
            />
          </div>

          {/* Right column: Heart Journals, Think Lists */}
          <div className="b-dashboard-right">
            {/* Heart Journals Tile */}
            <HeartJournalsTile
              journals={heartJournals}
              role="counselee"
              onView={(journal) => {
                setEditingJournal(journal);
                setShowHeartJournal(true);
              }}
              onAdd={() => {
                setEditingJournal(null);
                setShowHeartJournal(true);
              }}
            />

            {/* Think Lists Tile */}
            <ThinkListsTile
              thinkLists={thinkLists}
              role="counselee"
              onView={(thinkList) => {
                setEditingThinkList(thinkList);
                setShowThinkListPage(true);
              }}
              onAdd={() => {
                setEditingThinkList(null);
                setShowThinkListPage(true);
              }}
            />

            {/* Journaling Tile */}
            <JournalingTile
              journals={journals}
              role="counselee"
              onView={(journal) => {
                setEditingJournalEntry(journal);
                setShowJournalingPage(true);
              }}
              onAdd={() => {
                setEditingJournalEntry(null);
                setShowJournalingPage(true);
              }}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
