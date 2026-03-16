import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { db } from '../config/firebase';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import JournalingTile from '../components/JournalingTile';
import JournalingPage from '../components/JournalingPage';

export default function JournalingRoute() {
  const { user, userProfile } = useAuth();
  const [journals, setJournals] = useState([]);
  const [homework, setHomework] = useState([]);
  const [viewing, setViewing] = useState(null);
  const [fabCollapsed, setFabCollapsed] = useState(false);

  useEffect(() => {
    const content = document.querySelector('.app-content');
    if (!content) return;
    const onScroll = () => setFabCollapsed(content.scrollTop > 80);
    content.addEventListener('scroll', onScroll, { passive: true });
    return () => content.removeEventListener('scroll', onScroll);
  }, []);

  const basePath = userProfile?.counselorId && userProfile?.counseleeDocId
    ? `counselors/${userProfile.counselorId}/counselees/${userProfile.counseleeDocId}`
    : `counselors/${user?.uid}/counselees/${user?.uid}`;

  const myUserProfile = userProfile?.counselorId && userProfile?.counseleeDocId
    ? { uid: user?.uid, counselorId: userProfile.counselorId, counseleeDocId: userProfile.counseleeDocId, name: userProfile?.name || 'Me' }
    : { uid: user?.uid, counselorId: user?.uid, counseleeDocId: user?.uid, name: userProfile?.name || 'Me' };

  useEffect(() => {
    if (!user || !userProfile) return;
    const jnQ = query(collection(db, `${basePath}/journals`), orderBy('createdAt', 'desc'));
    const hwQ = query(collection(db, `${basePath}/homework`));
    const unsub1 = onSnapshot(jnQ, (snapshot) => {
      setJournals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsub2 = onSnapshot(hwQ, (snapshot) => {
      setHomework(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => { unsub1(); unsub2(); };
  }, [user, userProfile, basePath]);

  if (viewing) {
    return (
      <JournalingPage
        userProfile={myUserProfile}
        editingJournal={viewing.id ? viewing : null}
        journals={journals}
        homework={homework}
        onNavigate={(j) => setViewing(j)}
        basePath={basePath}
        role="counselee"
        onClose={() => setViewing(null)}
        onSaved={() => setViewing(null)}
      />
    );
  }

  return (
    <div className="dashboard">
      <main>
        <JournalingTile
          journals={journals}
          role="counselee"
          onView={(j) => setViewing(j)}
          onAdd={() => setViewing({})}
        />
        <button className={`fab${fabCollapsed ? ' fab-collapsed' : ''}`} onClick={() => setViewing({})}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          <span className="fab-label">New Entry</span>
        </button>
      </main>
    </div>
  );
}
