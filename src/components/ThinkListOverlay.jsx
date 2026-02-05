import { useState, useEffect, useRef } from 'react';
import { db } from '../config/firebase';
import { doc, updateDoc, increment } from 'firebase/firestore';

export default function ThinkListOverlay({ thinkLists, userProfile, onClose }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const touchStartX = useRef(null);

  const current = thinkLists[currentIndex];

  // Log view when component mounts or index changes
  useEffect(() => {
    if (!current || !userProfile?.counselorId || !userProfile?.counseleeDocId) return;

    const logView = async () => {
      try {
        const basePath = `counselors/${userProfile.counselorId}/counselees/${userProfile.counseleeDocId}`;
        const thinkListRef = doc(db, `${basePath}/thinkLists`, current.id);
        await updateDoc(thinkListRef, {
          viewCount: increment(1),
          lastViewed: new Date()
        });
      } catch (error) {
        console.error('Error logging think list view:', error);
      }
    };

    logView();
  }, [current?.id, userProfile]);

  const goNext = () => {
    if (currentIndex < thinkLists.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  // Swipe handling
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;

    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;

    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        goNext();
      } else {
        goPrev();
      }
    }

    touchStartX.current = null;
  };

  if (thinkLists.length === 0) {
    return (
      <div className="think-list-overlay" onClick={onClose}>
        <div className="think-list-modal" onClick={e => e.stopPropagation()}>
          <div className="think-list-header">
            <h2>Think List</h2>
            <button className="close-modal-btn" onClick={onClose}>Close</button>
          </div>
          <div className="think-list-content">
            <p className="empty-think-list">No think lists assigned yet.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="think-list-overlay" onClick={onClose}>
      <div
        className="think-list-modal"
        onClick={e => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="think-list-header">
          <h2>Think List</h2>
          <div className="think-list-nav">
            <button onClick={goPrev} disabled={currentIndex === 0} title="Previous">&larr;</button>
            <button onClick={goNext} disabled={currentIndex === thinkLists.length - 1} title="Next">&rarr;</button>
          </div>
        </div>

        <div className="think-list-content">
          <h3 className="think-list-title">{current.title || 'Think List'}</h3>
          <div
            className="think-list-body"
            dangerouslySetInnerHTML={{ __html: current.content || '' }}
          />
        </div>

        <div className="think-list-footer">
          <span className="think-list-counter">
            {currentIndex + 1} of {thinkLists.length}
          </span>
          <button className="think-list-close" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
