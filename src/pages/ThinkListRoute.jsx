import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { db } from '../config/firebase';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import ThinkListsTile from '../components/ThinkListsTile';
import ThinkListPage from '../components/ThinkListPage';

export default function ThinkListRoute() {
  const { user, userProfile } = useAuth();
  const [thinkLists, setThinkLists] = useState([]);
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
    const tlQ = query(collection(db, `${basePath}/thinkLists`), orderBy('createdAt', 'desc'));
    const hwQ = query(collection(db, `${basePath}/homework`));
    const unsub1 = onSnapshot(tlQ, (snapshot) => {
      setThinkLists(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsub2 = onSnapshot(hwQ, (snapshot) => {
      setHomework(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => { unsub1(); unsub2(); };
  }, [user, userProfile, basePath]);

  if (viewing) {
    return (
      <ThinkListPage
        userProfile={myUserProfile}
        editingThinkList={viewing.id ? viewing : null}
        thinkLists={thinkLists}
        homework={homework}
        onNavigate={(tl) => setViewing(tl)}
        onClose={() => setViewing(null)}
        onSaved={() => setViewing(null)}
        role="counselee"
      />
    );
  }

  return (
    <div className="dashboard">
      <main>
        <ThinkListsTile
          thinkLists={thinkLists}
          role="counselee"
          onView={(tl) => setViewing(tl)}
          onAdd={() => setViewing({})}
        />
        <button className={`fab${fabCollapsed ? ' fab-collapsed' : ''}`} onClick={() => setViewing({})}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span className="fab-label">New List</span>
        </button>
      </main>
    </div>
  );
}
