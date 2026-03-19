import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useAppNavigation, getViewState } from '../hooks/useAppNavigation';
import { db, auth } from '../config/firebase';
import { collection, query, onSnapshot, addDoc, setDoc, doc, deleteDoc, updateDoc, serverTimestamp, orderBy, getDocs, arrayUnion, Timestamp } from 'firebase/firestore';
import Tile from '../components/Tile';
import RichTextEditor from '../components/RichTextEditor';
import HomeworkTile from '../components/HomeworkTile';
import HeartJournalsTile from '../components/HeartJournalsTile';
import HeartJournalPage from '../components/HeartJournalPage';
import ThinkListsTile from '../components/ThinkListsTile';
import ThinkListPage from '../components/ThinkListPage';
import AccountSettings from '../components/AccountSettings';
import ProfilePhoto from '../components/ProfilePhoto';
import FamilyLinkModal from '../components/FamilyLinkModal';
import ActivityHistoryTile from '../components/ActivityHistoryTile';
import ActivityHistoryPage from '../components/ActivityHistoryPage';
import JournalingTile from '../components/JournalingTile';
import JournalingPage from '../components/JournalingPage';
import { isItemBehind, formatPhone } from '../utils/homeworkHelpers';
import { downloadCounseleeData } from '../utils/generatePDF';
import { getLinkedSpouse as getLinkedSpouseUtil } from '../utils/jointSession';

// Helper to read/write URL params for state persistence
const getUrlParams = () => new URLSearchParams(window.location.search);
const updateUrl = (params) => {
  const url = new URL(window.location);
  url.search = params.toString();
  window.history.replaceState({}, '', url);
};

