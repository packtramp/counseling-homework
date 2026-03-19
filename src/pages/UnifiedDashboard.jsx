import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useAppNavigation, getViewState } from '../hooks/useAppNavigation';
import { db, auth } from '../config/firebase';
import { collection, query, onSnapshot, addDoc, setDoc, doc, deleteDoc, updateDoc, serverTimestamp, orderBy, getDocs, getDoc, arrayUnion, Timestamp, limit, where } from 'firebase/firestore';
import Tile from '../components/Tile';
import RichTextEditor from '../components/RichTextEditor';
import HomeworkTile from '../components/HomeworkTile';
import HeartJournalsTile from '../components/HeartJournalsTile';
import HeartJournalPage from '../components/HeartJournalPage';
import ThinkListsTile from '../components/ThinkListsTile';
import ThinkListPage from '../components/ThinkListPage';
// AccountSettings removed — now at /settings route
import ProfilePhoto from '../components/ProfilePhoto';
import FamilyLinkModal from '../components/FamilyLinkModal';
import ActivityHistoryTile from '../components/ActivityHistoryTile';
import ActivityHistoryPage from '../components/ActivityHistoryPage';
import JournalingTile from '../components/JournalingTile';
import JournalingPage from '../components/JournalingPage';
import AccountabilityModal from '../components/AccountabilityModal';
import AccountabilityPartnersTile from '../components/AccountabilityPartnersTile';
import AccountabilityPartnersModal from '../components/AccountabilityPartnersModal';
import { isItemBehind, formatPhone, calculateAccountabilityStatus, calculateAPStreak, calculateWeekStreak, isOnVacation } from '../utils/homeworkHelpers';
import { getLinkedSpouse as getLinkedSpouseUtil } from '../utils/jointSession';
import VacationBanner from '../components/VacationBanner';
import OnboardingModal from '../components/OnboardingModal';
import PrayerRequestsTile from '../components/PrayerRequestsTile';
import PrayerRequestPage from '../components/PrayerRequestPage';

// Helper to read/write URL params for state persistence
const getUrlParams = () => new URLSearchParams(window.location.search);
const updateUrl = (params) => {
  const url = new URL(window.location);
  url.search = params.toString();
  window.history.replaceState({}, '', url);
};


export default function UnifiedDashboard() {
  const { user, userProfile, isCounselor, isSuperAdmin, logout } = useAuth();
  const navigate = useNavigate();

  // UI state
  const [activeSection, setActiveSection] = useState('me'); // 'me' or 'counselees'
  const [loading, setLoading] = useState(true);

  // "Me" section state (user's own data)
  const [myData, setMyData] = useState(null);
  const [myHomework, setMyHomework] = useState([]);
  const [myHeartJournals, setMyHeartJournals] = useState([]);
  const [myThinkLists, setMyThinkLists] = useState([]);
  const [myJournals, setMyJournals] = useState([]);
  const [myActivityLog, setMyActivityLog] = useState([]);
  const [mySessions, setMySessions] = useState([]);
  const [myProfile, setMyProfile] = useState(null); // User doc for settings
  const [myCounselorProfile, setMyCounselorProfile] = useState(null); // For existing counselees - their counselor's info
  const [myAccountabilityPartners, setMyAccountabilityPartners] = useState([]); // People watching my progress
  const [myWatchingUsers, setMyWatchingUsers] = useState([]); // People I'm holding accountable
  const [watchingUsersStatus, setWatchingUsersStatus] = useState({}); // { uid: { status, streak } }
  const [showAccountabilityPartnersModal, setShowAccountabilityPartnersModal] = useState(false);
  const [selectedWatchedUser, setSelectedWatchedUser] = useState(null); // Currently viewing this person's data
  const [watchedUserProfile, setWatchedUserProfile] = useState(null); // Their user doc (phone, etc.)
  const [watchedUserHomework, setWatchedUserHomework] = useState([]);
  const [watchedUserHeartJournals, setWatchedUserHeartJournals] = useState([]);
  const [watchedUserThinkLists, setWatchedUserThinkLists] = useState([]);
  const [watchedUserJournals, setWatchedUserJournals] = useState([]);
  const [watchedUserActivityLog, setWatchedUserActivityLog] = useState([]);
  const [viewingWatchedHeartJournal, setViewingWatchedHeartJournal] = useState(null);
  const [viewingWatchedThinkList, setViewingWatchedThinkList] = useState(null);
  const [viewingWatchedJournal, setViewingWatchedJournal] = useState(null);
  const [showWatchedActivityHistory, setShowWatchedActivityHistory] = useState(false);
  const [pendingRequests, setPendingRequests] = useState([]); // Incoming AP invite tiles
  const [respondingTo, setRespondingTo] = useState(null); // Request being responded to (popup)

  // "Me" section view state
  const [viewingMyHeartJournal, setViewingMyHeartJournal] = useState(null);
  const [viewingMyThinkList, setViewingMyThinkList] = useState(null);
  const [viewingMyJournal, setViewingMyJournal] = useState(null);
  const [viewingMyPrayerRequest, setViewingMyPrayerRequest] = useState(null);
  const [showMyActivityHistory, setShowMyActivityHistory] = useState(false);
  const [selectedMySession, setSelectedMySession] = useState(null);
  const [mySessionNotes, setMySessionNotes] = useState('');
  const [completingId, setCompletingId] = useState(null);

  // "My Counselees" section state (only for counselors)
  const [counselees, setCounselees] = useState([]);
  const [counseleeTab, setCounseleeTab] = useState('active');
  const [counseleeBehindStatus, setCounseeleBehindStatus] = useState({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [newCounselee, setNewCounselee] = useState({ name: '', email: '', phone: '', password: '' });
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [showActivateForm, setShowActivateForm] = useState(false);
  const [activateEmail, setActivateEmail] = useState('');
  const [activatePassword, setActivatePassword] = useState('');
  const [activateError, setActivateError] = useState('');
  const [activateLoading, setActivateLoading] = useState(false);

  // Counselee detail view state
  const [selectedCounselee, setSelectedCounselee] = useState(null);
  const [counseleeHomework, setCounseleeHomework] = useState([]);
  const [counseleeSessions, setCounseleeSessions] = useState([]);
  const [counseleeHeartJournals, setCounseleeHeartJournals] = useState([]);
  const [counseleeThinkLists, setCounseleeThinkLists] = useState([]);
  const [counseleeJournals, setCounseleeJournals] = useState([]);
  const [counseleeActivityLog, setCounseleeActivityLog] = useState([]);
  const [selectedCounseleeSession, setSelectedCounseleeSession] = useState(null);
  const [counseleeSessionNotes, setCounseleeSessionNotes] = useState('');
  const [dateSaveStatus, setDateSaveStatus] = useState(null);
  const [sessionFilterOnly, setSessionFilterOnly] = useState(false);
  const [showFamilyLinkModal, setShowFamilyLinkModal] = useState(false);
  const [viewingCounseleeHeartJournal, setViewingCounseleeHeartJournal] = useState(null);
  const [viewingCounseleeThinkList, setViewingCounseleeThinkList] = useState(null);
  const [viewingCounseleeJournal, setViewingCounseleeJournal] = useState(null);
  const [showCounseleeActivityHistory, setShowCounseleeActivityHistory] = useState(false);

  // Prayer request system state
  const [myPrayerCount, setMyPrayerCount] = useState(0); // Total prayers others made for my PRs
  const [showPrayerDetail, setShowPrayerDetail] = useState(false); // Show prayer counter pop-out
  const [prayerDetailList, setPrayerDetailList] = useState([]); // Recent prayers for pop-out

  // Encouragement system state
  const [encouragementCounts, setEncouragementCounts] = useState({}); // { [uid]: { cheers, nudges, messages } }
  const [mySentToday, setMySentToday] = useState({}); // { [uid]: { cheer: bool, nudge: bool, message: bool } }
  const [allEncouragements, setAllEncouragements] = useState([]);
  const [encouragementDetail, setEncouragementDetail] = useState(null); // { uid, type }
  const [showMessageInput, setShowMessageInput] = useState(null); // uid or null
  const [messageText, setMessageText] = useState('');
  const [sendingEncouragement, setSendingEncouragement] = useState(false);
  const [toast, setToast] = useState(null); // { message, color }
  const [encouragePopup, setEncouragePopup] = useState(null); // uid of open popup
  const toastTimeout = useRef(null);

  // Track pending URL restoration
  const pendingCounseleeId = useRef(getUrlParams().get('counselee'));
  const pendingSessionId = useRef(getUrlParams().get('session'));

  // Determine the correct data path for "Me" section
  // Existing counselees: use their counselor's path
  // Counselors/new users: use self-counselor path
  const getMyBasePath = () => {
    if (userProfile?.counselorId && userProfile?.counseleeDocId) {
      // Existing counselee - data is under their counselor
      return `counselors/${userProfile.counselorId}/counselees/${userProfile.counseleeDocId}`;
    }
    // Counselor or new user - use self-counselor path
    return `counselors/${user?.uid}/counselees/${user?.uid}`;
  };

  // Get userProfile object for "Me" section components
  const getMyUserProfile = () => {
    if (userProfile?.counselorId && userProfile?.counseleeDocId) {
      // Existing counselee
      return {
        uid: user?.uid,
        counselorId: userProfile.counselorId,
        counseleeDocId: userProfile.counseleeDocId,
        name: myData?.name || userProfile?.name || 'Me'
      };
    }
    // Counselor or new user - self-counselor
    return {
      uid: user?.uid,
      counselorId: user?.uid,
      counseleeDocId: user?.uid,
      name: myData?.name || userProfile?.name || 'Me'
    };
  };

  // Initialize/ensure self-counselor data structure exists (only for non-counselees)
  useEffect(() => {
    if (!user || !userProfile) return;
    // Skip if user is an existing counselee (they have data under their counselor)
    if (userProfile.counselorId && userProfile.counseleeDocId) return;

    const initSelfData = async () => {
      const selfPath = `counselors/${user.uid}/counselees/${user.uid}`;
      const selfDoc = await getDoc(doc(db, selfPath));

      if (!selfDoc.exists()) {
        // Create self-counselor data structure
        await setDoc(doc(db, selfPath), {
          name: userProfile?.name || user.displayName || 'Me',
          email: user.email,
          uid: user.uid,
          status: 'active',
          currentStreak: 0,
          createdAt: serverTimestamp(),
          isSelf: true
        });
      }
    };

    initSelfData();
  }, [user, userProfile]);

  // One-time migration: backfill default reminder slots, then verify
  useEffect(() => {
    if (!user || !isSuperAdmin) return;

    const runMigration = async () => {
      try {
        const idToken = await auth.currentUser.getIdToken();
        const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` };

        // Run backfill if not done yet
        if (!localStorage.getItem('backfill-reminders-v1')) {
          const backfillResp = await fetch('/api/toggle-counselor', {
            method: 'POST', headers,
            body: JSON.stringify({ action: 'backfillReminders' })
          });
          const backfillData = await backfillResp.json();
          console.log('Reminder backfill complete:', backfillData);
          localStorage.setItem('backfill-reminders-v1', 'done');
        }

        // Always verify (until we remove this code)
        if (!localStorage.getItem('verify-reminders-v1')) {
          const verifyResp = await fetch('/api/toggle-counselor', {
            method: 'POST', headers,
            body: JSON.stringify({ action: 'verifyReminders' })
          });
          const verifyData = await verifyResp.json();
          console.log('=== REMINDER VERIFICATION ===');
          console.log('Users:', verifyData.users);
          console.log('Counselees:', verifyData.counselees);
          const userIssues = verifyData.users?.filter(u => u.status !== 'OK') || [];
          const counseleeIssues = verifyData.counselees?.filter(c => c.status !== 'OK') || [];
          if (userIssues.length === 0 && counseleeIssues.length === 0) {
            console.log('ALL USERS VERIFIED - all 3 reminder slots filled');
            localStorage.setItem('verify-reminders-v1', 'done');
          } else {
            console.warn('Issues found:', { userIssues, counseleeIssues });
          }
        }
      } catch (err) {
        console.error('Reminder migration/verify failed:', err);
      }
    };
    runMigration();
  }, [user, isSuperAdmin]);

  // Load "Me" section data
  useEffect(() => {
    if (!user || !userProfile) return;

    const basePath = getMyBasePath();

    // Listen to self document
    const selfRef = doc(db, basePath);
    const unsubSelf = onSnapshot(selfRef, (snapshot) => {
      if (snapshot.exists()) {
        setMyData({ id: snapshot.id, ...snapshot.data() });
      }
      setLoading(false);
    }, (error) => {
      console.error('Listener error for self counselee doc:', error.code, error.message);
    });

    // Listen to user doc (for settings)
    const userRef = doc(db, 'users', user.uid);
    const unsubUser = onSnapshot(userRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setMyProfile({ id: snapshot.id, ...data });
        // Update accountability partners from user doc (dedup by uid)
        const rawPartners = data.accountabilityPartners || [];
        const seenPartnerUids = new Set();
        const dedupedPartners = rawPartners.filter(p => {
          if (seenPartnerUids.has(p.uid)) return false;
          seenPartnerUids.add(p.uid);
          return true;
        });
        setMyAccountabilityPartners(dedupedPartners);
        // Update who I'm watching (dedup by uid)
        const rawWatching = data.watchingUsers || [];
        const seenWatchingUids = new Set();
        const dedupedWatching = rawWatching.filter(w => {
          if (seenWatchingUids.has(w.uid)) return false;
          seenWatchingUids.add(w.uid);
          return true;
        });
        setMyWatchingUsers(dedupedWatching);
      }
    }, (error) => {
      console.error('Listener error for user doc:', error.code, error.message);
    });

    // Listen to counselor's profile (only for existing counselees)
    let unsubCounselor = () => {};
    if (userProfile?.counselorId && userProfile.counselorId !== user.uid) {
      const counselorRef = doc(db, 'users', userProfile.counselorId);
      unsubCounselor = onSnapshot(counselorRef, (snapshot) => {
        if (snapshot.exists()) {
          setMyCounselorProfile({ id: snapshot.id, ...snapshot.data() });
        }
      }, (error) => {
        console.error('Listener error for my counselor profile:', error.code, error.message);
      });
    } else {
      setMyCounselorProfile(null);
    }

    // Listen to my homework
    const hwQuery = query(collection(db, `${basePath}/homework`));
    const unsubHw = onSnapshot(hwQuery, (snapshot) => {
      setMyHomework(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.error('Listener error for my homework:', error.code, error.message);
    });

    // Listen to my heart journals
    const hjQuery = query(collection(db, `${basePath}/heartJournals`), orderBy('createdAt', 'desc'));
    const unsubHj = onSnapshot(hjQuery, (snapshot) => {
      setMyHeartJournals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.error('Listener error for my heart journals:', error.code, error.message);
    });

    // Listen to my think lists
    const tlQuery = query(collection(db, `${basePath}/thinkLists`), orderBy('createdAt', 'desc'));
    const unsubTl = onSnapshot(tlQuery, (snapshot) => {
      setMyThinkLists(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.error('Listener error for my think lists:', error.code, error.message);
    });

    // Listen to my journals
    const jnQuery = query(collection(db, `${basePath}/journals`), orderBy('createdAt', 'desc'));
    const unsubJn = onSnapshot(jnQuery, (snapshot) => {
      setMyJournals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.error('Listener error for my journals:', error.code, error.message);
    });

    // Listen to my activity log
    const alQuery = query(collection(db, `${basePath}/activityLog`), orderBy('timestamp', 'desc'), limit(200));
    const unsubAl = onSnapshot(alQuery, (snapshot) => {
      setMyActivityLog(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.error('Listener error for my activity log:', error.code, error.message);
    });

    // Listen to my sessions
    const sessQuery = query(collection(db, `${basePath}/sessions`), orderBy('date', 'desc'));
    const unsubSess = onSnapshot(sessQuery, (snapshot) => {
      setMySessions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.error('Listener error for my sessions:', error.code, error.message);
    });

    // Listen to pending partner requests targeting me
    const prQuery = query(
      collection(db, 'partnerRequests'),
      where('targetUid', '==', user.uid),
      where('status', '==', 'pending')
    );
    const unsubPr = onSnapshot(prQuery, (snapshot) => {
      setPendingRequests(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      console.error('Listener error for pending requests:', error.code, error.message);
    });

    return () => {
      unsubSelf();
      unsubUser();
      unsubCounselor();
      unsubHw();
      unsubHj();
      unsubTl();
      unsubJn();
      unsubAl();
      unsubSess();
      unsubPr();
    };
  }, [user, userProfile?.counselorId]);

  // Load counselees (any account can have counselees)
  useEffect(() => {
    if (!user) {
      setCounselees([]);
      return;
    }

    const q = query(collection(db, `counselors/${user.uid}/counselees`));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      // Filter out self from counselee list
      const list = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(c => c.id !== user.uid);
      setCounselees(list);

      // Restore counselee from URL if pending
      if (pendingCounseleeId.current) {
        const found = list.find(c => c.id === pendingCounseleeId.current);
        if (found) {
          setSelectedCounselee(found);
          setActiveSection('counselees');
        }
        pendingCounseleeId.current = null;
      }
    }, (error) => {
      console.error('Listener error for counselee list:', error.code, error.message);
    });

    return () => unsubscribe();
  }, [user]);

  // Calculate behind status for counselees
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
          status[counselee.id] = 0;
        }
      }
      setCounseeleBehindStatus(status);
    };

    fetchBehindStatus();
  }, [user, counselees]);

  // Real-time status for people I'm watching (accountability partners)
  useEffect(() => {
    if (!user || myWatchingUsers.length === 0) {
      setWatchingUsersStatus({});
      return;
    }

    const unsubscribers = [];
    let cancelled = false;

    const setupListeners = async () => {
      for (const person of myWatchingUsers) {
        if (cancelled) return;
        try {
          // Determine correct data path
          let dataPath = person.dataPath;
          if (!dataPath && person.uid) {
            try {
              const pUserDoc = await getDoc(doc(db, 'users', person.uid));
              if (pUserDoc.exists()) {
                const pData = pUserDoc.data();
                if (pData.counselorId && pData.counseleeDocId) {
                  dataPath = `counselors/${pData.counselorId}/counselees/${pData.counseleeDocId}`;
                }
              }
            } catch (e) { /* Fall through to default */ }
          }
          if (!dataPath) dataPath = `counselors/${person.uid}/counselees/${person.uid}`;

          // Get photo, streak, and vacation status once (non-realtime)
          let photoUrl = null;
          let streak = 0;
          let personProfile = null;
          try {
            const counseleeDoc = await getDoc(doc(db, dataPath));
            const counseleeData = counseleeDoc.exists() ? counseleeDoc.data() : {};
            photoUrl = counseleeData.counseleePhotoUrl || counseleeData.photoUrl || null;
            streak = counseleeData.currentStreak || 0;
            if (person.uid) {
              const userDoc = await getDoc(doc(db, 'users', person.uid));
              if (userDoc.exists()) {
                const uData = userDoc.data();
                if (!photoUrl) photoUrl = uData.photoUrl || null;
                personProfile = uData;
              }
            }
          } catch (e) { /* Ignore photo errors */ }

          // Real-time listener on homework for live status updates
          const hwRef = collection(db, `${dataPath}/homework`);
          const unsub = onSnapshot(hwRef, (snapshot) => {
            const homework = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            const status = calculateAccountabilityStatus(homework, personProfile);
            // Calculate streak live from homework completions (not stale closure)
            const liveStreak = calculateAPStreak(homework, personProfile);
            const liveWeekStreak = calculateWeekStreak(homework);
            setWatchingUsersStatus(prev => ({
              ...prev,
              [person.uid]: { status, streak: liveStreak, weekStreak: liveWeekStreak, photoUrl, onVacation: status === 'vacation' }
            }));
          }, (error) => {
            console.error('Listener error for AP homework (' + person.name + '):', error.code, error.message);
          });
          unsubscribers.push(unsub);
        } catch (err) {
          console.error('Error setting up listener for', person.name, err);
          setWatchingUsersStatus(prev => ({
            ...prev,
            [person.uid]: { status: 'unknown', streak: 0, photoUrl: null }
          }));
        }
      }
    };

    setupListeners();

    return () => {
      cancelled = true;
      unsubscribers.forEach(unsub => unsub());
    };
  }, [user, myWatchingUsers]);

  // Real-time listener for encouragements (cheers, nudges, messages)
  useEffect(() => {
    if (!user) return;

    // Get this Sunday at midnight (local time, matching week streak logic)
    const now = new Date();
    const day = now.getDay();
    const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
    const sundayTimestamp = Timestamp.fromDate(sunday);

    const q = query(
      collection(db, 'encouragements'),
      where('createdAt', '>=', sundayTimestamp),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const encs = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(enc => enc.createdAt != null);
      setAllEncouragements(encs);

      // Build counts per recipient
      const counts = {};
      encs.forEach(enc => {
        if (!counts[enc.recipientUid]) counts[enc.recipientUid] = { cheers: 0, nudges: 0, messages: 0 };
        if (enc.type === 'cheer') counts[enc.recipientUid].cheers++;
        else if (enc.type === 'nudge') counts[enc.recipientUid].nudges++;
        else if (enc.type === 'message') counts[enc.recipientUid].messages++;
      });
      setEncouragementCounts(counts);

      // Build "sent today" map for rate limit UI
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const sentMap = {};
      encs.forEach(enc => {
        if (enc.senderUid === user.uid) {
          const encDate = enc.createdAt?.toDate?.();
          if (encDate && encDate >= todayStart) {
            if (!sentMap[enc.recipientUid]) sentMap[enc.recipientUid] = {};
            sentMap[enc.recipientUid][enc.type] = true;
          }
        }
      });
      setMySentToday(sentMap);
    }, (error) => {
      console.error('Encouragement listener error:', error.code, error.message);
    });

    return () => unsub();
  }, [user]);

  // Send encouragement handler
  const sendEncouragement = async (recipientUid, type, message = null) => {
    if (sendingEncouragement) return;
    setSendingEncouragement(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/send-encouragement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({ recipientUid, type, message })
      });
      const data = await res.json();
      if (res.ok) {
        const labels = { cheer: 'Cheer sent! 👍', nudge: 'Fist bump sent! 👊', message: 'Message sent! 💬' };
        showToast(labels[type] || 'Sent!', '#38a169');
        setShowMessageInput(null);
        setMessageText('');
      } else if (res.status === 429) {
        showToast('Already sent today', '#d69e2e');
      } else {
        showToast(data.error || 'Failed to send', '#e53e3e');
      }
    } catch (err) {
      showToast('Network error', '#e53e3e');
    } finally {
      setSendingEncouragement(false);
    }
  };

  // Toast helper
  const showToast = (message, color = '#38a169') => {
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    setToast({ message, color });
    toastTimeout.current = setTimeout(() => setToast(null), 3000);
  };

  // Render encouragement counters for a given uid
  const renderEncouragementCounters = (uid, stopPropagation = false) => {
    const counts = encouragementCounts[uid] || {};
    const handler = (type) => (e) => {
      if (stopPropagation) e.stopPropagation();
      setEncouragementDetail({ uid, type });
    };
    return (
      <div className="encouragement-counters">
        <span className="encouragement-counter cheer-counter" onClick={handler('cheer')}>👍 {counts.cheers || 0}</span>
        <span className="encouragement-counter nudge-counter" onClick={handler('nudge')}>👊 {counts.nudges || 0}</span>
        <span className="encouragement-counter message-counter" onClick={handler('message')}>💬 {counts.messages || 0}</span>
      </div>
    );
  };

  // Render encourage bar at bottom of tiles (like Facebook Like/Comment/Share)
  const renderEncourageBar = (recipientUid) => {
    const sent = mySentToday[recipientUid] || {};
    return (
      <div className="encourage-bar" onClick={e => e.stopPropagation()}>
        <button className={`encourage-bar-btn${sent.cheer ? ' sent' : ''}`} disabled={sent.cheer || sendingEncouragement} onClick={() => sendEncouragement(recipientUid, 'cheer')}>
          👍 {sent.cheer ? 'Sent' : 'Cheer'}
        </button>
        <button className={`encourage-bar-btn${sent.nudge ? ' sent' : ''}`} disabled={sent.nudge || sendingEncouragement} onClick={() => sendEncouragement(recipientUid, 'nudge')}>
          👊 {sent.nudge ? 'Sent' : 'Nudge'}
        </button>
        <button className={`encourage-bar-btn${sent.message ? ' sent' : ''}`} disabled={sent.message || sendingEncouragement} onClick={() => { if (!sent.message) setShowMessageInput(recipientUid); }}>
          💬 {sent.message ? 'Sent' : 'Message'}
        </button>
      </div>
    );
  };

  // Render send buttons for a given uid
  const renderSendButtons = (recipientUid) => {
    const sent = mySentToday[recipientUid] || {};
    return (
      <div className="encouragement-actions">
        <button className="encouragement-btn cheer-btn" disabled={sent.cheer || sendingEncouragement} onClick={() => sendEncouragement(recipientUid, 'cheer')}>
          👍 {sent.cheer ? 'Sent' : 'Cheer'}
        </button>
        <button className="encouragement-btn nudge-btn" disabled={sent.nudge || sendingEncouragement} onClick={() => sendEncouragement(recipientUid, 'nudge')}>
          👊 {sent.nudge ? 'Sent' : 'Nudge'}
        </button>
        <button className="encouragement-btn message-btn" disabled={sent.message || sendingEncouragement} onClick={() => { if (!sent.message) setShowMessageInput(recipientUid); }}>
          💬 {sent.message ? 'Sent' : 'Message'}
        </button>
      </div>
    );
  };

  // Render message input form
  const renderMessageInput = (recipientUid) => {
    if (showMessageInput !== recipientUid) return null;
    return (
      <div className="encouragement-message-form">
        <textarea
          className="encouragement-message-input"
          placeholder="Write an encouraging message..."
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          maxLength={500}
          rows={3}
        />
        <div className="encouragement-message-actions">
          <span className="char-count">{messageText.length}/500</span>
          <button className="cancel-btn" onClick={() => { setShowMessageInput(null); setMessageText(''); }}>Cancel</button>
          <button className="save-btn" disabled={!messageText.trim() || sendingEncouragement} onClick={() => sendEncouragement(recipientUid, 'message', messageText)}>
            {sendingEncouragement ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    );
  };

  // Render floating message modal (works from tiles on main dashboard)
  const renderMessageModal = () => {
    if (!showMessageInput) return null;
    return (
      <div className="modal-overlay" onClick={() => { setShowMessageInput(null); setMessageText(''); }}>
        <div className="modal-content encouragement-message-modal" onClick={e => e.stopPropagation()}>
          <h3>💬 Send a Message</h3>
          <textarea
            className="encouragement-message-input"
            placeholder="Write an encouraging message..."
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            maxLength={500}
            rows={4}
            autoFocus
          />
          <div className="encouragement-message-actions">
            <span className="char-count">{messageText.length}/500</span>
            <button className="cancel-btn" onClick={() => { setShowMessageInput(null); setMessageText(''); }}>Cancel</button>
            <button className="save-btn" disabled={!messageText.trim() || sendingEncouragement} onClick={() => sendEncouragement(showMessageInput, 'message', messageText)}>
              {sendingEncouragement ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Render toast notification
  const renderToast = () => {
    if (!toast) return null;
    return (
      <div className="encouragement-toast" style={{ backgroundColor: toast.color }}>
        {toast.message}
      </div>
    );
  };

  // Render encouragement detail modal (who sent)
  const renderEncouragementDetailModal = () => {
    if (!encouragementDetail) return null;
    const { uid, type } = encouragementDetail;
    const items = allEncouragements.filter(e => e.recipientUid === uid && e.type === type);
    const typeLabels = { cheer: '👍 Cheers', nudge: '👊 Nudges', message: '💬 Messages' };
    return (
      <div className="modal-overlay" onClick={() => setEncouragementDetail(null)}>
        <div className="modal-content encouragement-detail-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h3>{typeLabels[type]} This Week</h3>
            <button className="modal-close" onClick={() => setEncouragementDetail(null)}>&times;</button>
          </div>
          <div className="modal-body">
            {items.length === 0 ? (
              <p className="empty-list">None this week</p>
            ) : (
              <ul className="encouragement-detail-list">
                {items.map(item => (
                  <li key={item.id} className="encouragement-detail-item">
                    <strong>{item.senderName}</strong>
                    <span className="encouragement-detail-time">
                      {item.createdAt?.toDate?.()?.toLocaleDateString('en-US', { weekday: 'short' })}{' '}
                      {item.createdAt?.toDate?.()?.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </span>
                    {item.message && <p className="encouragement-detail-message">"{item.message}"</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    );
  };

  const getAPStatusColor = (status) => {
    switch (status) {
      case 'green': return '#38a169';
      case 'idle': return '#a0aec0';       // gray for streak circle (idle)
      case 'warning': return '#d69e2e';
      case 'red': return '#e53e3e';
      case 'vacation': return '#3182ce';   // blue for vacation
      default: return '#a0aec0';
    }
  };

  const getAPStatusLabel = (status) => {
    switch (status) {
      case 'green': return 'On track';
      case 'idle': return 'No activity today';
      case 'warning': return 'Required today';
      case 'red': return 'Behind';
      case 'neutral': return 'No homework';
      case 'vacation': return 'On vacation';
      default: return '';
    }
  };

  const formatAPStreak = (streak) => {
    if (!streak || streak < 1) return '0 day streak';
    return `${streak} day streak`;
  };

  // Load counselee detail data when selected
  useEffect(() => {
    if (!user || !selectedCounselee) {
      setCounseleeHomework([]);
      setCounseleeSessions([]);
      setCounseleeHeartJournals([]);
      setCounseleeThinkLists([]);
      setCounseleeJournals([]);
      setCounseleeActivityLog([]);
      return;
    }

    const basePath = `counselors/${user.uid}/counselees/${selectedCounselee.id}`;

    const hwUnsub = onSnapshot(query(collection(db, `${basePath}/homework`)), (snapshot) => {
      setCounseleeHomework(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.error('Listener error for counselee homework:', error.code, error.message);
    });

    const sessUnsub = onSnapshot(query(collection(db, `${basePath}/sessions`), orderBy('date', 'desc')), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCounseleeSessions(list);

      // Restore session from URL if pending
      if (pendingSessionId.current) {
        const found = list.find(s => s.id === pendingSessionId.current);
        if (found) {
          setSelectedCounseleeSession(found);
          setCounseleeSessionNotes(found.notes || '');
          pendingSessionId.current = null;
        }
      }
    }, (error) => {
      console.error('Listener error for counselee sessions:', error.code, error.message);
    });

    const hjUnsub = onSnapshot(query(collection(db, `${basePath}/heartJournals`), orderBy('createdAt', 'desc')), (snapshot) => {
      setCounseleeHeartJournals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.error('Listener error for counselee heart journals:', error.code, error.message);
    });

    const tlUnsub = onSnapshot(query(collection(db, `${basePath}/thinkLists`), orderBy('createdAt', 'desc')), (snapshot) => {
      setCounseleeThinkLists(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.error('Listener error for counselee think lists:', error.code, error.message);
    });

    const jnUnsub = onSnapshot(query(collection(db, `${basePath}/journals`), orderBy('createdAt', 'desc')), (snapshot) => {
      setCounseleeJournals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.error('Listener error for counselee journals:', error.code, error.message);
    });

    const alUnsub = onSnapshot(query(collection(db, `${basePath}/activityLog`), orderBy('timestamp', 'desc')), (snapshot) => {
      setCounseleeActivityLog(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.error('Listener error for counselee activity log:', error.code, error.message);
    });

    return () => {
      hwUnsub();
      sessUnsub();
      hjUnsub();
      tlUnsub();
      jnUnsub();
      alUnsub();
    };
  }, [user, selectedCounselee]);

  // Load watched user's profile doc (phone, etc.)
  useEffect(() => {
    if (!selectedWatchedUser?.uid) {
      setWatchedUserProfile(null);
      return;
    }
    const loadProfile = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', selectedWatchedUser.uid));
        if (userDoc.exists()) setWatchedUserProfile(userDoc.data());
      } catch (e) {
        console.error('Error loading watched user profile:', e);
      }
    };
    loadProfile();
  }, [selectedWatchedUser]);

  // Resolve watched user's data path (may need lookup if stored path is missing)
  const [resolvedWatchedPath, setResolvedWatchedPath] = useState(null);
  useEffect(() => {
    if (!selectedWatchedUser) { setResolvedWatchedPath(null); return; }
    if (selectedWatchedUser.dataPath) { setResolvedWatchedPath(selectedWatchedUser.dataPath); return; }
    // Look up from user doc
    const lookupPath = async () => {
      try {
        const uDoc = await getDoc(doc(db, 'users', selectedWatchedUser.uid));
        if (uDoc.exists()) {
          const uData = uDoc.data();
          if (uData.counselorId && uData.counseleeDocId) {
            setResolvedWatchedPath(`counselors/${uData.counselorId}/counselees/${uData.counseleeDocId}`);
            return;
          }
        }
        setResolvedWatchedPath(`counselors/${selectedWatchedUser.uid}/counselees/${selectedWatchedUser.uid}`);
      } catch (e) {
        setResolvedWatchedPath(`counselors/${selectedWatchedUser.uid}/counselees/${selectedWatchedUser.uid}`);
      }
    };
    lookupPath();
  }, [selectedWatchedUser]);

  // Load watched user's data (read-only accountability view - ALL collections)
  useEffect(() => {
    if (!selectedWatchedUser || !resolvedWatchedPath) {
      setWatchedUserHomework([]);
      setWatchedUserHeartJournals([]);
      setWatchedUserThinkLists([]);
      setWatchedUserJournals([]);
      setWatchedUserActivityLog([]);
      return;
    }

    const basePath = resolvedWatchedPath;

    const hwQuery = query(collection(db, `${basePath}/homework`));
    const unsubHw = onSnapshot(hwQuery, (snapshot) => {
      setWatchedUserHomework(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.error('Error loading watched user homework:', error);
      setWatchedUserHomework([]);
    });

    const hjQuery = query(collection(db, `${basePath}/heartJournals`), orderBy('createdAt', 'desc'));
    const unsubHj = onSnapshot(hjQuery, (snapshot) => {
      setWatchedUserHeartJournals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.error('Error loading watched user heart journals:', error);
      setWatchedUserHeartJournals([]);
    });

    const tlQuery = query(collection(db, `${basePath}/thinkLists`), orderBy('createdAt', 'desc'));
    const unsubTl = onSnapshot(tlQuery, (snapshot) => {
      setWatchedUserThinkLists(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.error('Error loading watched user think lists:', error);
      setWatchedUserThinkLists([]);
    });

    const jnQuery = query(collection(db, `${basePath}/journals`), orderBy('createdAt', 'desc'));
    const unsubJn = onSnapshot(jnQuery, (snapshot) => {
      // Filter out personal journals (timesPerWeek === 0) from AP view
      setWatchedUserJournals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(j => j.timesPerWeek > 0));
    }, (error) => {
      console.error('Error loading watched user journals:', error);
      setWatchedUserJournals([]);
    });

    const alQuery = query(collection(db, `${basePath}/activityLog`), orderBy('timestamp', 'desc'), limit(200));
    const unsubAl = onSnapshot(alQuery, (snapshot) => {
      setWatchedUserActivityLog(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.error('Error loading watched user activity log:', error);
      setWatchedUserActivityLog([]);
    });

    return () => {
      unsubHw();
      unsubHj();
      unsubTl();
      unsubJn();
      unsubAl();
    };
  }, [selectedWatchedUser, resolvedWatchedPath]);

  // Sync URL with current view state
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedCounselee) {
      params.set('counselee', selectedCounselee.id);
      if (selectedCounseleeSession) {
        params.set('session', selectedCounseleeSession.id);
      }
    }
    updateUrl(params);
  }, [selectedCounselee, selectedCounseleeSession]);


  // Browser back button handler
  const handleGoBack = useCallback(() => {
    // Watched user sub-views first
    if (viewingWatchedJournal) {
      setViewingWatchedJournal(null);
    } else if (showWatchedActivityHistory) {
      setShowWatchedActivityHistory(false);
    } else if (viewingWatchedThinkList) {
      setViewingWatchedThinkList(null);
    } else if (viewingWatchedHeartJournal) {
      setViewingWatchedHeartJournal(null);
    } else if (selectedWatchedUser) {
      setSelectedWatchedUser(null);
    } else if (viewingMyPrayerRequest) {
      setViewingMyPrayerRequest(null);
    } else if (viewingMyJournal) {
      setViewingMyJournal(null);
    } else if (showMyActivityHistory) {
      setShowMyActivityHistory(false);
    } else if (viewingMyThinkList) {
      setViewingMyThinkList(null);
    } else if (viewingMyHeartJournal) {
      setViewingMyHeartJournal(null);
    } else if (selectedMySession) {
      setSelectedMySession(null);
    } else if (viewingCounseleeJournal) {
      setViewingCounseleeJournal(null);
    } else if (showCounseleeActivityHistory) {
      setShowCounseleeActivityHistory(false);
    } else if (viewingCounseleeThinkList) {
      setViewingCounseleeThinkList(null);
    } else if (viewingCounseleeHeartJournal) {
      setViewingCounseleeHeartJournal(null);
    } else if (selectedCounseleeSession) {
      setSelectedCounseleeSession(null);
    } else if (selectedCounselee) {
      setSelectedCounselee(null);
    }
  }, [viewingWatchedJournal, showWatchedActivityHistory, viewingWatchedThinkList, viewingWatchedHeartJournal,
      selectedWatchedUser, viewingMyPrayerRequest, viewingMyJournal, showMyActivityHistory, viewingMyThinkList,
      viewingMyHeartJournal, selectedMySession, viewingCounseleeJournal, showCounseleeActivityHistory,
      viewingCounseleeThinkList, viewingCounseleeHeartJournal, selectedCounseleeSession, selectedCounselee]);

  // Home button resets all sub-views back to main dashboard
  useEffect(() => {
    const resetAll = () => {
      setViewingWatchedJournal(null);
      setShowWatchedActivityHistory(false);
      setViewingWatchedThinkList(null);
      setViewingWatchedHeartJournal(null);
      setSelectedWatchedUser(null);
      setViewingMyPrayerRequest(null);
      setViewingMyJournal(null);
      setShowMyActivityHistory(false);
      setViewingMyThinkList(null);
      setViewingMyHeartJournal(null);
      setSelectedMySession(null);
      setViewingCounseleeJournal(null);
      setShowCounseleeActivityHistory(false);
      setViewingCounseleeThinkList(null);
      setViewingCounseleeHeartJournal(null);
      setSelectedCounseleeSession(null);
      setSelectedCounselee(null);
    };
    window.addEventListener('dashboard-reset', resetAll);
    return () => window.removeEventListener('dashboard-reset', resetAll);
  }, []);

  const viewState = useMemo(() => getViewState({
    viewingHeartJournal: viewingMyHeartJournal || viewingCounseleeHeartJournal || viewingWatchedHeartJournal,
    viewingThinkList: viewingMyThinkList || viewingCounseleeThinkList || viewingWatchedThinkList,
    showActivityHistory: showMyActivityHistory || showCounseleeActivityHistory || showWatchedActivityHistory,
    viewingJournal: viewingMyJournal || viewingCounseleeJournal || viewingWatchedJournal,
    viewingPrayerRequest: viewingMyPrayerRequest,
    selectedSession: selectedMySession || selectedCounseleeSession,
    selectedCounselee,
    selectedWatchedUser
  }), [viewingMyHeartJournal, viewingCounseleeHeartJournal, viewingWatchedHeartJournal,
      viewingMyThinkList, viewingCounseleeThinkList, viewingWatchedThinkList,
      showMyActivityHistory, showCounseleeActivityHistory, showWatchedActivityHistory,
      viewingMyJournal, viewingCounseleeJournal, viewingWatchedJournal, viewingMyPrayerRequest,
      selectedMySession, selectedCounseleeSession, selectedCounselee, selectedWatchedUser]);

  useAppNavigation(viewState, handleGoBack);

  const formatDate = (date) => {
    if (!date) return 'No date';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getStatusColor = (counselee) => {
    if (!counselee.lastActivityDate) return '#ffc107';
    return '#28a745';
  };

  // ========== "ME" SECTION HANDLERS ==========

  const handleMyComplete = async (homeworkItem) => {
    if (completingId) return;
    // Safety guard: Think List items cannot be completed via checkbox
    if (homeworkItem.linkedThinkListId) return;
    setCompletingId(homeworkItem.id);

    try {
      const basePath = getMyBasePath();
      await updateDoc(doc(db, `${basePath}/homework`, homeworkItem.id), {
        completions: arrayUnion(Timestamp.now())
      });
      await addDoc(collection(db, `${basePath}/activityLog`), {
        action: 'homework_completed',
        actor: 'self',
        actorName: myData?.name || 'Me',
        details: `Completed "${homeworkItem.title}"`,
        timestamp: serverTimestamp()
      });
    } finally {
      setCompletingId(null);
    }
  };

  const handleOpenThinkListFromHomework = (homeworkItem) => {
    if (!homeworkItem.linkedThinkListId) return;
    const linkedTL = myThinkLists.find(tl => tl.id === homeworkItem.linkedThinkListId);
    if (linkedTL) {
      setViewingMyThinkList(linkedTL);
    }
  };

  const handleOpenCounseleeThinkListFromHomework = (homeworkItem) => {
    if (!homeworkItem.linkedThinkListId) return;
    const linkedTL = counseleeThinkLists.find(tl => tl.id === homeworkItem.linkedThinkListId);
    if (linkedTL) {
      setViewingCounseleeThinkList(linkedTL);
    }
  };

  const handleOpenJournalFromHomework = (homeworkItem) => {
    if (!homeworkItem.linkedJournalingId) return;
    const linkedJn = myJournals.find(j => j.id === homeworkItem.linkedJournalingId);
    if (linkedJn) {
      setViewingMyJournal(linkedJn);
    }
  };

  const handleOpenCounseleeJournalFromHomework = (homeworkItem) => {
    if (!homeworkItem.linkedJournalingId) return;
    const linkedJn = counseleeJournals.find(j => j.id === homeworkItem.linkedJournalingId);
    if (linkedJn) {
      setViewingCounseleeJournal(linkedJn);
    }
  };

  const handleMyAddHomework = async (newHomework) => {
    if (!newHomework.title.trim()) return;
    const basePath = getMyBasePath();
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
    await addDoc(collection(db, `${basePath}/activityLog`), {
      action: 'homework_added',
      actor: 'self',
      actorUid: user.uid,
      actorName: myData?.name || 'Me',
      details: `Added "${newHomework.title}"`,
      timestamp: serverTimestamp()
    });
  };

  const handleMyEditHomework = async (item, changes) => {
    const basePath = getMyBasePath();
    await updateDoc(doc(db, `${basePath}/homework`, item.id), {
      title: changes.title,
      description: changes.description,
      weeklyTarget: parseInt(changes.weeklyTarget) || 7,
      recurring: changes.recurring
    });
  };

  const handleMyCancelHomework = async (item) => {
    const basePath = getMyBasePath();
    await updateDoc(doc(db, `${basePath}/homework`, item.id), {
      status: 'cancelled',
      cancelledAt: serverTimestamp()
    });
    await addDoc(collection(db, `${basePath}/activityLog`), {
      action: 'homework_cancelled',
      actor: 'self',
      actorUid: user.uid,
      actorName: myData?.name || 'Me',
      details: `Cancelled "${item.title}"`,
      timestamp: serverTimestamp()
    });
  };

  const handleMyReactivateHomework = async (homeworkId) => {
    const basePath = getMyBasePath();
    const item = myHomework.find(h => h.id === homeworkId);
    await updateDoc(doc(db, `${basePath}/homework`, homeworkId), {
      status: 'active',
      cancelledAt: null
    });
    await addDoc(collection(db, `${basePath}/activityLog`), {
      action: 'homework_reactivated',
      actor: 'self',
      actorUid: user.uid,
      actorName: myData?.name || 'Me',
      details: `Reactivated "${item?.title || 'homework'}"`,
      timestamp: serverTimestamp()
    });
  };

  const handleMyUncheckHomework = async (homeworkItem) => {
    if (!homeworkItem.completions?.length) return;
    const basePath = getMyBasePath();
    const updatedCompletions = homeworkItem.completions.slice(0, -1);
    await updateDoc(doc(db, `${basePath}/homework`, homeworkItem.id), {
      completions: updatedCompletions
    });
    await addDoc(collection(db, `${basePath}/activityLog`), {
      action: 'homework_unchecked',
      actor: 'self',
      actorUid: user.uid,
      actorName: myData?.name || 'Me',
      details: `Unchecked "${homeworkItem.title}"`,
      timestamp: serverTimestamp()
    });
  };

  const handleUpdateMyProfile = async (updates) => {
    // Check if SMS is being enabled for welcome message
    const wasSmsEnabled = myProfile?.smsReminders;
    const nowSmsEnabled = updates.smsReminders;
    const phone = updates.phone || myProfile?.phone;

    // Optimistically update local state so changes are available immediately
    setMyProfile(prev => ({ ...prev, ...updates }));

    const userRef = doc(db, 'users', user.uid);
    await updateDoc(userRef, updates);

    // Send welcome SMS when user enables SMS reminders (non-blocking)
    if (!wasSmsEnabled && nowSmsEnabled && phone) {
      auth.currentUser.getIdToken().then(idToken => {
        fetch('/api/toggle-counselor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
          body: JSON.stringify({ action: 'sendWelcomeSms', phone })
        }).catch(err => console.error('Welcome SMS failed:', err));
      }).catch(e => console.error('Welcome SMS token error:', e));
    }

    // Also update the data doc if name or photo changed
    const dataUpdates = {};
    if (updates.name) dataUpdates.name = updates.name;
    if (updates.photoUrl) dataUpdates.counseleePhotoUrl = updates.photoUrl;

    if (Object.keys(dataUpdates).length > 0) {
      const dataRef = doc(db, getMyBasePath());
      await updateDoc(dataRef, dataUpdates);
    }
  };

  const handleAddAccountabilityPartner = async (partnerData) => {
    // partnerData: { uid, name, email }
    // NO LINKS UNTIL ACCEPT: Send partner request email only. No data shared until they consent.
    const currentPartners = myAccountabilityPartners || [];
    const myName = myData?.name || userProfile?.name || 'User';

    // Check if already exists
    if (currentPartners.some(p => p.uid === partnerData.uid)) {
      throw new Error('This person is already your accountability partner');
    }

    // Block counselor-counselee pairing (unless graduated)
    const isMyCounselor = userProfile?.counselorId === partnerData.uid;
    const isMyCounselee = partnerData.counselorId === user.uid;
    if (isMyCounselor || isMyCounselee) {
      throw new Error('You cannot add your counselor or counselee as an accountability partner. That relationship already provides data access.');
    }

    // Send partner request email - NO Firestore links created yet
    const idToken = await auth.currentUser.getIdToken();
    const response = await fetch('/api/send-partner-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
      body: JSON.stringify({
        requesterUid: user.uid,
        requesterName: myName,
        requesterEmail: user.email,
        requesterDataPath: getMyBasePath(),
        targetUid: partnerData.uid,
        targetName: partnerData.name,
        targetEmail: partnerData.email
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to send partner request');
  };

  const handleRemoveAccountabilityPartner = async (partnerUid) => {
    const userRef = doc(db, 'users', user.uid);
    const partnerToRemove = myAccountabilityPartners.find(p => p.uid === partnerUid);

    if (!partnerToRemove) return;

    // Remove from user's accountability partners (both arrays)
    const updatedPartners = myAccountabilityPartners.filter(p => p.uid !== partnerUid);
    const updatedUids = updatedPartners.map(p => p.uid);
    await updateDoc(userRef, {
      accountabilityPartners: updatedPartners,
      accountabilityPartnerUids: updatedUids
    });

    // Also remove from the partner's "watchingUsers"
    try {
      const partnerDoc = await getDoc(doc(db, 'users', partnerUid));
      if (partnerDoc.exists()) {
        const partnerData = partnerDoc.data();
        const updatedWatching = (partnerData.watchingUsers || []).filter(w => w.uid !== user.uid);
        await updateDoc(doc(db, 'users', partnerUid), {
          watchingUsers: updatedWatching
        });
      }
    } catch (err) {
      console.error('Error removing from partner watchingUsers:', err);
    }

    // Log activity
    await addDoc(collection(db, `${getMyBasePath()}/activityLog`), {
      action: 'accountability_partner_removed',
      actor: 'self',
      actorUid: user.uid,
      actorName: myData?.name || 'Me',
      details: `Removed ${partnerToRemove.name} as accountability partner`,
      timestamp: serverTimestamp()
    });
  };

  // Share my data with a watched user (upgrade one-way to mutual)
  const handleShareMyData = async (watchedUser) => {
    try {
      const now = new Date().toISOString();
      const myName = myData?.name || userProfile?.name || 'User';
      const myBasePath = getMyBasePath();

      // Add them to my accountabilityPartners (they can now see my data)
      await updateDoc(doc(db, 'users', user.uid), {
        accountabilityPartners: arrayUnion({
          uid: watchedUser.uid, name: watchedUser.name, email: watchedUser.email, addedAt: now
        }),
        accountabilityPartnerUids: arrayUnion(watchedUser.uid)
      });

      // Add me to their watchingUsers (they can load my data)
      await updateDoc(doc(db, 'users', watchedUser.uid), {
        watchingUsers: arrayUnion({
          uid: user.uid, name: myName, email: user.email,
          dataPath: myBasePath, addedAt: now
        })
      });

      alert(`Your data is now shared with ${watchedUser.name}.`);
    } catch (err) {
      console.error('Error sharing data:', err);
      alert('Error sharing your data. Please try again.');
    }
  };

  const handleRespondToRequest = async (requestId, action) => {
    // action: 'accept', 'accept_private', or 'decline'
    const request = pendingRequests.find(r => r.id === requestId);
    if (!request) return;

    try {
      if (action === 'accept' || action === 'accept_private') {
        const { requesterUid, requesterName, requesterEmail, requesterDataPath } = request;
        const now = new Date().toISOString();
        const myName = myData?.name || userProfile?.name || 'User';
        const myBasePath = getMyBasePath();

        // Direction 1: Requester shares with me (always — I can see their data)
        await updateDoc(doc(db, 'users', requesterUid), {
          accountabilityPartners: arrayUnion({
            uid: user.uid, name: myName, email: user.email, addedAt: now
          }),
          accountabilityPartnerUids: arrayUnion(user.uid)
        });
        await updateDoc(doc(db, 'users', user.uid), {
          watchingUsers: arrayUnion({
            uid: requesterUid, name: requesterName, email: requesterEmail,
            dataPath: requesterDataPath || `counselors/${requesterUid}/counselees/${requesterUid}`,
            addedAt: now
          })
        });

        // Direction 2: I share with requester (only for mutual accept)
        if (action === 'accept') {
          await updateDoc(doc(db, 'users', user.uid), {
            accountabilityPartners: arrayUnion({
              uid: requesterUid, name: requesterName, email: requesterEmail, addedAt: now
            }),
            accountabilityPartnerUids: arrayUnion(requesterUid)
          });
          await updateDoc(doc(db, 'users', requesterUid), {
            watchingUsers: arrayUnion({
              uid: user.uid, name: myName, email: user.email,
              dataPath: myBasePath, addedAt: now
            })
          });
        }
      }

      // Update request status
      const statusMap = { accept: 'accepted', accept_private: 'accepted_private', decline: 'rejected' };
      await updateDoc(doc(db, 'partnerRequests', requestId), {
        status: statusMap[action] || action,
        respondedAt: serverTimestamp()
      });

      setRespondingTo(null);
    } catch (err) {
      console.error('Error responding to partner request:', err);
      alert('Error processing your response. Please try again.');
    }
  };

  // ========== COUNSELEE SECTION HANDLERS ==========

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
          throw new Error(data.message || data.error || 'Failed to create account');
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
        smsReminders: true,
        reminderSchedule: defaultSchedule
      };
      if (hasEmail) {
        counseleeDoc.email = newCounselee.email;
        counseleeDoc.uid = uid;
      }

      const counseleeRef = await addDoc(collection(db, `counselors/${user.uid}/counselees`), counseleeDoc);

      // Auto-promote to counselor when adding first counselee
      if (!isCounselor) {
        await updateDoc(doc(db, 'users', user.uid), { isCounselor: true });
      }

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
          email: newCounselee.email.toLowerCase(),
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
      setFormError(error.message);
    } finally {
      setFormLoading(false);
    }
  };

  // Activate login for an offline counselee (no email/uid yet)
  const handleActivateLogin = async (email, password) => {
    if (!email.trim() || !password.trim()) throw new Error('Email and password are required');
    if (password.length < 6) throw new Error('Password must be at least 6 characters');

    const idToken = await auth.currentUser.getIdToken();
    const response = await fetch('/api/create-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({
        email,
        password,
        counselorId: user.uid,
        name: selectedCounselee.name
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || data.error || 'Failed to create account');

    const basePath = `counselors/${user.uid}/counselees`;

    // Update counselee doc with email + uid
    await updateDoc(doc(db, basePath, selectedCounselee.id), {
      email: email,
      uid: data.uid,
      emailReminders: true
    });

    // Create counseleeLinks
    const emailKey = email.toLowerCase().replace(/[.]/g, '_');
    await setDoc(doc(db, 'counseleeLinks', emailKey), {
      counselorId: user.uid,
      counseleeDocId: selectedCounselee.id,
      email: email.toLowerCase(),
      name: selectedCounselee.name
    });

    // Create users doc
    await setDoc(doc(db, 'users', data.uid), {
      email: email.toLowerCase(),
      name: selectedCounselee.name,
      role: 'counselee',
      counselorId: user.uid,
      counseleeDocId: selectedCounselee.id,
      createdAt: serverTimestamp(),
      onboardingStep: 0
    });

    // Update local state
    setSelectedCounselee(prev => ({ ...prev, email, uid: data.uid, emailReminders: true }));
  };

  const getLinkedSpouse = (counseleeId) => getLinkedSpouseUtil(counseleeId, counselees);

  const handleAddCounseleeSession = async (isJoint = false) => {
    // Use session template if available
    const templateNotes = myProfile?.sessionTemplate || '';
    const sessionData = {
      date: serverTimestamp(),
      notes: templateNotes,
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
        // Update original with link back
        await updateDoc(doc(db, `counselors/${user.uid}/counselees/${selectedCounselee.id}/sessions`, sessionRef.id), {
          isJoint: true,
          linkedSessionId: spouseSessionRef.id,
          linkedCounseleeId: spouse.id
        });
      }
    }

    setSelectedCounseleeSession({ id: sessionRef.id, date: new Date(), notes: templateNotes, homeworkAssigned: [], isJoint: isJoint || false });
    setCounseleeSessionNotes(templateNotes);
  };

  const handleDeleteCounseleeSession = async () => {
    if (!selectedCounseleeSession || !selectedCounselee) return;
    const isJoint = selectedCounseleeSession.isJoint && selectedCounseleeSession.linkedSessionId;
    const msg = isJoint
      ? 'Delete this joint session? It will be removed from both spouses. This cannot be undone.'
      : 'Delete this session? This cannot be undone.';
    if (!window.confirm(msg)) return;

    // Delete the linked spouse session first if joint
    if (isJoint) {
      try {
        await deleteDoc(doc(db, `counselors/${user.uid}/counselees/${selectedCounseleeSession.linkedCounseleeId}/sessions`, selectedCounseleeSession.linkedSessionId));
      } catch (e) {
        console.error('Failed to delete linked session:', e);
      }
    }

    await deleteDoc(doc(db, `counselors/${user.uid}/counselees/${selectedCounselee.id}/sessions`, selectedCounseleeSession.id));
    setSelectedCounseleeSession(null);
    setCounseleeSessionNotes('');
  };

  const handleCounseleeAddHomework = async (newHomework) => {
    if (!newHomework.title.trim()) return;
    const sessionDate = selectedCounseleeSession?.date?.toDate
      ? selectedCounseleeSession.date.toDate()
      : selectedCounseleeSession?.date || new Date();
    const basePath = `counselors/${user.uid}/counselees/${selectedCounselee.id}`;

    await addDoc(collection(db, `${basePath}/homework`), {
      title: newHomework.title,
      description: newHomework.description || '',
      recurring: newHomework.recurring !== false,
      assignedBy: 'counselor',
      assignedDate: sessionDate,
      sessionId: selectedCounseleeSession?.id || null,
      status: 'active',
      completions: [],
      weeklyTarget: parseInt(newHomework.weeklyTarget) || 7
    });

    await addDoc(collection(db, `${basePath}/activityLog`), {
      action: 'homework_added',
      actor: 'counselor',
      actorUid: user.uid,
      actorName: userProfile?.name || 'Counselor',
      details: `Assigned "${newHomework.title}"`,
      timestamp: serverTimestamp()
    });
  };

  const handleCounseleeEditHomework = async (item, changes) => {
    const basePath = `counselors/${user.uid}/counselees/${selectedCounselee.id}`;
    const updateData = {
      title: changes.title,
      description: changes.description,
      recurring: changes.recurring,
      weeklyTarget: parseInt(changes.weeklyTarget) || 7
    };
    if (changes.assignedDate) {
      updateData.assignedDate = new Date(changes.assignedDate);
    }
    await updateDoc(doc(db, `${basePath}/homework`, item.id), updateData);
    await addDoc(collection(db, `${basePath}/activityLog`), {
      action: 'homework_edited',
      actor: 'counselor',
      actorUid: user.uid,
      actorName: userProfile?.name || 'Counselor',
      details: `Edited "${changes.title}"`,
      timestamp: serverTimestamp()
    });
  };

  const handleCounseleeDeleteHomework = async (homeworkId) => {
    if (!window.confirm('Permanently delete this homework? This cannot be undone.')) return;
    const basePath = `counselors/${user.uid}/counselees/${selectedCounselee.id}`;
    const item = counseleeHomework.find(h => h.id === homeworkId);
    await deleteDoc(doc(db, `${basePath}/homework`, homeworkId));
    await addDoc(collection(db, `${basePath}/activityLog`), {
      action: 'homework_deleted',
      actor: 'counselor',
      actorUid: user.uid,
      actorName: userProfile?.name || 'Counselor',
      details: `Deleted "${item?.title || 'homework'}"`,
      timestamp: serverTimestamp()
    });
  };

  const handleCounseleeCancelHomework = async (item) => {
    const basePath = `counselors/${user.uid}/counselees/${selectedCounselee.id}`;
    await updateDoc(doc(db, `${basePath}/homework`, item.id), {
      status: 'cancelled',
      cancelledAt: serverTimestamp()
    });
    await addDoc(collection(db, `${basePath}/activityLog`), {
      action: 'homework_cancelled',
      actor: 'counselor',
      actorUid: user.uid,
      actorName: userProfile?.name || 'Counselor',
      details: `Cancelled "${item.title}"`,
      timestamp: serverTimestamp()
    });
  };

  const handleCounseleeReactivateHomework = async (homeworkId) => {
    const basePath = `counselors/${user.uid}/counselees/${selectedCounselee.id}`;
    const item = counseleeHomework.find(h => h.id === homeworkId);
    await updateDoc(doc(db, `${basePath}/homework`, homeworkId), {
      status: 'active',
      cancelledAt: null
    });
    await addDoc(collection(db, `${basePath}/activityLog`), {
      action: 'homework_reactivated',
      actor: 'counselor',
      actorUid: user.uid,
      actorName: userProfile?.name || 'Counselor',
      details: `Reactivated "${item?.title || 'homework'}"`,
      timestamp: serverTimestamp()
    });
  };

  const handleCounseleeCompleteHomework = async (homeworkItem) => {
    if (completingId) return;
    setCompletingId(homeworkItem.id);
    try {
      const basePath = `counselors/${user.uid}/counselees/${selectedCounselee.id}`;
      await updateDoc(doc(db, `${basePath}/homework`, homeworkItem.id), {
        completions: arrayUnion(Timestamp.now())
      });
      await addDoc(collection(db, `${basePath}/activityLog`), {
        action: 'homework_completed',
        actor: 'counselor',
        actorUid: user.uid,
        actorName: userProfile?.name || 'Counselor',
        details: `Completed "${homeworkItem.title}" (marked by counselor)`,
        timestamp: serverTimestamp()
      });
    } finally {
      setCompletingId(null);
    }
  };

  const handleCounseleeUncheckHomework = async (homeworkItem) => {
    if (!homeworkItem.completions?.length) return;
    const basePath = `counselors/${user.uid}/counselees/${selectedCounselee.id}`;
    const updatedCompletions = homeworkItem.completions.slice(0, -1);
    await updateDoc(doc(db, `${basePath}/homework`, homeworkItem.id), {
      completions: updatedCompletions
    });
    await addDoc(collection(db, `${basePath}/activityLog`), {
      action: 'homework_unchecked',
      actor: 'counselor',
      actorUid: user.uid,
      actorName: userProfile?.name || 'Counselor',
      details: `Unchecked "${homeworkItem.title}"`,
      timestamp: serverTimestamp()
    });
  };

  const handleCounseleePhotoUpdate = async (url, fieldName = 'photoUrl') => {
    await updateDoc(
      doc(db, `counselors/${user.uid}/counselees`, selectedCounselee.id),
      { [fieldName]: url }
    );
    setSelectedCounselee(prev => ({ ...prev, [fieldName]: url }));
  };

  const handleLinkFamily = async (linkedCounseleeId, relationship) => {
    const currentLinks = selectedCounselee.linkedFamily || [];
    if (currentLinks.some(link => link.counseleeId === linkedCounseleeId)) {
      throw new Error('This person is already linked');
    }
    await updateDoc(
      doc(db, `counselors/${user.uid}/counselees`, selectedCounselee.id),
      { linkedFamily: [...currentLinks, { counseleeId: linkedCounseleeId, relationship }] }
    );
    const otherCounselee = counselees.find(c => c.id === linkedCounseleeId);
    const otherLinks = otherCounselee?.linkedFamily || [];
    const reciprocalRelationship = relationship === 'spouse' ? 'spouse' :
                                   relationship === 'parent' ? 'child' :
                                   relationship === 'child' ? 'parent' :
                                   relationship === 'sibling' ? 'sibling' : 'other';
    await updateDoc(
      doc(db, `counselors/${user.uid}/counselees`, linkedCounseleeId),
      { linkedFamily: [...otherLinks, { counseleeId: selectedCounselee.id, relationship: reciprocalRelationship }] }
    );
  };

  const handleDeleteCounselee = async () => {
    if (!window.confirm(`Delete ${selectedCounselee.name}? This cannot be undone.`)) return;
    try {
      if (selectedCounselee.uid) {
        const idToken = await auth.currentUser.getIdToken();
        await fetch('/api/delete-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({ uid: selectedCounselee.uid, counselorId: user.uid })
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
      alert('Error deleting counselee');
    }
  };

  const handleGraduateCounselee = async (graduate = true) => {
    const basePath = `counselors/${user.uid}/counselees`;
    await updateDoc(doc(db, basePath, selectedCounselee.id), { graduated: graduate });
    setSelectedCounselee(prev => ({ ...prev, graduated: graduate }));
    await addDoc(collection(db, `${basePath}/${selectedCounselee.id}/activityLog`), {
      action: graduate ? 'counselee_graduated' : 'counselee_reactivated',
      actor: 'counselor',
      actorUid: user.uid,
      actorName: userProfile?.name || 'Counselor',
      details: graduate ? 'Counselee graduated/archived' : 'Counselee reactivated',
      timestamp: serverTimestamp()
    });
  };

  const handleCounseleeNotesChange = async (newNotes) => {
    setCounseleeSessionNotes(newNotes);
    if (selectedCounseleeSession) {
      await updateDoc(
        doc(db, `counselors/${user.uid}/counselees/${selectedCounselee.id}/sessions`, selectedCounseleeSession.id),
        { notes: newNotes }
      );
      // Sync to linked spouse session if joint
      if (selectedCounseleeSession.isJoint && selectedCounseleeSession.linkedSessionId) {
        try {
          await updateDoc(
            doc(db, `counselors/${user.uid}/counselees/${selectedCounseleeSession.linkedCounseleeId}/sessions`, selectedCounseleeSession.linkedSessionId),
            { notes: newNotes }
          );
        } catch (e) {
          console.error('Failed to sync notes to spouse session:', e);
        }
      }
    }
  };

  // Session navigation for counselee detail
  const currentCounseleeSessionIndex = selectedCounseleeSession
    ? counseleeSessions.findIndex(s => s.id === selectedCounseleeSession.id)
    : -1;
  const hasNewerCounseleeSession = currentCounseleeSessionIndex > 0;
  const hasOlderCounseleeSession = currentCounseleeSessionIndex < counseleeSessions.length - 1;

  const navigateCounseleeSession = (direction) => {
    if (direction === 'newer' && hasNewerCounseleeSession) {
      const session = counseleeSessions[currentCounseleeSessionIndex - 1];
      setSelectedCounseleeSession(session);
      setCounseleeSessionNotes(session.notes || '');
    } else if (direction === 'older' && hasOlderCounseleeSession) {
      const session = counseleeSessions[currentCounseleeSessionIndex + 1];
      setSelectedCounseleeSession(session);
      setCounseleeSessionNotes(session.notes || '');
    }
  };

  // ========== RENDER ==========

  // Full-page overlays for "Me" section
  if (viewingMyHeartJournal) {
    return (
      <HeartJournalPage
        userProfile={getMyUserProfile()}
        editingJournal={viewingMyHeartJournal}
        onClose={() => setViewingMyHeartJournal(null)}
        onSaved={() => setViewingMyHeartJournal(null)}
      />
    );
  }

  if (viewingMyThinkList) {
    return (
      <ThinkListPage
        userProfile={getMyUserProfile()}
        editingThinkList={viewingMyThinkList.id ? viewingMyThinkList : null}
        thinkLists={myThinkLists}
        homework={myHomework}
        onNavigate={(tl) => setViewingMyThinkList(tl)}
        onClose={() => setViewingMyThinkList(null)}
        onSaved={() => setViewingMyThinkList(null)}
        role="counselee"
      />
    );
  }

  if (showMyActivityHistory) {
    return (
      <ActivityHistoryPage
        activityLog={myActivityLog}
        homework={myHomework}
        counseleeName={myData?.name || 'Me'}
        onClose={() => setShowMyActivityHistory(false)}
      />
    );
  }

  if (viewingMyJournal) {
    return (
      <JournalingPage
        userProfile={getMyUserProfile()}
        editingJournal={viewingMyJournal.id ? viewingMyJournal : null}
        journals={myJournals}
        homework={myHomework}
        onNavigate={(j) => setViewingMyJournal(j)}
        basePath={getMyBasePath()}
        role="counselee"
        onClose={() => setViewingMyJournal(null)}
        onSaved={() => setViewingMyJournal(null)}
      />
    );
  }

  if (viewingMyPrayerRequest) {
    return (
      <PrayerRequestPage
        user={user}
        userProfile={userProfile}
        editingPR={viewingMyPrayerRequest.id ? viewingMyPrayerRequest : null}
        onClose={() => setViewingMyPrayerRequest(null)}
        onSaved={() => setViewingMyPrayerRequest(null)}
        getAuthToken={() => auth.currentUser.getIdToken()}
      />
    );
  }

  // "Me" section session detail view
  if (selectedMySession) {
    // Session navigation
    const currentIndex = mySessions.findIndex(s => s.id === selectedMySession.id);
    const hasNewer = currentIndex > 0;
    const hasOlder = currentIndex >= 0 && currentIndex < mySessions.length - 1;

    const navigateMySession = (direction) => {
      if (direction === 'newer' && hasNewer) {
        const session = mySessions[currentIndex - 1];
        setSelectedMySession(session);
        setMySessionNotes(session.counseleeNotes || '');
      } else if (direction === 'older' && hasOlder) {
        const session = mySessions[currentIndex + 1];
        setSelectedMySession(session);
        setMySessionNotes(session.counseleeNotes || '');
      }
    };

    const handleMySessionNotesChange = async (newNotes) => {
      setMySessionNotes(newNotes);
      const basePath = getMyBasePath();
      await updateDoc(doc(db, `${basePath}/sessions`, selectedMySession.id), {
        counseleeNotes: newNotes
      });
    };

    return (
      <div className="dashboard">
        <header>
          <button className="back-btn" onClick={() => setSelectedMySession(null)}>&larr; Back</button>
          <div className="session-nav">
            <button className="nav-arrow" onClick={() => navigateMySession('newer')} disabled={!hasNewer} title="Newer session">&larr;</button>
            <span className="session-nav-label">{formatDate(selectedMySession.date)}</span>
            <button className="nav-arrow" onClick={() => navigateMySession('older')} disabled={!hasOlder} title="Older session">&rarr;</button>
          </div>
        </header>
        <main>
          <div className="session-columns">
            <div className="session-homework-column">
              <HomeworkTile
                homework={myHomework}
                role="counselee"
                onComplete={handleMyComplete}
                onUncheck={handleMyUncheckHomework}
                onEdit={handleMyEditHomework}
                onCancel={handleMyCancelHomework}
                onReactivate={handleMyReactivateHomework}
                onAdd={handleMyAddHomework}
                completingId={completingId}
                onOpenThinkList={handleOpenThinkListFromHomework}
                onOpenJournal={handleOpenJournalFromHomework}
              />
            </div>
            <div className="session-notes-column">
              <div className="tile">
                <div className="tile-header">
                  <h3>My Notes</h3>
                </div>
                <div className="tile-content">
                  <RichTextEditor
                    content={mySessionNotes}
                    onChange={handleMySessionNotesChange}
                    placeholder="Your private notes for this session..."
                  />
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Full-page overlays for counselee detail
  if (viewingCounseleeHeartJournal && selectedCounselee) {
    return (
      <HeartJournalPage
        userProfile={{ uid: user.uid, counselorId: user.uid, counseleeDocId: selectedCounselee.id, name: selectedCounselee.name }}
        editingJournal={viewingCounseleeHeartJournal}
        role="counselor"
        onClose={() => setViewingCounseleeHeartJournal(null)}
        onSaved={() => setViewingCounseleeHeartJournal(null)}
      />
    );
  }

  if (viewingCounseleeThinkList && selectedCounselee) {
    return (
      <ThinkListPage
        userProfile={{ uid: user.uid, counselorId: user.uid, counseleeDocId: selectedCounselee.id, name: selectedCounselee.name }}
        editingThinkList={viewingCounseleeThinkList.id ? viewingCounseleeThinkList : null}
        thinkLists={counseleeThinkLists}
        onNavigate={(tl) => setViewingCounseleeThinkList(tl)}
        basePath={`counselors/${user.uid}/counselees/${selectedCounselee.id}`}
        role="counselor"
        onClose={() => setViewingCounseleeThinkList(null)}
        onSaved={() => setViewingCounseleeThinkList(null)}
      />
    );
  }

  if (showCounseleeActivityHistory && selectedCounselee) {
    return (
      <ActivityHistoryPage
        activityLog={counseleeActivityLog}
        homework={counseleeHomework}
        counseleeName={selectedCounselee.name}
        onClose={() => setShowCounseleeActivityHistory(false)}
      />
    );
  }

  if (viewingCounseleeJournal && selectedCounselee) {
    return (
      <JournalingPage
        userProfile={{ uid: user.uid, counselorId: user.uid, counseleeDocId: selectedCounselee.id, name: selectedCounselee.name }}
        editingJournal={viewingCounseleeJournal.id ? viewingCounseleeJournal : null}
        journals={counseleeJournals}
        onNavigate={(j) => setViewingCounseleeJournal(j)}
        basePath={`counselors/${user.uid}/counselees/${selectedCounselee.id}`}
        role="counselor"
        onClose={() => setViewingCounseleeJournal(null)}
        onSaved={() => setViewingCounseleeJournal(null)}
      />
    );
  }

  // Counselee session detail view
  if (selectedCounseleeSession && selectedCounselee) {
    const filteredHomework = sessionFilterOnly
      ? counseleeHomework.filter(h => h.sessionId === selectedCounseleeSession.id)
      : counseleeHomework;

    const getSessionDateTimeValue = () => {
      if (!selectedCounseleeSession.date) return '';
      const d = selectedCounseleeSession.date.toDate ? selectedCounseleeSession.date.toDate() : new Date(selectedCounseleeSession.date);
      const pad = (n) => n.toString().padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    const handleDateChange = async (newDate) => {
      const newDateObj = new Date(newDate);
      setSelectedCounseleeSession(prev => ({ ...prev, date: newDateObj }));
      setDateSaveStatus('saving');
      await updateDoc(
        doc(db, `counselors/${user.uid}/counselees/${selectedCounselee.id}/sessions`, selectedCounseleeSession.id),
        { date: newDateObj }
      );
      // Sync date to linked spouse session if joint
      if (selectedCounseleeSession.isJoint && selectedCounseleeSession.linkedSessionId) {
        try {
          await updateDoc(
            doc(db, `counselors/${user.uid}/counselees/${selectedCounseleeSession.linkedCounseleeId}/sessions`, selectedCounseleeSession.linkedSessionId),
            { date: newDateObj }
          );
        } catch (e) {
          console.error('Failed to sync date to spouse session:', e);
        }
      }
      setDateSaveStatus('saved');
      setTimeout(() => setDateSaveStatus(null), 2000);
    };

    const handleDurationChange = async (minutes) => {
      const duration = minutes === '' ? null : Number(minutes);
      setSelectedCounseleeSession(prev => ({ ...prev, duration }));
      setDateSaveStatus('saving');
      await updateDoc(
        doc(db, `counselors/${user.uid}/counselees/${selectedCounselee.id}/sessions`, selectedCounseleeSession.id),
        { duration: duration || null }
      );
      if (selectedCounseleeSession.isJoint && selectedCounseleeSession.linkedSessionId) {
        try {
          await updateDoc(
            doc(db, `counselors/${user.uid}/counselees/${selectedCounseleeSession.linkedCounseleeId}/sessions`, selectedCounseleeSession.linkedSessionId),
            { duration: duration || null }
          );
        } catch (e) {
          console.error('Failed to sync duration to spouse session:', e);
        }
      }
      setDateSaveStatus('saved');
      setTimeout(() => setDateSaveStatus(null), 2000);
    };

    return (
      <div className="dashboard">
        <header>
          <button className="back-btn" onClick={() => setSelectedCounseleeSession(null)}>&larr; Back</button>
          <div className="session-nav">
            <button className="nav-arrow" onClick={() => navigateCounseleeSession('newer')} disabled={!hasNewerCounseleeSession} title="Newer session">&larr;</button>
            <span className="session-nav-label">
              {selectedCounselee.name}
              {selectedCounseleeSession.isJoint && (() => {
                const spouse = counselees.find(c => c.id === selectedCounseleeSession.linkedCounseleeId);
                return <span className="joint-session-label"> &amp; {spouse?.name || 'Spouse'}</span>;
              })()}
            </span>
            <button className="nav-arrow" onClick={() => navigateCounseleeSession('older')} disabled={!hasOlderCounseleeSession} title="Older session">&rarr;</button>
          </div>
        </header>
        <main>
          <div className="session-date-row">
            <label>Session:</label>
            <input type="datetime-local" value={getSessionDateTimeValue()} onChange={(e) => handleDateChange(e.target.value)} className="session-date-input" />
            <select
              className="session-duration-select"
              value={selectedCounseleeSession.duration || ''}
              onChange={(e) => handleDurationChange(e.target.value)}
            >
              <option value="">—</option>
              <option value="30">30m</option>
              <option value="45">45m</option>
              <option value="60">1h</option>
              <option value="75">1h15</option>
              <option value="90">1h30</option>
              <option value="105">1h45</option>
              <option value="120">2h</option>
              <option value="150">2h30</option>
              <option value="180">3h</option>
            </select>
            {dateSaveStatus && <span className={`save-status ${dateSaveStatus}`}>{dateSaveStatus === 'saving' ? 'Saving...' : '✓ Saved'}</span>}
            {selectedCounseleeSession.isJoint && <span className="joint-badge">Joint</span>}
            <button className="delete-session-btn" onClick={handleDeleteCounseleeSession} title="Delete this session">Delete Session</button>
          </div>
          <div className="session-columns">
            <div className="session-homework-column">
              <HomeworkTile homework={filteredHomework} role="counselor" showSessionFilter={true} sessionFilterOnly={sessionFilterOnly} onSessionFilterChange={setSessionFilterOnly} onEdit={handleCounseleeEditHomework} onCancel={handleCounseleeCancelHomework} onReactivate={handleCounseleeReactivateHomework} onUncheck={handleCounseleeUncheckHomework} onDelete={handleCounseleeDeleteHomework} onAdd={handleCounseleeAddHomework} onOpenThinkList={handleOpenCounseleeThinkListFromHomework} onOpenJournal={handleOpenCounseleeJournalFromHomework} onComplete={handleCounseleeCompleteHomework} completingId={completingId} />
            </div>
            <div className="session-notes-column">
              <Tile title="Session Notes">
                <RichTextEditor content={counseleeSessionNotes} onChange={handleCounseleeNotesChange} placeholder="Enter session notes here..." />
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
        <main>
          <div className="a-contact-info-row">
            <div className="a-contact-photos">
              <div className="photo-with-label">
                <ProfilePhoto photoUrl={selectedCounselee.photoUrl} counselorId={user.uid} counseleeId={selectedCounselee.id} onPhotoUpdate={handleCounseleePhotoUpdate} editable={true} size="medium" uploadedBy="counselor" />
                <span className="photo-label">Counselor</span>
              </div>
              <div className="photo-with-label">
                <ProfilePhoto photoUrl={selectedCounselee.counseleePhotoUrl} size="medium" />
                <span className="photo-label">Counselee</span>
              </div>
            </div>
            <div className="a-contact-details">
              <p>{selectedCounselee.email ? <a href={`mailto:${selectedCounselee.email}`} className="contact-link" onClick={(e) => { e.stopPropagation(); window.location.href = `mailto:${selectedCounselee.email}`; }}>{selectedCounselee.email}</a> : 'No email'}</p>
              <p>{selectedCounselee.phone ? <a href={`tel:${selectedCounselee.phone.replace(/\D/g, '')}`} className="contact-link" onClick={(e) => { e.stopPropagation(); window.open(`tel:${selectedCounselee.phone.replace(/\D/g, '')}`, '_self'); }}>{formatPhone(selectedCounselee.phone)}</a> : 'No phone'}</p>
              {selectedCounselee.linkedFamily?.length > 0 && (
                <div className="linked-family-inline">
                  <span className="family-label">Linked:</span>
                  {selectedCounselee.linkedFamily.map(member => {
                    const linked = counselees.find(c => c.id === member.counseleeId);
                    return linked ? <button key={member.counseleeId} className="linked-family-btn" onClick={() => setSelectedCounselee(linked)}>{linked.name} ({member.relationship})</button> : null;
                  })}
                </div>
              )}
            </div>
            <div className="a-contact-actions">
              <button className="add-family-btn" onClick={() => setShowFamilyLinkModal(true)}>+ Link Family</button>
              {!selectedCounselee.uid && (
                <button className="activate-login-btn" onClick={() => setShowActivateForm(true)}>Activate Login</button>
              )}
              {selectedCounselee.graduated ? (
                <button className="reactivate-btn" onClick={() => handleGraduateCounselee(false)}>Reactivate</button>
              ) : (
                <button className="graduate-btn" onClick={() => handleGraduateCounselee(true)}>Graduate</button>
              )}
              <button className="activity-icon-btn" onClick={() => setShowCounseleeActivityHistory(true)} title="Activity History">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
                </svg>
              </button>
            </div>
          </div>
          {selectedCounselee.uid && (
            <div className="a-encouragement-row">
              {renderSendButtons(selectedCounselee.uid)}
              {renderMessageInput(selectedCounselee.uid)}
            </div>
          )}
          {showActivateForm && !selectedCounselee.uid && (
            <form className="add-form activate-form" onSubmit={async (e) => {
              e.preventDefault();
              setActivateError('');
              setActivateLoading(true);
              try {
                await handleActivateLogin(activateEmail, activatePassword);
                setShowActivateForm(false);
                setActivateEmail('');
                setActivatePassword('');
              } catch (err) {
                setActivateError(err.message);
              } finally {
                setActivateLoading(false);
              }
            }}>
              <strong>Activate Login for {selectedCounselee.name}</strong>
              <input type="email" placeholder="Email" value={activateEmail} onChange={(e) => setActivateEmail(e.target.value)} required />
              <input type="text" placeholder="Temp Password (min 6 chars)" value={activatePassword} onChange={(e) => setActivatePassword(e.target.value)} required />
              {activateError && <div className="error">{activateError}</div>}
              <div className="form-buttons">
                <button type="submit" disabled={activateLoading}>{activateLoading ? 'Activating...' : 'Activate'}</button>
                <button type="button" onClick={() => { setShowActivateForm(false); setActivateError(''); }}>Cancel</button>
              </div>
            </form>
          )}
          <FamilyLinkModal isOpen={showFamilyLinkModal} onClose={() => setShowFamilyLinkModal(false)} counselees={counselees} currentCounseleeId={selectedCounselee.id} onLink={handleLinkFamily} onAddCounselee={() => { setSelectedCounselee(null); setShowAddForm(true); }} />
          <div className="b-dashboard-grid">
            <div className="b-dashboard-left">
              <HomeworkTile homework={counseleeHomework} role="counselor" onEdit={handleCounseleeEditHomework} onCancel={handleCounseleeCancelHomework} onReactivate={handleCounseleeReactivateHomework} onUncheck={handleCounseleeUncheckHomework} onDelete={handleCounseleeDeleteHomework} onAdd={handleCounseleeAddHomework} onOpenThinkList={handleOpenCounseleeThinkListFromHomework} onOpenJournal={handleOpenCounseleeJournalFromHomework} onComplete={handleCounseleeCompleteHomework} completingId={completingId} />
              <Tile title={`Sessions (${counseleeSessions.length})`} action={
                getLinkedSpouse(selectedCounselee.id) ? (
                  <span className="session-add-group">
                    <button className="add-btn" onClick={() => handleAddCounseleeSession(true)}>+ Joint Session</button>
                    <button className="add-btn add-btn-secondary" onClick={() => handleAddCounseleeSession(false)}>+ Solo</button>
                  </span>
                ) : (
                  <button className="add-btn" onClick={() => handleAddCounseleeSession(false)}>+ Session</button>
                )
              }>
                {counseleeSessions.length === 0 ? (
                  <p className="empty-list">No sessions yet. Click "+ Session" to start.</p>
                ) : (
                  <ul className="session-list">
                    {counseleeSessions.map(session => (
                      <li key={session.id} className="session-item" onClick={() => { setSelectedCounseleeSession(session); setCounseleeSessionNotes(session.notes || ''); }}>
                        <span className="session-date">
                          {formatDate(session.date)}
                          {session.isJoint && <span className="joint-badge" title="Joint session with spouse">Joint</span>}
                        </span>
                        <span className="session-meta">{counseleeHomework.filter(h => h.sessionId === session.id).length} homework</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Tile>
              {selectedCounselee?.uid && (
                <PrayerRequestsTile
                  user={user}
                  userProfile={userProfile}
                  role="counselor"
                  targetUid={selectedCounselee.uid}
                  targetName={selectedCounselee.name}
                  getAuthToken={() => auth.currentUser.getIdToken()}
                />
              )}
            </div>
            <div className="b-dashboard-right">
              <HeartJournalsTile journals={counseleeHeartJournals} role="counselor" onView={(j) => setViewingCounseleeHeartJournal(j)} />
              <ThinkListsTile thinkLists={counseleeThinkLists} role="counselor" onView={(tl) => setViewingCounseleeThinkList(tl)} onAdd={() => setViewingCounseleeThinkList({})} />
              <JournalingTile journals={counseleeJournals} role="counselor" onView={(j) => setViewingCounseleeJournal(j)} onAdd={() => setViewingCounseleeJournal({})} />
            </div>
          </div>
          {renderMessageModal()}
          {renderToast()}
          {renderEncouragementDetailModal()}
          <OnboardingModal
            dataLoaded={!!myData}
            step={myData?.onboardingStep}
            lastSeen={myData?.onboardingLastSeen}
            onDismiss={(stepIndex) => {
              const myRef = doc(db, getMyBasePath());
              updateDoc(myRef, { onboardingStep: stepIndex + 1, onboardingLastSeen: Timestamp.now() });
            }}
          />
        </main>
      </div>
    );
  }

  // Watched user full-page overlays (read-only accountability view)
  if (viewingWatchedHeartJournal && selectedWatchedUser) {
    return (
      <HeartJournalPage
        userProfile={{ name: selectedWatchedUser.name }}
        editingJournal={viewingWatchedHeartJournal}
        role="accountability"
        readOnly={true}
        onClose={() => setViewingWatchedHeartJournal(null)}
        onSaved={() => setViewingWatchedHeartJournal(null)}
      />
    );
  }

  if (viewingWatchedThinkList && selectedWatchedUser) {
    return (
      <ThinkListPage
        userProfile={{ name: selectedWatchedUser.name }}
        editingThinkList={viewingWatchedThinkList.id ? viewingWatchedThinkList : null}
        thinkLists={watchedUserThinkLists}
        onNavigate={(tl) => setViewingWatchedThinkList(tl)}
        role="accountability"
        readOnly={true}
        onClose={() => setViewingWatchedThinkList(null)}
        onSaved={() => setViewingWatchedThinkList(null)}
      />
    );
  }

  if (showWatchedActivityHistory && selectedWatchedUser) {
    return (
      <ActivityHistoryPage
        activityLog={watchedUserActivityLog}
        homework={watchedUserHomework}
        counseleeName={selectedWatchedUser.name}
        onClose={() => setShowWatchedActivityHistory(false)}
      />
    );
  }

  if (viewingWatchedJournal && selectedWatchedUser) {
    return (
      <JournalingPage
        userProfile={{ name: selectedWatchedUser.name }}
        editingJournal={viewingWatchedJournal.id ? viewingWatchedJournal : null}
        journals={watchedUserJournals}
        onNavigate={(j) => setViewingWatchedJournal(j)}
        role="accountability"
        readOnly={true}
        onClose={() => setViewingWatchedJournal(null)}
        onSaved={() => setViewingWatchedJournal(null)}
      />
    );
  }


  // Watched user view (read-only accountability view)
  if (selectedWatchedUser) {
    return (
      <div className="dashboard">
        <header>
          <button className="back-btn" onClick={() => setSelectedWatchedUser(null)}>&larr; Back</button>
          <h1>{selectedWatchedUser.name}</h1>
        </header>
        <main>
          <div className="accountability-view-header">
            <span className="accountability-badge">Accountability View (Read Only)</span>
            {!myAccountabilityPartners.some(p => p.uid === selectedWatchedUser.uid) && (
              <button className="ap-share-btn" onClick={() => handleShareMyData(selectedWatchedUser)}>
                Share My Data
              </button>
            )}
          </div>
          <div className="ap-info-bar">
            <div className="ap-info-details">
              <span className="ap-info-name">{selectedWatchedUser.name}</span>
              <a href={`mailto:${selectedWatchedUser.email}`} className="ap-info-email">{selectedWatchedUser.email}</a>
              {watchedUserProfile?.phone && (
                <a href={`tel:${watchedUserProfile.phone.replace(/\D/g, '')}`} className="ap-info-phone">{formatPhone(watchedUserProfile.phone)}</a>
              )}
            </div>
            <div className="ap-info-streaks">
              <button className="activity-icon-btn" onClick={() => setShowWatchedActivityHistory(true)} title="Activity History">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
                </svg>
              </button>
              {(() => {
                const statusData = watchingUsersStatus[selectedWatchedUser.uid] || {};
                const streak = statusData.streak || 0;
                const weekStr = statusData.weekStreak || 0;
                return (
                  <>
                    <div className="ap-info-streak-group">
                      <div className="ap-info-streak-circle" style={{ backgroundColor: streak > 0 ? '#38a169' : '#a0aec0' }}>
                        {streak}
                      </div>
                      <span className="ap-info-streak-label">day{streak !== 1 ? 's' : ''}</span>
                    </div>
                    {weekStr > 0 && (
                      <div className="ap-info-streak-group">
                        <div className="ap-info-streak-circle" style={{ backgroundColor: '#2b6cb0' }}>
                          {weekStr}
                        </div>
                        <span className="ap-info-streak-label">week{weekStr !== 1 ? 's' : ''}</span>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
          {renderSendButtons(selectedWatchedUser.uid)}
          {renderMessageInput(selectedWatchedUser.uid)}
          <div className="b-dashboard-grid">
            <div className="b-dashboard-left">
              <HomeworkTile
                homework={watchedUserHomework}
                role="accountability"
                readOnly={true}
              />
              {selectedWatchedUser?.uid && (
                <PrayerRequestsTile
                  user={user}
                  userProfile={userProfile}
                  role="accountability"
                  targetUid={selectedWatchedUser.uid}
                  targetName={selectedWatchedUser.name}
                  getAuthToken={() => auth.currentUser.getIdToken()}
                />
              )}
            </div>
            <div className="b-dashboard-right">
              <HeartJournalsTile
                journals={watchedUserHeartJournals}
                role="accountability"
                onView={(j) => setViewingWatchedHeartJournal(j)}
              />
              <ThinkListsTile
                thinkLists={watchedUserThinkLists}
                role="accountability"
                onView={(tl) => setViewingWatchedThinkList(tl)}
              />
              <JournalingTile
                journals={watchedUserJournals}
                role="accountability"
                onView={(j) => setViewingWatchedJournal(j)}
              />
            </div>
          </div>
          {renderMessageModal()}
          {renderToast()}
          {renderEncouragementDetailModal()}
          <OnboardingModal
            dataLoaded={!!myData}
            step={myData?.onboardingStep}
            lastSeen={myData?.onboardingLastSeen}
            onDismiss={(stepIndex) => {
              const myRef = doc(db, getMyBasePath());
              updateDoc(myRef, { onboardingStep: stepIndex + 1, onboardingLastSeen: Timestamp.now() });
            }}
          />
        </main>
      </div>
    );
  }

  // Main unified dashboard view
  return (
    <div className="dashboard">
      <main>
        {/* "ME" SECTION */}
        <>
            <VacationBanner userProfile={userProfile} />
            <div className="greeting-row">
              <ProfilePhoto photoUrl={myData?.counseleePhotoUrl || myData?.photoUrl} size="small" />
              <p className="greeting">Hi, {myData?.name || userProfile?.name || 'there'}!</p>
              {myHomework.filter(h => h.status === 'active').length > 0 && (() => {
                const dayStreak = calculateAPStreak(myHomework, userProfile);
                const weekStr = calculateWeekStreak(myHomework);
                return (dayStreak > 0 || weekStr > 0) ? (
                  <div className="personal-streak">
                    {dayStreak > 0 && <span className="streak-badge day-streak" title="Consecutive days with homework activity">{dayStreak} day{dayStreak !== 1 ? 's' : ''}</span>}
                    {weekStr > 0 && <span className="streak-badge week-streak" title="Consecutive weeks with all targets met">{weekStr} week{weekStr !== 1 ? 's' : ''}</span>}
                  </div>
                ) : null;
              })()}
              {(() => {
                const myCounts = encouragementCounts[user?.uid] || {};
                const total = (myCounts.cheers || 0) + (myCounts.nudges || 0) + (myCounts.messages || 0);
                return total > 0 ? renderEncouragementCounters(user.uid) : null;
              })()}
              {myPrayerCount > 0 && (
                <span
                  className="encouragement-counter prayer-counter"
                  onClick={() => {
                    // Load recent prayers for pop-out
                    const loadPrayers = async () => {
                      try {
                        const myPRsSnap = await getDocs(query(
                          collection(db, `users/${user.uid}/prayerRequests`),
                          where('expiresAt', '>', Timestamp.now())
                        ));
                        const allPrayers = [];
                        for (const prDoc of myPRsSnap.docs) {
                          const prData = prDoc.data();
                          const prayersSnap = await getDocs(query(
                            collection(db, `users/${user.uid}/prayerRequests/${prDoc.id}/prayers`),
                            orderBy('prayedAt', 'desc'),
                            limit(50)
                          ));
                          prayersSnap.docs.forEach(pDoc => {
                            const pData = pDoc.data();
                            allPrayers.push({
                              name: pData.prayerName,
                              date: pData.prayedAt,
                              prText: prData.text?.substring(0, 80) || ''
                            });
                          });
                        }
                        allPrayers.sort((a, b) => (b.date?.toDate?.()?.getTime() || 0) - (a.date?.toDate?.()?.getTime() || 0));
                        setPrayerDetailList(allPrayers.slice(0, 50));
                        setShowPrayerDetail(true);
                      } catch (err) {
                        console.error('Failed to load prayer details:', err);
                      }
                    };
                    loadPrayers();
                  }}
                  title="People praying for you"
                >
                  🙏 {myPrayerCount}
                </span>
              )}
              <button className="activity-icon-btn" onClick={() => setShowMyActivityHistory(true)} title="Activity History">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
                </svg>
              </button>
              <div className="greeting-row-right">
                {myCounselorProfile && (
                  <div className="b-person-tile counselor-tile">
                    <ProfilePhoto photoUrl={myCounselorProfile.photoUrl} size="small" />
                    <div className="b-tile-details">
                      <span className="b-tile-label">Your counselor</span>
                      <span className="b-tile-name">{myCounselorProfile.name}</span>
                      {myCounselorProfile.email && (
                        <a href={`mailto:${myCounselorProfile.email}`} className="contact-link">
                          {myCounselorProfile.email}
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Accountability Partners section (above counselees) */}
            <div className="connected-subheader">
              <span className="connected-subheader-clickable" onClick={() => setShowAccountabilityPartnersModal(true)}>ACCOUNTABILITY PARTNERS</span>
              <button className="slim-add-btn" onClick={() => setShowAccountabilityPartnersModal(true)}>+ AP</button>
            </div>

            {/* Pending AP Invite Tiles */}
            {pendingRequests.length > 0 && (
              <div className="accountability-tiles-row">
                {pendingRequests.map(req => (
                  <div
                    key={req.id}
                    className="accountability-tile status-invite"
                    onClick={() => setRespondingTo(req)}
                  >
                    <ProfilePhoto size="small" />
                    <div className="accountability-tile-info">
                      <div className="accountability-tile-name">{req.requesterName}</div>
                      <div className="accountability-tile-email">{req.requesterEmail}</div>
                      <div className="accountability-tile-meta">
                        <span className="accountability-tile-status">Wants to partner</span>
                      </div>
                    </div>
                    <div className="streak-circle-container">
                      <div className="streak-circle" style={{ backgroundColor: '#3182ce' }}>?</div>
                      <div className="streak-label">respond</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Response popup */}
            {respondingTo && (
              <div className="modal-overlay" onClick={() => setRespondingTo(null)}>
                <div className="modal-content ap-response-modal" onClick={e => e.stopPropagation()}>
                  <div className="modal-header">
                    <h2>Partner Request</h2>
                    <button className="modal-close" onClick={() => setRespondingTo(null)}>&times;</button>
                  </div>
                  <div className="modal-body">
                    <p><strong>{respondingTo.requesterName}</strong> wants to be your accountability partner.</p>
                    <div className="ap-response-buttons">
                      <button
                        className="ap-accept-btn"
                        onClick={() => handleRespondToRequest(respondingTo.id, 'accept')}
                      >Accept - Share Both Ways</button>
                      <button
                        className="ap-accept-private-btn"
                        onClick={() => handleRespondToRequest(respondingTo.id, 'accept_private')}
                      >Accept - Keep My Data Private</button>
                      <button
                        className="ap-decline-btn"
                        onClick={() => handleRespondToRequest(respondingTo.id, 'decline')}
                      >Decline</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* AP Tiles - People I'm watching */}
            {myWatchingUsers.length > 0 && (
              <div className="accountability-tiles-row">
                {myWatchingUsers.map(person => {
                  const statusData = watchingUsersStatus[person.uid] || {};
                  const status = statusData.status || 'unknown';
                  const streak = statusData.streak || 0;
                  const photoUrl = statusData.photoUrl || null;
                  return (
                    <div
                      key={person.uid}
                      className={`accountability-tile status-${status}`}
                      onClick={() => setSelectedWatchedUser(person)}
                    >
                      <div className="accountability-tile-top">
                        <ProfilePhoto photoUrl={photoUrl} size="small" />
                        <div className="accountability-tile-info">
                          <div className="accountability-tile-name">{person.name}</div>
                          <div className="accountability-tile-email">{person.email}</div>
                          <div className="accountability-tile-meta">
                            <span className="accountability-tile-status">
                              {getAPStatusLabel(status)}
                            </span>
                          </div>
                        </div>
                        <div className="streak-circle-container">
                          <div className="streak-circle" style={{ backgroundColor: streak > 0 ? '#38a169' : '#a0aec0' }}>
                            {streak}
                          </div>
                          <div className="streak-label">day streak</div>
                        </div>
                      </div>
                      {renderEncourageBar(person.uid)}
                    </div>
                  );
                })}
              </div>
            )}

            {myWatchingUsers.length === 0 && pendingRequests.length === 0 && (
              <p className="empty-state-slim">No accountability partners yet.</p>
            )}

            {/* Counselees section */}
            <div className="connected-subheader">
              COUNSELEES
              {counselees.length > 0 && (
                <div className="counselee-tabs">
                  <button className={`tab-btn ${counseleeTab === 'active' ? 'active' : ''}`} onClick={() => setCounseleeTab('active')}>
                    Active ({counselees.filter(c => !c.graduated).length})
                  </button>
                  <button className={`tab-btn ${counseleeTab === 'graduated' ? 'active' : ''}`} onClick={() => setCounseleeTab('graduated')}>
                    Graduated ({counselees.filter(c => c.graduated).length})
                  </button>
                </div>
              )}
              <button className="slim-add-btn" onClick={() => setShowAddForm(true)}>+ Counselee</button>
            </div>

            {showAddForm && (
              <form className="add-form" onSubmit={handleAddCounselee}>
                <input type="text" placeholder="Name" value={newCounselee.name} onChange={(e) => setNewCounselee({ ...newCounselee, name: e.target.value })} required />
                <input type="email" placeholder="Email (optional - skip to add without login)" value={newCounselee.email} onChange={(e) => setNewCounselee({ ...newCounselee, email: e.target.value, password: e.target.value ? newCounselee.password : '' })} />
                <input type="tel" placeholder="Phone (for SMS)" value={newCounselee.phone} onChange={(e) => setNewCounselee({ ...newCounselee, phone: e.target.value })} />
                {newCounselee.email.trim() && (
                  <input type="text" placeholder="Temp Password (min 6 chars)" value={newCounselee.password} onChange={(e) => setNewCounselee({ ...newCounselee, password: e.target.value })} required />
                )}
                {formError && <div className="error">{formError}</div>}
                <div className="form-buttons">
                  <button type="submit" disabled={formLoading}>{formLoading ? 'Creating...' : 'Add'}</button>
                  <button type="button" onClick={() => { setShowAddForm(false); setFormError(''); }}>Cancel</button>
                </div>
              </form>
            )}

            {counselees.length > 0 ? (
              <div className="accountability-tiles-row">
                {counselees
                  .filter(c => counseleeTab === 'active' ? !c.graduated : c.graduated)
                  .map(counselee => {
                    const behindCount = counseleeBehindStatus[counselee.id] || 0;
                    const status = !counselee.uid ? 'no-login' : counselee.graduated ? 'graduated' : behindCount > 0 ? 'behind' : 'on-track';
                    const streak = counselee.currentStreak || 0;
                    return (
                      <div
                        key={counselee.id}
                        className={`accountability-tile status-${status}`}
                        onClick={() => setSelectedCounselee(counselee)}
                      >
                        <div className="accountability-tile-top">
                          <ProfilePhoto photoUrl={counselee.photoUrl || counselee.counseleePhotoUrl} size="small" />
                          <div className="accountability-tile-info">
                            <div className="accountability-tile-name">{counselee.name}</div>
                            <div className="accountability-tile-email">{counselee.email || 'No email'}</div>
                            <div className="accountability-tile-meta">
                              <span className="accountability-tile-status">
                                {!counselee.uid ? 'No login' : counselee.graduated ? 'Graduated' : behindCount > 0 ? `${behindCount} behind` : streak > 0 ? 'On track' : 'No activity today'}
                              </span>
                            </div>
                          </div>
                          <div className="streak-circle-container">
                            <div className="streak-circle" style={{ backgroundColor: streak > 0 ? '#38a169' : '#a0aec0' }}>
                              {streak}
                            </div>
                            <div className="streak-label">day streak</div>
                          </div>
                        </div>
                        {counselee.uid && renderEncourageBar(counselee.uid)}
                      </div>
                    );
                  })}
                {counselees.filter(c => counseleeTab === 'active' ? !c.graduated : c.graduated).length === 0 && (
                  <p className="empty-state">{counseleeTab === 'active' ? 'No active counselees.' : 'No graduated counselees.'}</p>
                )}
              </div>
            ) : (
              <p className="empty-state-slim">No counselees yet.</p>
            )}

            <AccountabilityPartnersModal
              isOpen={showAccountabilityPartnersModal}
              onClose={() => setShowAccountabilityPartnersModal(false)}
              myPartners={myAccountabilityPartners}
              onAddPartner={handleAddAccountabilityPartner}
              onRemovePartner={handleRemoveAccountabilityPartner}
              currentUserUid={user?.uid}
              currentUserName={myData?.name || userProfile?.name || 'Someone'}
              myCounselorId={userProfile?.counselorId || null}
            />

            <div className="b-dashboard-grid">
              <div className="b-dashboard-left">
                {loading ? (
                  <p>Loading...</p>
                ) : (
                  <HomeworkTile
                    homework={myHomework}
                    role="counselee"
                    onComplete={handleMyComplete}
                    onUncheck={handleMyUncheckHomework}
                    onEdit={handleMyEditHomework}
                    onCancel={handleMyCancelHomework}
                    onReactivate={handleMyReactivateHomework}
                    onAdd={handleMyAddHomework}
                    completingId={completingId}
                    onOpenThinkList={handleOpenThinkListFromHomework}
                    onOpenJournal={handleOpenJournalFromHomework}
                  />
                )}

                {/* Sessions List - show if user has a counselor or has session data */}
                {(userProfile?.counselorId || mySessions.length > 0) && (
                <div className="tile">
                  <div className="tile-header">
                    <h3>Sessions ({mySessions.length})</h3>
                  </div>
                  <div className="tile-content">
                    {mySessions.length === 0 ? (
                      <p className="empty-list">No sessions yet.</p>
                    ) : (
                      <ul className="session-list">
                        {mySessions.map(session => (
                          <li
                            key={session.id}
                            className="session-item"
                            onClick={() => {
                              setSelectedMySession(session);
                              setMySessionNotes(session.counseleeNotes || '');
                            }}
                          >
                            <span className="session-date">{formatDate(session.date)}</span>
                            <span className="session-meta">
                              {myHomework.filter(h => h.sessionId === session.id).length} homework
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                )}

              </div>

              <div className="b-dashboard-right">
                <PrayerRequestsTile
                  user={user}
                  userProfile={userProfile}
                  role="counselee"
                  isCounselor={isCounselor}
                  watchingUsers={myWatchingUsers}
                  counseleeUids={isCounselor ? counselees.filter(c => c.uid && !c.graduated).map(c => ({ uid: c.uid, name: c.name })) : []}
                  onPrayerCountUpdate={setMyPrayerCount}
                  getAuthToken={() => auth.currentUser.getIdToken()}
                  onAdd={() => setViewingMyPrayerRequest({})}
                  onEdit={(pr) => setViewingMyPrayerRequest(pr)}
                />
              </div>
            </div>

            {/* Prayer detail modal */}
            {showPrayerDetail && (
              <div className="modal-overlay" onClick={() => setShowPrayerDetail(false)}>
                <div className="modal-content" onClick={e => e.stopPropagation()}>
                  <div className="modal-header">
                    <h3>People Praying for You</h3>
                    <button className="modal-close" onClick={() => setShowPrayerDetail(false)}>&times;</button>
                  </div>
                  <div className="modal-body">
                    {prayerDetailList.length === 0 ? (
                      <p className="empty-list">No prayers recorded yet.</p>
                    ) : (
                      <ul className="pr-detail-list">
                        {prayerDetailList.map((p, i) => (
                          <li key={i} className="pr-detail-item">
                            <span className="pr-detail-name">{p.name}</span>
                            <span className="pr-detail-text">{p.prText}{p.prText.length >= 80 ? '...' : ''}</span>
                            <span className="pr-detail-date">{p.date?.toDate ? p.date.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>

      </main>
      {renderMessageModal()}
      {renderToast()}
      {renderEncouragementDetailModal()}
      <OnboardingModal
        dataLoaded={!!myData}
        step={myData?.onboardingStep}
        lastSeen={myData?.onboardingLastSeen}
        onDismiss={(stepIndex) => {
          const myRef = doc(db, getMyBasePath());
          updateDoc(myRef, { onboardingStep: stepIndex + 1, onboardingLastSeen: Timestamp.now() });
        }}
      />
    </div>
  );
}