export default function CounselorDashboard() {
  const { user, logout } = useAuth();
  const [counselees, setCounselees] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCounselee, setNewCounselee] = useState({ name: '', email: '', phone: '', password: '' });
  const [loading, setLoading] = useState(true);
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [selectedCounselee, setSelectedCounselee] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);
  const [homework, setHomework] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [heartJournals, setHeartJournals] = useState([]);
  const [thinkLists, setThinkLists] = useState([]);
  const [sessionNotes, setSessionNotes] = useState('');
  const [dateSaveStatus, setDateSaveStatus] = useState(null); // null, 'saving', 'saved'
  const [sessionFilterOnly, setSessionFilterOnly] = useState(false); // filter to show only this session's homework
  const [showSettings, setShowSettings] = useState(false);
  const [showFamilyLinkModal, setShowFamilyLinkModal] = useState(false);
  const [viewingHeartJournal, setViewingHeartJournal] = useState(null); // Heart journal being viewed
  const [viewingThinkList, setViewingThinkList] = useState(null); // Think list being viewed/edited
  const [completingId, setCompletingId] = useState(null);
  const [activityLog, setActivityLog] = useState([]);
  const [showActivityHistory, setShowActivityHistory] = useState(false);
  const [journals, setJournals] = useState([]);
  const [viewingJournal, setViewingJournal] = useState(null);
  const [counseleeBehindStatus, setCounseeleBehindStatus] = useState({}); // Map of counseleeId -> behindCount
  const [counselorProfile, setCounselorProfile] = useState(null); // Counselor's own user doc
  const [counseleeTab, setCounseleeTab] = useState('active'); // 'active' or 'graduated'

  // Track pending URL restoration
  const pendingCounseleeId = useRef(getUrlParams().get('counselee'));
  const pendingSessionId = useRef(getUrlParams().get('session'));
  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, `counselors/${user.uid}/counselees`));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCounselees(list);
      setLoading(false);

      // Restore counselee from URL if pending
      if (pendingCounseleeId.current) {
        const found = list.find(c => c.id === pendingCounseleeId.current);
        if (found) {
          setSelectedCounselee(found);
        }
        pendingCounseleeId.current = null;
      }
      // Mark initial load complete so URL sync can start
      initialLoadDone.current = true;
    }, (error) => {
      console.error('Listener error for counselee list:', error.code, error.message);
    });

    // Listen to counselor's own user doc (for profile photo, phone)
    const counselorRef = doc(db, 'users', user.uid);
    const unsubCounselor = onSnapshot(counselorRef, (snapshot) => {
      if (snapshot.exists()) {
        setCounselorProfile({ id: snapshot.id, ...snapshot.data() });
      }
    }, (error) => {
      console.error('Listener error for counselor profile:', error.code, error.message);
    });

    return () => {
      unsubscribe();
      unsubCounselor();
    };
  }, [user]);

  // Save counselor profile updates to Firestore user doc
  const handleUpdateCounselorProfile = async (updates) => {
    if (!user) return;
    const userRef = doc(db, 'users', user.uid);
    await updateDoc(userRef, updates);
  };

  // Calculate behind status for all counselees
  useEffect(() => {
    if (!user || counselees.length === 0) {
      setCounseeleBehindStatus({});
      return;
    }

    const fetchBehindStatus = async () => {
      const status = {};
      for (const counselee of counselees) {
        if (!counselee.uid) { status[counselee.id] = 0; continue; }
        try {
          const hwQuery = query(collection(db, `counselors/${user.uid}/counselees/${counselee.id}/homework`));
          const snapshot = await getDocs(hwQuery);
          const hwList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          const behindCount = hwList.filter(h => h.status !== 'cancelled' && isItemBehind(h)).length;
          status[counselee.id] = behindCount;
        } catch (err) {
          console.error('Error fetching homework for behind status:', err);
          status[counselee.id] = 0;
        }
      }
      setCounseeleBehindStatus(status);
    };

    fetchBehindStatus();
  }, [user, counselees]);

  // Load homework, sessions, heart journals, think lists, and activity log when counselee selected
  useEffect(() => {
    if (!user || !selectedCounselee) {
      setHomework([]);
      setSessions([]);
      setHeartJournals([]);
      setThinkLists([]);
      setActivityLog([]);
      setJournals([]);
      return;
    }

    const hwQuery = query(collection(db, `counselors/${user.uid}/counselees/${selectedCounselee.id}/homework`));
    const hwUnsub = onSnapshot(hwQuery, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setHomework(list);
    }, (error) => {
      console.error('Listener error for homework:', error.code, error.message);
    });

    const sessQuery = query(
      collection(db, `counselors/${user.uid}/counselees/${selectedCounselee.id}/sessions`),
      orderBy('date', 'desc')
    );
    const sessUnsub = onSnapshot(sessQuery, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSessions(list);

      // Restore session from URL if pending
      if (pendingSessionId.current) {
        const found = list.find(s => s.id === pendingSessionId.current);
        if (found) {
          setSelectedSession(found);
          setSessionNotes(found.notes || '');
          pendingSessionId.current = null;
        }
      }
    }, (error) => {
      console.error('Listener error for sessions:', error.code, error.message);
    });

    const hjQuery = query(
      collection(db, `counselors/${user.uid}/counselees/${selectedCounselee.id}/heartJournals`),
      orderBy('createdAt', 'desc')
    );
    const hjUnsub = onSnapshot(hjQuery, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setHeartJournals(list);
    }, (error) => {
      console.error('Listener error for heart journals:', error.code, error.message);
    });

    const tlQuery = query(
      collection(db, `counselors/${user.uid}/counselees/${selectedCounselee.id}/thinkLists`),
      orderBy('createdAt', 'desc')
    );
    const tlUnsub = onSnapshot(tlQuery, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setThinkLists(list);
    }, (error) => {
      console.error('Listener error for think lists:', error.code, error.message);
    });

    const alQuery = query(
      collection(db, `counselors/${user.uid}/counselees/${selectedCounselee.id}/activityLog`),
      orderBy('timestamp', 'desc')
    );
    const alUnsub = onSnapshot(alQuery, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setActivityLog(list);
    }, (error) => {
      console.error('Listener error for activity log:', error.code, error.message);
    });

    const jnQuery = query(
      collection(db, `counselors/${user.uid}/counselees/${selectedCounselee.id}/journals`),
      orderBy('createdAt', 'desc')
    );
    const jnUnsub = onSnapshot(jnQuery, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setJournals(list);
    }, (error) => {
      console.error('Listener error for journals:', error.code, error.message);
    });

    return () => {
      hwUnsub();
      sessUnsub();
      hjUnsub();
      tlUnsub();
      alUnsub();
      jnUnsub();
    };
  }, [user, selectedCounselee]);

  // Sync URL with current view state
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedCounselee) {
      params.set('counselee', selectedCounselee.id);
      if (selectedSession) {
        params.set('session', selectedSession.id);
      }
    }
    updateUrl(params);
  }, [selectedCounselee, selectedSession]);

  // Browser back button handler - closes current view instead of logging out
  const handleGoBack = useCallback(() => {
    // Close views in priority order (most nested first)
    if (viewingJournal) {
      setViewingJournal(null);
    } else if (showActivityHistory) {
      setShowActivityHistory(false);
    } else if (viewingThinkList) {
      setViewingThinkList(null);
    } else if (viewingHeartJournal) {
      setViewingHeartJournal(null);
    } else if (selectedSession) {
      setSelectedSession(null);
    } else if (selectedCounselee) {
      setSelectedCounselee(null);
    }
    // If on counselee list, back button does nothing (prevents logout)
  }, [viewingJournal, showActivityHistory, viewingThinkList, viewingHeartJournal, selectedSession, selectedCounselee]);

  // Get current view state for browser history
  const viewState = useMemo(() => getViewState({
    viewingHeartJournal,
    viewingThinkList,
    showActivityHistory,
    viewingJournal,
    selectedSession,
    selectedCounselee
  }), [viewingHeartJournal, viewingThinkList, showActivityHistory, viewingJournal, selectedSession, selectedCounselee]);

  // Hook into browser back button
  useAppNavigation(viewState, handleGoBack);

  const handleAddCounselee = async (e) => {
    e.preventDefault();
    if (!newCounselee.name.trim()) {
      setFormError('Name is required');
      return;
    }
    const hasEmail = newCounselee.email.trim();
    if (hasEmail && !newCounselee.password.trim()) {
      setFormError('Password is required when email is provided');
      return;
    }
    if (hasEmail && newCounselee.password.length < 6) {
      setFormError('Password must be at least 6 characters');
      return;
    }

    setFormError('');
    setFormLoading(true);

    try {
      let uid = null;

      // Only create Firebase Auth account if email is provided
      if (hasEmail) {
        const idToken = await auth.currentUser.getIdToken();
        const response = await fetch('/api/create-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({
            email: newCounselee.email,
            password: newCounselee.password,
            counselorId: user.uid,
            name: newCounselee.name
          })
        });

        const data = await response.json();
        if (!response.ok) {
          const errorMsg = data.message ? `${data.error}: ${data.message}` : data.error;
          throw new Error(errorMsg || 'Failed to create account');
        }
        uid = data.uid;
      }

      // Default reminder schedule: 9am, 3pm, 8pm every day
      const defaultSchedule = {};
      ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].forEach(day => {
        defaultSchedule[day] = { slot1: '09:00', slot2: '15:00', slot3: '20:00' };
      });

      const counseleeDoc = {
        name: newCounselee.name,
        phone: newCounselee.phone,
        status: 'active',
        currentStreak: 0,
        createdAt: serverTimestamp(),
        emailReminders: !!hasEmail,
        smsReminders: false,
        reminderSchedule: defaultSchedule
      };
      if (hasEmail) {
        counseleeDoc.email = newCounselee.email;
        counseleeDoc.uid = uid;
      }

      const counseleeRef = await addDoc(collection(db, `counselors/${user.uid}/counselees`), counseleeDoc);

      // Only create counseleeLinks and users doc if email was provided
      if (hasEmail && uid) {
        const emailKey = newCounselee.email.toLowerCase().replace(/[.]/g, '_');
        await setDoc(doc(db, 'counseleeLinks', emailKey), {
          counselorId: user.uid,
          counseleeDocId: counseleeRef.id,
          email: newCounselee.email.toLowerCase(),
          name: newCounselee.name
        });

        await setDoc(doc(db, 'users', uid), {
          email: newCounselee.email,
          name: newCounselee.name,
          role: 'counselee',
          counselorId: user.uid,
          counseleeDocId: counseleeRef.id,
          createdAt: serverTimestamp(),
          onboardingStep: 0,
          emailReminders: true,
          smsReminders: false,
          reminderSchedule: defaultSchedule
        });
      }

      setNewCounselee({ name: '', email: '', phone: '', password: '' });
      setShowAddForm(false);
    } catch (error) {
      console.error('Error adding counselee:', error);
      setFormError(error.message);
    } finally {
      setFormLoading(false);
    }
  };

  // Helper: find linked spouse for current counselee (uses shared util)
  const getLinkedSpouse = (counseleeId) => getLinkedSpouseUtil(counseleeId, counselees);

  const handleAddSession = async (isJoint = false) => {
    const sessionData = {
      date: serverTimestamp(),
      notes: '',
      homeworkAssigned: [],
      createdAt: serverTimestamp()
    };

    const sessionRef = await addDoc(
      collection(db, `counselors/${user.uid}/counselees/${selectedCounselee.id}/sessions`),
      sessionData
    );

    // If joint session, create mirror under spouse
    if (isJoint) {
      const spouse = getLinkedSpouse(selectedCounselee.id);
      if (spouse) {
        const spouseSessionRef = await addDoc(
          collection(db, `counselors/${user.uid}/counselees/${spouse.id}/sessions`),
          { ...sessionData, isJoint: true, linkedSessionId: sessionRef.id, linkedCounseleeId: selectedCounselee.id }
        );
        await updateDoc(doc(db, `counselors/${user.uid}/counselees/${selectedCounselee.id}/sessions`, sessionRef.id), {
          isJoint: true,
          linkedSessionId: spouseSessionRef.id,
          linkedCounseleeId: spouse.id
        });
      }
    }

    setSelectedSession({ id: sessionRef.id, date: new Date(), notes: '', homeworkAssigned: [], isJoint: isJoint || false });
  };

  // Callback for HomeworkTile onAdd
  const handleAddHomework = async (newHomework) => {
    if (!newHomework.title.trim()) return;

    // Use session date for assignedDate (so backdated sessions work correctly)
    const sessionDate = selectedSession?.date?.toDate
      ? selectedSession.date.toDate()
      : selectedSession?.date || new Date();

    const basePath = `counselors/${user.uid}/counselees/${selectedCounselee.id}`;

    await addDoc(collection(db, `${basePath}/homework`), {
      title: newHomework.title,
      description: newHomework.description || '',
      recurring: newHomework.recurring !== false,
      assignedBy: 'counselor',
      assignedDate: sessionDate,
      sessionId: selectedSession?.id || null,
      status: 'active',
      completions: [],
      weeklyTarget: parseInt(newHomework.weeklyTarget) || 7,
      weeklyCompleted: 0
    });

    // Log activity
    await addDoc(collection(db, `${basePath}/activityLog`), {
      action: 'homework_added',
      actor: 'counselor',
      details: `Assigned "${newHomework.title}"`,
      timestamp: serverTimestamp()
    });
  };

  // Callback for HomeworkTile onEdit
  const handleEditHomework = async (item, changes) => {
    try {
      const basePath = `counselors/${user.uid}/counselees/${selectedCounselee.id}`;
      const updateData = {
        title: changes.title,
        description: changes.description,
        recurring: changes.recurring,
        weeklyTarget: parseInt(changes.weeklyTarget) || 7
      };

      // Include assignedDate if it was provided
      if (changes.assignedDate) {
        updateData.assignedDate = new Date(changes.assignedDate);
      }

      await updateDoc(doc(db, `${basePath}/homework`, item.id), updateData);

      // Log activity
      await addDoc(collection(db, `${basePath}/activityLog`), {
        action: 'homework_edited',
        actor: 'counselor',
        details: `Edited "${changes.title}"`,
        timestamp: serverTimestamp()
      });
    } catch (err) {
      console.error('Failed to save homework:', err);
      alert('Failed to save: ' + err.message);
    }
  };

  // Callback for HomeworkTile onDelete
  const handleDeleteHomework = async (homeworkId) => {
    if (!window.confirm('Permanently delete this homework? This cannot be undone.')) return;

    const basePath = `counselors/${user.uid}/counselees/${selectedCounselee.id}`;
    const homeworkItem = homework.find(h => h.id === homeworkId);

    await deleteDoc(doc(db, `${basePath}/homework`, homeworkId));

    // Log activity
    await addDoc(collection(db, `${basePath}/activityLog`), {
      action: 'homework_deleted',
      actor: 'counselor',
      details: `Deleted "${homeworkItem?.title || 'homework'}"`,
      timestamp: serverTimestamp()
    });
  };

  // Callback for HomeworkTile onCancel
  const handleCancelHomework = async (item) => {
    const basePath = `counselors/${user.uid}/counselees/${selectedCounselee.id}`;

    await updateDoc(doc(db, `${basePath}/homework`, item.id), {
      status: 'cancelled',
      cancelledAt: serverTimestamp()
    });

    // Log activity
    await addDoc(collection(db, `${basePath}/activityLog`), {
      action: 'homework_cancelled',
      actor: 'counselor',
      details: `Cancelled "${item.title}"`,
      timestamp: serverTimestamp()
    });
  };

  const handleReactivateHomework = async (homeworkId) => {
    const basePath = `counselors/${user.uid}/counselees/${selectedCounselee.id}`;
    const homeworkItem = homework.find(h => h.id === homeworkId);

    await updateDoc(doc(db, `${basePath}/homework`, homeworkId), {
      status: 'active',
      cancelledAt: null
    });

    // Log activity
    await addDoc(collection(db, `${basePath}/activityLog`), {
      action: 'homework_reactivated',
      actor: 'counselor',
      details: `Reactivated "${homeworkItem?.title || 'homework'}"`,
      timestamp: serverTimestamp()
    });
  };

  // Uncheck (undo last completion) for homework in Done tab
  const handleCompleteHomework = async (homeworkItem) => {
    if (completingId) return;
    setCompletingId(homeworkItem.id);

    try {
      const basePath = `counselors/${user.uid}/counselees/${selectedCounselee.id}`;
      const homeworkRef = doc(db, `${basePath}/homework`, homeworkItem.id);

      await updateDoc(homeworkRef, {
        completions: arrayUnion(Timestamp.now())
      });

      await addDoc(collection(db, `${basePath}/activityLog`), {
        action: 'homework_completed',
        actor: 'counselor',
        details: `Completed "${homeworkItem.title}" (marked by counselor)`,
        timestamp: serverTimestamp()
      });
    } finally {
      setCompletingId(null);
    }
  };

  const handleUncheckHomework = async (homeworkItem) => {
    if (!homeworkItem.completions || homeworkItem.completions.length === 0) return;

    const basePath = `counselors/${user.uid}/counselees/${selectedCounselee.id}`;

    // Remove the most recent completion (last in array)
    const updatedCompletions = homeworkItem.completions.slice(0, -1);

    await updateDoc(doc(db, `${basePath}/homework`, homeworkItem.id), {
      completions: updatedCompletions
    });

    // Log the activity
    await addDoc(collection(db, `${basePath}/activityLog`), {
      action: 'homework_unchecked',
      actor: 'counselor',
      details: `Unchecked "${homeworkItem.title}"`,
      timestamp: serverTimestamp()
    });
  };

  const handlePhotoUpdate = async (url, fieldName = 'photoUrl') => {
    await updateDoc(
      doc(db, `counselors/${user.uid}/counselees`, selectedCounselee.id),
      { [fieldName]: url }
    );
    // Update local state immediately so UI refreshes
    setSelectedCounselee(prev => ({ ...prev, [fieldName]: url }));
  };

  const handleLinkFamily = async (linkedCounseleeId, relationship) => {
    // Get current linked family or empty array
    const currentLinks = selectedCounselee.linkedFamily || [];

    // Check if already linked
    if (currentLinks.some(link => link.counseleeId === linkedCounseleeId)) {
      throw new Error('This person is already linked');
    }

    // Add the new link to current counselee
    await updateDoc(
      doc(db, `counselors/${user.uid}/counselees`, selectedCounselee.id),
      {
        linkedFamily: [...currentLinks, { counseleeId: linkedCounseleeId, relationship }]
      }
    );

    // Also add reciprocal link to the other counselee
    const otherCounselee = counselees.find(c => c.id === linkedCounseleeId);
    const otherLinks = otherCounselee?.linkedFamily || [];
    const reciprocalRelationship = relationship === 'spouse' ? 'spouse' :
                                   relationship === 'parent' ? 'child' :
                                   relationship === 'child' ? 'parent' :
                                   relationship === 'sibling' ? 'sibling' : 'other';

    await updateDoc(
      doc(db, `counselors/${user.uid}/counselees`, linkedCounseleeId),
      {
        linkedFamily: [...otherLinks, { counseleeId: selectedCounselee.id, relationship: reciprocalRelationship }]
      }
    );
  };

  const handleDeleteCounselee = async () => {
    if (!window.confirm(`Delete ${selectedCounselee.name}? This cannot be undone.`)) {
      return;
    }

    try {
      if (selectedCounselee.uid) {
        const idToken = await auth.currentUser.getIdToken();
        await fetch('/api/delete-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({
            uid: selectedCounselee.uid,
            counselorId: user.uid
          })
        });
      }

      await deleteDoc(doc(db, `counselors/${user.uid}/counselees`, selectedCounselee.id));

      if (selectedCounselee.email) {
        const emailKey = selectedCounselee.email.toLowerCase().replace(/[.]/g, '_');
        await deleteDoc(doc(db, 'counseleeLinks', emailKey));
      }

      if (selectedCounselee.uid) {
        await deleteDoc(doc(db, 'users', selectedCounselee.uid));
      }

      setSelectedCounselee(null);
    } catch (error) {
      console.error('Error deleting counselee:', error);
      alert('Error deleting counselee');
    }
  };

  const handleGraduateCounselee = async (graduate = true) => {
    const basePath = `counselors/${user.uid}/counselees`;
    await updateDoc(doc(db, basePath, selectedCounselee.id), {
      graduated: graduate
    });
    // Update local state immediately
    setSelectedCounselee(prev => ({ ...prev, graduated: graduate }));
    // Log activity
    await addDoc(collection(db, `${basePath}/${selectedCounselee.id}/activityLog`), {
      action: graduate ? 'counselee_graduated' : 'counselee_reactivated',
      actor: 'counselor',
      details: graduate ? 'Counselee graduated/archived' : 'Counselee reactivated',
      timestamp: serverTimestamp()
    });
  };

  const getStatusColor = (counselee) => {
    if (!counselee.lastActivityDate) return '#ffc107';
    return '#28a745';
  };

  const formatDate = (date) => {
    if (!date) return 'No date';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Session navigation - sessions are sorted desc (newest first)
  const currentSessionIndex = selectedSession
    ? sessions.findIndex(s => s.id === selectedSession.id)
    : -1;
  const hasNewerSession = currentSessionIndex > 0;
  const hasOlderSession = currentSessionIndex < sessions.length - 1;

  const navigateSession = (direction) => {
    if (direction === 'newer' && hasNewerSession) {
      const newerSession = sessions[currentSessionIndex - 1];
      setSelectedSession(newerSession);
      setSessionNotes(newerSession.notes || '');
    } else if (direction === 'older' && hasOlderSession) {
      const olderSession = sessions[currentSessionIndex + 1];
      setSelectedSession(olderSession);
      setSessionNotes(olderSession.notes || '');
    }
  };

  const handleNotesChange = async (newNotes) => {
    setSessionNotes(newNotes);
    if (selectedSession) {
      await updateDoc(
        doc(db, `counselors/${user.uid}/counselees/${selectedCounselee.id}/sessions`, selectedSession.id),
        { notes: newNotes }
      );
      // Sync to linked spouse session if joint
      if (selectedSession.isJoint && selectedSession.linkedSessionId) {
        try {
          await updateDoc(
            doc(db, `counselors/${user.uid}/counselees/${selectedSession.linkedCounseleeId}/sessions`, selectedSession.linkedSessionId),
            { notes: newNotes }
          );
        } catch (e) {
          console.error('Failed to sync notes to spouse session:', e);
        }
      }
    }
  };

  const selectSession = (session) => {
    setSelectedSession(session);
    setSessionNotes(session.notes || '');
  };

  // Session detail view
  if (selectedSession) {
    // Filter homework based on session filter toggle
    const filteredHomework = sessionFilterOnly
      ? homework.filter(h => h.sessionId === selectedSession.id)
      : homework;

    const getSessionDateTimeValue = () => {
      if (!selectedSession.date) return '';
      const d = selectedSession.date.toDate ? selectedSession.date.toDate() : new Date(selectedSession.date);
      // Format for datetime-local: YYYY-MM-DDTHH:MM
      const pad = (n) => n.toString().padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    const handleDateChange = async (newDate) => {
      const newDateObj = new Date(newDate);
      setSelectedSession(prev => ({ ...prev, date: newDateObj }));
      setDateSaveStatus('saving');
      await updateDoc(
        doc(db, `counselors/${user.uid}/counselees/${selectedCounselee.id}/sessions`, selectedSession.id),
        { date: newDateObj }
      );
      // Sync date to linked spouse session if joint
      if (selectedSession.isJoint && selectedSession.linkedSessionId) {
        try {
          await updateDoc(
            doc(db, `counselors/${user.uid}/counselees/${selectedSession.linkedCounseleeId}/sessions`, selectedSession.linkedSessionId),
            { date: newDateObj }
          );
        } catch (e) {
          console.error('Failed to sync date to spouse session:', e);
        }
      }
      setDateSaveStatus('saved');
      setTimeout(() => setDateSaveStatus(null), 2000);
    };

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
            >
              &larr;
            </button>
            <span className="session-nav-label">{selectedCounselee.name}</span>
            <button
              className="nav-arrow"
              onClick={() => navigateSession('older')}
              disabled={!hasOlderSession}
              title="Older session"
            >
              &rarr;
            </button>
          </div>
        </header>
        <AccountSettings
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          userProfile={{ name: user?.displayName || '', uid: user?.uid, photoUrl: counselorProfile?.photoUrl, phone: counselorProfile?.phone }}
          onUpdateProfile={handleUpdateCounselorProfile}
          role="counselor"
        />
        <main>
          <div className="session-date-row">
            <label>Session:</label>
            <input
              type="datetime-local"
              value={getSessionDateTimeValue()}
              onChange={(e) => handleDateChange(e.target.value)}
              className="session-date-input"
            />
            {dateSaveStatus && (
              <span className={`save-status ${dateSaveStatus}`}>
                {dateSaveStatus === 'saving' ? 'Saving...' : '✓ Saved'}
              </span>
            )}
          </div>

          <div className="session-columns">
            <div className="session-homework-column">
              <HomeworkTile
                homework={filteredHomework}
                role="counselor"
                showSessionFilter={true}
                sessionFilterOnly={sessionFilterOnly}
                onSessionFilterChange={setSessionFilterOnly}
                onEdit={handleEditHomework}
                onCancel={handleCancelHomework}
                onReactivate={handleReactivateHomework}
                onUncheck={handleUncheckHomework}
                onDelete={handleDeleteHomework}
                onAdd={handleAddHomework}
                onComplete={handleCompleteHomework}
                completingId={completingId}
              />
            </div>

            <div className="session-notes-column">
              <Tile title="Session Notes">
                <RichTextEditor
                  content={sessionNotes}
                  onChange={handleNotesChange}
                  placeholder="Enter session notes here..."
                />
              </Tile>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Counselee detail view
  if (selectedCounselee) {
    return (
      <div className="dashboard">
        <header>
          <button className="back-btn" onClick={() => setSelectedCounselee(null)}>&larr; Back</button>
          <h1>{selectedCounselee.name}</h1>
        </header>
        <AccountSettings
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          userProfile={{ name: user?.displayName || '', uid: user?.uid, photoUrl: counselorProfile?.photoUrl, phone: counselorProfile?.phone }}
          onUpdateProfile={handleUpdateCounselorProfile}
          role="counselor"
        />
        <main>
          {/* Contact Info - full width at top (like greeting row on B-side) */}
          <div className="a-contact-info-row">
            <div className="a-contact-photos">
              <div className="photo-with-label">
                <ProfilePhoto
                  photoUrl={selectedCounselee.photoUrl}
                  counselorId={user.uid}
                  counseleeId={selectedCounselee.id}
                  onPhotoUpdate={handlePhotoUpdate}
                  editable={true}
                  size="medium"
                  uploadedBy="counselor"
                />
                <span className="photo-label">Counselor</span>
              </div>
              <div className="photo-with-label">
                <ProfilePhoto
                  photoUrl={selectedCounselee.counseleePhotoUrl}
                  size="medium"
                />
                <span className="photo-label">Counselee</span>
              </div>
            </div>
            <div className="a-contact-details">
              <p>
                {selectedCounselee.email ? (
                  <a
                    href={`mailto:${selectedCounselee.email}`}
                    className="contact-link"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.location.href = `mailto:${selectedCounselee.email}`;
                    }}
                  >
                    {selectedCounselee.email}
                  </a>
                ) : 'No email'}
              </p>
              <p>
                {selectedCounselee.phone ? (
                  <a
                    href={`tel:${selectedCounselee.phone.replace(/\D/g, '')}`}
                    className="contact-link"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(`tel:${selectedCounselee.phone.replace(/\D/g, '')}`, '_self');
                    }}
                  >
                    {formatPhone(selectedCounselee.phone)}
                  </a>
                ) : 'No phone'}
              </p>
              {selectedCounselee.linkedFamily && selectedCounselee.linkedFamily.length > 0 && (
                <div className="linked-family-inline">
                  <span className="family-label">Linked:</span>
                  {selectedCounselee.linkedFamily.map(member => {
                    const linkedCounselee = counselees.find(c => c.id === member.counseleeId);
                    return linkedCounselee ? (
                      <button
                        key={member.counseleeId}
                        className="linked-family-btn"
                        onClick={() => setSelectedCounselee(linkedCounselee)}
                      >
                        {linkedCounselee.name} ({member.relationship})
                      </button>
                    ) : null;
                  })}
                </div>
              )}
            </div>
            <div className="a-contact-actions">
              <button className="add-family-btn" onClick={() => setShowFamilyLinkModal(true)}>
                + Link Family
              </button>
              <button className="download-data-btn" onClick={async () => {
                try {
                  await downloadCounseleeData(user.uid, selectedCounselee.id, selectedCounselee.name);
                } catch (err) {
                  console.error('PDF download error:', err);
                  alert('Could not generate PDF. Please try again.');
                }
              }}>
                Download Data
              </button>
              {selectedCounselee.graduated ? (
                <button className="reactivate-btn" onClick={() => handleGraduateCounselee(false)}>
                  Reactivate
                </button>
              ) : (
                <button className="graduate-btn" onClick={() => handleGraduateCounselee(true)}>
                  Graduate
                </button>
              )}
              <button className="delete-btn-small" onClick={handleDeleteCounselee}>Delete</button>
            </div>
          </div>
          <FamilyLinkModal
            isOpen={showFamilyLinkModal}
            onClose={() => setShowFamilyLinkModal(false)}
            counselees={counselees}
            currentCounseleeId={selectedCounselee.id}
            onLink={handleLinkFamily}
            onAddCounselee={() => {
              setSelectedCounselee(null);
              setShowAddForm(true);
            }}
          />

          {/* Two-column layout (matching B-side) */}
          <div className="b-dashboard-grid">
            {/* Left column: Homework, Sessions */}
            <div className="b-dashboard-left">
              <HomeworkTile
                homework={homework}
                role="counselor"
                onEdit={handleEditHomework}
                onCancel={handleCancelHomework}
                onReactivate={handleReactivateHomework}
                onUncheck={handleUncheckHomework}
                onDelete={handleDeleteHomework}
                onAdd={handleAddHomework}
                onComplete={handleCompleteHomework}
                completingId={completingId}
              />

              <Tile
                title={`Sessions (${sessions.length})`}
                action={
                  getLinkedSpouse(selectedCounselee.id) ? (
                    <span className="session-add-group">
                      <button className="add-btn" onClick={() => handleAddSession(true)}>+ Joint Session</button>
                      <button className="add-btn add-btn-secondary" onClick={() => handleAddSession(false)}>+ Solo</button>
                    </span>
                  ) : (
                    <button className="add-btn" onClick={() => handleAddSession(false)}>+ Session</button>
                  )
                }
              >
                {sessions.length === 0 ? (
                  <p className="empty-list">No sessions yet. Click "+ Session" to start.</p>
                ) : (
                  <ul className="session-list">
                    {sessions.map(session => (
                      <li
                        key={session.id}
                        className="session-item"
                        onClick={() => selectSession(session)}
                      >
                        <span className="session-date">
                          {formatDate(session.date)}
                          {session.isJoint && <span className="joint-badge" title="Joint session with spouse">Joint</span>}
                        </span>
                        <span className="session-meta">
                          {homework.filter(h => h.sessionId === session.id).length} homework
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Tile>

              <ActivityHistoryTile
                activityLog={activityLog}
                onViewAll={() => setShowActivityHistory(true)}
              />
            </div>

            {/* Right column: Heart Journals, Think Lists */}
            <div className="b-dashboard-right">
              <HeartJournalsTile
                journals={heartJournals}
                role="counselor"
                onView={(journal) => setViewingHeartJournal(journal)}
              />

              <ThinkListsTile
                thinkLists={thinkLists}
                role="counselor"
                onView={(thinkList) => setViewingThinkList(thinkList)}
                onAdd={() => setViewingThinkList({})}
              />

              <JournalingTile
                journals={journals}
                role="counselor"
                onView={(journal) => setViewingJournal(journal)}
                onAdd={() => setViewingJournal({})}
              />
            </div>
          </div>
        </main>

        {/* Heart Journal View (full-page overlay for counselors) */}
        {viewingHeartJournal && (
          <HeartJournalPage
            userProfile={{
              counselorId: user.uid,
              counseleeDocId: selectedCounselee.id,
              name: selectedCounselee.name
            }}
            editingJournal={viewingHeartJournal}
            role="counselor"
            onClose={() => setViewingHeartJournal(null)}
            onSaved={() => setViewingHeartJournal(null)}
          />
        )}

        {/* Think List View (full-page overlay for counselors) */}
        {viewingThinkList && (
          <ThinkListPage
            userProfile={{
              counselorId: user.uid,
              counseleeDocId: selectedCounselee.id,
              name: selectedCounselee.name
            }}
            editingThinkList={viewingThinkList.id ? viewingThinkList : null}
            thinkLists={thinkLists}
            onNavigate={(thinkList) => setViewingThinkList(thinkList)}
            basePath={`counselors/${user.uid}/counselees/${selectedCounselee.id}`}
            role="counselor"
            onClose={() => setViewingThinkList(null)}
            onSaved={() => setViewingThinkList(null)}
          />
        )}

        {/* Activity History (full-page overlay) */}
        {showActivityHistory && (
          <ActivityHistoryPage
            activityLog={activityLog}
            counseleeName={selectedCounselee.name}
            onClose={() => setShowActivityHistory(false)}
          />
        )}

        {/* Journaling (full-page overlay) */}
        {viewingJournal && (
          <JournalingPage
            userProfile={{
              counselorId: user.uid,
              counseleeDocId: selectedCounselee.id,
              name: selectedCounselee.name
            }}
            editingJournal={viewingJournal.id ? viewingJournal : null}
            journals={journals}
            onNavigate={(journal) => setViewingJournal(journal)}
            basePath={`counselors/${user.uid}/counselees/${selectedCounselee.id}`}
            role="counselor"
            onClose={() => setViewingJournal(null)}
            onSaved={() => setViewingJournal(null)}
          />
        )}
      </div>
    );
  }

  // Main counselee list view
  return (
    <div className="dashboard">
      <header>
        <h1>Counselor Dashboard</h1>
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
        userProfile={{ name: user?.displayName || '', uid: user?.uid, photoUrl: counselorProfile?.photoUrl, phone: counselorProfile?.phone }}
        onUpdateProfile={handleUpdateCounselorProfile}
        role="counselor"
      />
      <main>
        <div className="counselee-header">
          <h2>My Counselees</h2>
          <button className="add-btn" onClick={() => setShowAddForm(true)}>+ Add Counselee</button>
        </div>

        <div className="counselee-tabs">
          <button
            className={`tab-btn ${counseleeTab === 'active' ? 'active' : ''}`}
            onClick={() => setCounseleeTab('active')}
          >
            Active ({counselees.filter(c => !c.graduated).length})
          </button>
          <button
            className={`tab-btn ${counseleeTab === 'graduated' ? 'active' : ''}`}
            onClick={() => setCounseleeTab('graduated')}
          >
            Graduated ({counselees.filter(c => c.graduated).length})
          </button>
        </div>

        {showAddForm && (
          <form className="add-form" onSubmit={handleAddCounselee}>
            <input
              type="text"
              placeholder="Name"
              value={newCounselee.name}
              onChange={(e) => setNewCounselee({ ...newCounselee, name: e.target.value })}
              required
            />
            <input
              type="email"
              placeholder="Email (optional - skip to add without login)"
              value={newCounselee.email}
              onChange={(e) => setNewCounselee({ ...newCounselee, email: e.target.value, password: e.target.value ? newCounselee.password : '' })}
            />
            <input
              type="tel"
              placeholder="Phone (for SMS)"
              value={newCounselee.phone}
              onChange={(e) => setNewCounselee({ ...newCounselee, phone: e.target.value })}
            />
            {newCounselee.email.trim() && (
              <input
                type="text"
                placeholder="Temp Password (min 6 chars)"
                value={newCounselee.password}
                onChange={(e) => setNewCounselee({ ...newCounselee, password: e.target.value })}
                required
              />
            )}
            {formError && <div className="error">{formError}</div>}
            <div className="form-buttons">
              <button type="submit" disabled={formLoading}>
                {formLoading ? 'Creating...' : 'Add'}
              </button>
              <button type="button" onClick={() => { setShowAddForm(false); setFormError(''); }}>Cancel</button>
            </div>
          </form>
        )}

        {loading ? (
          <p>Loading...</p>
        ) : counselees.length === 0 ? (
          <p className="empty-state">No counselees yet. Click "Add Counselee" to get started.</p>
        ) : (
          <ul className="counselee-list">
            {counselees
              .filter(c => counseleeTab === 'active' ? !c.graduated : c.graduated)
              .map(counselee => {
                const behindCount = counseleeBehindStatus[counselee.id] || 0;
                return (
                  <li
                    key={counselee.id}
                    className={`counselee-card clickable ${behindCount > 0 ? 'behind' : ''} ${counselee.graduated ? 'graduated' : ''}`}
                    onClick={() => setSelectedCounselee(counselee)}
                  >
                    <ProfilePhoto
                      photoUrl={counselee.photoUrl || counselee.counseleePhotoUrl}
                      size="small"
                    />
                    <span className="status-dot" style={{ backgroundColor: getStatusColor(counselee) }}></span>
                    <div className="counselee-info">
                      <strong>{counselee.name}</strong>
                      <span>{counselee.email || 'No email'}</span>
                    </div>
                    {!counselee.uid ? (
                      <span className="no-login-badge">No login</span>
                    ) : counselee.graduated ? (
                      <span className="graduated-badge">Graduated</span>
                    ) : behindCount > 0 ? (
                      <span className="behind-badge">{behindCount} behind</span>
                    ) : (
                      <span className="streak">{counselee.currentStreak} day streak</span>
                    )}
                  </li>
                );
              })}
            {counselees.filter(c => counseleeTab === 'active' ? !c.graduated : c.graduated).length === 0 && (
              <p className="empty-state">
                {counseleeTab === 'active' ? 'No active counselees.' : 'No graduated counselees.'}
              </p>
            )}
          </ul>
        )}
      </main>
    </div>
  );
}
