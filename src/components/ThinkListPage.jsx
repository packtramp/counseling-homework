import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../config/firebase';
import { collection, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, increment, arrayUnion, Timestamp } from 'firebase/firestore';

export default function ThinkListPage({
  userProfile,
  editingThinkList,
  onClose,
  onSaved,
  role = 'counselee',
  readOnly: forceReadOnly = false,
  basePath: propBasePath,
  thinkLists = [],
  homework = [],
  onNavigate
}) {
  const isAccountability = role === 'accountability';
  const isReadOnly = forceReadOnly || isAccountability;
  // Form fields
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [verse, setVerse] = useState('');
  const [thinkListContent, setThinkListContent] = useState('');
  const [attitudePutOff, setAttitudePutOff] = useState('');
  const [attitudePutOn, setAttitudePutOn] = useState('');
  const [thoughtsPutOff, setThoughtsPutOff] = useState('');
  const [thoughtsPutOn, setThoughtsPutOn] = useState('');
  const [actionsPutOff, setActionsPutOff] = useState('');
  const [actionsPutOn, setActionsPutOn] = useState('');

  // Homework settings (how often to review)
  const [timesPerDay, setTimesPerDay] = useState(0);
  const [daysPerWeek, setDaysPerWeek] = useState(7);
  const [durationWeeks, setDurationWeeks] = useState(null);

  const [saveStatus, setSaveStatus] = useState('');
  const [currentThinkListId, setCurrentThinkListId] = useState(null);
  const autoSaveTimeoutRef = useRef(null);
  const lastSavedDataRef = useRef(null);
  const touchStartRef = useRef(null);
  const pageRef = useRef(null);
  const viewedIdsRef = useRef(new Set());

  // Determine base path
  const basePath = propBasePath || (userProfile?.counselorId && userProfile?.counseleeDocId
    ? `counselors/${userProfile.counselorId}/counselees/${userProfile.counseleeDocId}`
    : null);

  // Navigation: find current index in thinkLists array (sorted newest first)
  const currentIndex = editingThinkList?.id
    ? thinkLists.findIndex(t => t.id === editingThinkList.id)
    : -1;
  const hasNewer = currentIndex > 0;
  const hasOlder = currentIndex >= 0 && currentIndex < thinkLists.length - 1;

  const navigateThinkList = useCallback((direction) => {
    if (!onNavigate) return;
    if (direction === 'newer' && hasNewer) {
      onNavigate(thinkLists[currentIndex - 1]);
    } else if (direction === 'older' && hasOlder) {
      onNavigate(thinkLists[currentIndex + 1]);
    }
  }, [onNavigate, hasNewer, hasOlder, thinkLists, currentIndex]);

  // Swipe support for mobile navigation
  useEffect(() => {
    const page = pageRef.current;
    if (!page || !editingThinkList?.id) return;

    const handleTouchStart = (e) => {
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY
      };
    };

    const handleTouchEnd = (e) => {
      if (!touchStartRef.current) return;

      const deltaX = e.changedTouches[0].clientX - touchStartRef.current.x;
      const deltaY = e.changedTouches[0].clientY - touchStartRef.current.y;

      // Only trigger if horizontal swipe is dominant and > 50px
      if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
        if (deltaX > 0) {
          navigateThinkList('newer');
        } else {
          navigateThinkList('older');
        }
      }

      touchStartRef.current = null;
    };

    page.addEventListener('touchstart', handleTouchStart, { passive: true });
    page.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      page.removeEventListener('touchstart', handleTouchStart);
      page.removeEventListener('touchend', handleTouchEnd);
    };
  }, [editingThinkList?.id, navigateThinkList]);

  // Track view count when counselee views a Think List
  useEffect(() => {
    const trackView = async () => {
      if (role !== 'counselee' || !editingThinkList?.id || !basePath) return;
      if (viewedIdsRef.current.has(editingThinkList.id)) return;

      try {
        viewedIdsRef.current.add(editingThinkList.id);
        await updateDoc(doc(db, `${basePath}/thinkLists`, editingThinkList.id), {
          viewCount: increment(1),
          lastViewedAt: serverTimestamp()
        });
      } catch (error) {
        console.error('Failed to track view:', error);
      }
    };

    trackView();
  }, [editingThinkList?.id, role, basePath]);

  // Find linked homework for this think list (for Mark Reviewed button)
  const linkedHw = homework.find(h => h.linkedThinkListId === editingThinkList?.id && h.status === 'active');

  // Auto-heal: fix dailyCap if it doesn't match timesPerDay (one-time migration for pre-fix data)
  useEffect(() => {
    if (!linkedHw || !editingThinkList || !basePath) return;
    const expectedCap = editingThinkList.timesPerDay ?? 1;
    if (expectedCap > 0 && linkedHw.dailyCap !== expectedCap) {
      updateDoc(doc(db, `${basePath}/homework`, linkedHw.id), { dailyCap: expectedCap });
    }
  }, [linkedHw?.id, linkedHw?.dailyCap, editingThinkList?.timesPerDay, basePath]);

  // Client-side backup cooldown (in case Firestore data hasn't synced yet)
  const [lastReviewedAt, setLastReviewedAt] = useState(null);

  // Check if review was done within the last hour (1hr debounce)
  const reviewedRecently = (() => {
    // Client-side backup cooldown
    if (lastReviewedAt && (Date.now() - lastReviewedAt) < 60 * 60 * 1000) return true;
    if (!linkedHw) return false;
    const completions = linkedHw.completions || [];
    if (completions.length === 0) return false;
    const lastCompletion = completions[completions.length - 1];
    const lastTime = lastCompletion.toDate ? lastCompletion.toDate() : new Date(lastCompletion);
    return (Date.now() - lastTime.getTime()) < 60 * 60 * 1000;
  })();

  const [markingReviewed, setMarkingReviewed] = useState(false);

  const handleMarkReviewed = async () => {
    if (!linkedHw || !basePath || reviewedRecently || markingReviewed) return;
    setMarkingReviewed(true);
    try {
      const hwRef = doc(db, `${basePath}/homework`, linkedHw.id);
      await updateDoc(hwRef, {
        completions: arrayUnion(Timestamp.now())
      });
      await addDoc(collection(db, `${basePath}/activityLog`), {
        action: 'homework_completed',
        actor: 'counselee',
        actorUid: userProfile?.uid || '',
        actorName: userProfile?.name || 'counselee',
        details: `Reviewed "${editingThinkList.title || 'Think List'}"`,
        timestamp: serverTimestamp()
      });
      setLastReviewedAt(Date.now());
      onClose();
    } catch (error) {
      console.error('Failed to mark reviewed:', error);
    } finally {
      setMarkingReviewed(false);
    }
  };

  // Get current form data as object
  const getFormData = useCallback(() => ({
    title,
    instructions,
    verse,
    thinkListContent,
    attitudePutOff,
    attitudePutOn,
    thoughtsPutOff,
    thoughtsPutOn,
    actionsPutOff,
    actionsPutOn,
    timesPerDay,
    daysPerWeek,
    durationWeeks
  }), [title, instructions, verse, thinkListContent, attitudePutOff, attitudePutOn, thoughtsPutOff, thoughtsPutOn, actionsPutOff, actionsPutOn, timesPerDay, daysPerWeek, durationWeeks]);

  // Load existing think list
  useEffect(() => {
    if (editingThinkList) {
      setTitle(editingThinkList.title || '');
      setInstructions(editingThinkList.instructions || '');
      setVerse(editingThinkList.verse || '');
      setThinkListContent(editingThinkList.thinkListContent || '');
      setAttitudePutOff(editingThinkList.attitudePutOff || '');
      setAttitudePutOn(editingThinkList.attitudePutOn || '');
      setThoughtsPutOff(editingThinkList.thoughtsPutOff || '');
      setThoughtsPutOn(editingThinkList.thoughtsPutOn || '');
      setActionsPutOff(editingThinkList.actionsPutOff || '');
      setActionsPutOn(editingThinkList.actionsPutOn || '');
      setTimesPerDay(editingThinkList.timesPerDay ?? 0);
      setDaysPerWeek(editingThinkList.daysPerWeek ?? 7);
      setDurationWeeks(editingThinkList.durationWeeks ?? null);
      setCurrentThinkListId(editingThinkList.id);
      lastSavedDataRef.current = JSON.stringify({
        title: editingThinkList.title || '',
        instructions: editingThinkList.instructions || '',
        verse: editingThinkList.verse || '',
        thinkListContent: editingThinkList.thinkListContent || '',
        attitudePutOff: editingThinkList.attitudePutOff || '',
        attitudePutOn: editingThinkList.attitudePutOn || '',
        thoughtsPutOff: editingThinkList.thoughtsPutOff || '',
        thoughtsPutOn: editingThinkList.thoughtsPutOn || '',
        actionsPutOff: editingThinkList.actionsPutOff || '',
        actionsPutOn: editingThinkList.actionsPutOn || '',
        timesPerDay: editingThinkList.timesPerDay ?? 0,
        daysPerWeek: editingThinkList.daysPerWeek ?? 7,
        durationWeeks: editingThinkList.durationWeeks ?? null
      });
      if (editingThinkList.status === 'submitted') {
        setSaveStatus('submitted');
      }
    } else {
      // New think list - clear all fields
      setTitle('');
      setInstructions('');
      setVerse('');
      setThinkListContent('');
      setAttitudePutOff('');
      setAttitudePutOn('');
      setThoughtsPutOff('');
      setThoughtsPutOn('');
      setActionsPutOff('');
      setActionsPutOn('');
      setTimesPerDay(0);
      setDaysPerWeek(7);
      setDurationWeeks(null);
      setCurrentThinkListId(null);
      lastSavedDataRef.current = null;
    }
  }, [editingThinkList]);

  // Auto-save logic with debounce
  const autoSave = useCallback(async () => {
    if (!basePath) {
      console.warn('ThinkListPage autoSave: basePath is null');
      return;
    }

    const formData = getFormData();
    const currentDataStr = JSON.stringify(formData);

    // Don't save if nothing changed
    if (currentDataStr === lastSavedDataRef.current) {
      return;
    }

    // Don't save if all fields are empty
    if (!formData.title && !formData.verse && !formData.thinkListContent) {
      return;
    }

    setSaveStatus('saving');

    try {
      const thinkListData = {
        ...formData,
        status: 'draft',
        lastAutoSavedAt: serverTimestamp(),
        updatedBy: role
      };

      if (currentThinkListId) {
        await updateDoc(doc(db, `${basePath}/thinkLists`, currentThinkListId), thinkListData);
      } else {
        const docRef = await addDoc(collection(db, `${basePath}/thinkLists`), {
          ...thinkListData,
          createdAt: serverTimestamp(),
          createdBy: role
        });
        setCurrentThinkListId(docRef.id);
      }

      lastSavedDataRef.current = currentDataStr;
      setSaveStatus('saved');
    } catch (error) {
      console.error('Auto-save failed:', error);
      setSaveStatus('');
    }
  }, [basePath, currentThinkListId, role, getFormData]);

  // Debounced auto-save on any field change
  useEffect(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      autoSave();
    }, 3000);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [title, instructions, verse, thinkListContent, attitudePutOff, attitudePutOn, thoughtsPutOff, thoughtsPutOn, actionsPutOff, actionsPutOn, timesPerDay, daysPerWeek, durationWeeks, autoSave]);

  const handleSubmit = async () => {
    if (!basePath) {
      console.error('ThinkListPage: basePath is null. userProfile:', userProfile, 'propBasePath:', propBasePath);
      alert('Unable to save. Please try again or contact support.');
      return;
    }

    setSaveStatus('saving');

    try {
      const formData = getFormData();
      let thinkListId = currentThinkListId;
      let linkedHomeworkId = editingThinkList?.linkedHomeworkId || null;

      const thinkListData = {
        ...formData,
        title: formData.title || 'Untitled Think List',
        status: 'active',
        expiresAt: formData.durationWeeks
          ? Timestamp.fromDate(new Date(Date.now() + formData.durationWeeks * 7 * 24 * 60 * 60 * 1000))
          : null,
        submittedAt: serverTimestamp(),
        updatedBy: role
      };

      // Save Think List first
      if (thinkListId) {
        await updateDoc(doc(db, `${basePath}/thinkLists`, thinkListId), thinkListData);
      } else {
        const docRef = await addDoc(collection(db, `${basePath}/thinkLists`), {
          ...thinkListData,
          createdAt: serverTimestamp(),
          createdBy: role
        });
        thinkListId = docRef.id;
        setCurrentThinkListId(thinkListId);
      }

      // Handle linked homework based on timesPerDay
      if (formData.timesPerDay > 0) {
        const weeklyTarget = formData.timesPerDay * formData.daysPerWeek;
        const homeworkData = {
          title: `Thinklist: ${formData.title || 'Think List'}`,
          description: formData.instructions || 'Review your Think List',
          type: 'thinklist',
          assignedBy: role,
          status: 'active',
          weeklyTarget,
          dailyCap: formData.timesPerDay,
          durationWeeks: formData.durationWeeks,
          expiresAt: formData.durationWeeks
            ? Timestamp.fromDate(new Date(Date.now() + formData.durationWeeks * 7 * 24 * 60 * 60 * 1000))
            : null,
          linkedThinkListId: thinkListId,
          updatedAt: serverTimestamp()
        };

        if (linkedHomeworkId) {
          // Update existing homework
          await updateDoc(doc(db, `${basePath}/homework`, linkedHomeworkId), homeworkData);
        } else {
          // Create new homework
          const hwRef = await addDoc(collection(db, `${basePath}/homework`), {
            ...homeworkData,
            assignedDate: serverTimestamp(),
            createdAt: serverTimestamp(),
            completions: []
          });
          linkedHomeworkId = hwRef.id;

          // Update Think List with linked homework ID
          await updateDoc(doc(db, `${basePath}/thinkLists`, thinkListId), {
            linkedHomeworkId
          });
        }
      } else if (linkedHomeworkId) {
        // timesPerDay is 0 and there was linked homework - cancel it
        await updateDoc(doc(db, `${basePath}/homework`, linkedHomeworkId), {
          status: 'cancelled',
          updatedAt: serverTimestamp()
        });
        // Clear the link
        await updateDoc(doc(db, `${basePath}/thinkLists`, thinkListId), {
          linkedHomeworkId: null
        });
      }

      // Log activity with specific change details
      const changeDetails = [];
      if (editingThinkList) {
        const oldTpd = editingThinkList.timesPerDay ?? 0;
        const oldDpw = editingThinkList.daysPerWeek ?? 7;
        const oldDur = editingThinkList.durationWeeks ?? null;
        if (formData.timesPerDay !== oldTpd) {
          changeDetails.push(`Changed homework to ${formData.timesPerDay}x/day${oldTpd > 0 ? ` (was ${oldTpd}x/day)` : ''}`);
        }
        if (formData.daysPerWeek !== oldDpw && formData.timesPerDay > 0) {
          changeDetails.push(`Changed days/week to ${formData.daysPerWeek} (was ${oldDpw})`);
        }
        if (formData.durationWeeks !== oldDur && formData.timesPerDay > 0) {
          const newDurStr = formData.durationWeeks ? `${formData.durationWeeks} weeks` : 'ongoing';
          const oldDurStr = oldDur ? `${oldDur} weeks` : 'ongoing';
          changeDetails.push(`Changed duration to ${newDurStr} (was ${oldDurStr})`);
        }
      }

      const detailStr = changeDetails.length > 0
        ? `Updated Think List: ${formData.title || 'Untitled'} - ${changeDetails.join('; ')}`
        : `Submitted Think List: ${formData.title || 'Untitled'}${formData.timesPerDay > 0 ? ` (${formData.timesPerDay}x/day homework)` : ''}`;

      await addDoc(collection(db, `${basePath}/activityLog`), {
        action: changeDetails.length > 0 ? 'think_list_settings_changed' : 'think_list_submitted',
        actor: role,
        actorUid: userProfile?.uid || '',
        actorName: userProfile?.name || role,
        details: detailStr,
        timestamp: serverTimestamp()
      });

      setSaveStatus('submitted');
      onSaved?.();
      onClose();
    } catch (error) {
      console.error('Submit failed:', error);
      alert('Save failed: ' + error.message);
      setSaveStatus('');
    }
  };

  const handleDelete = async () => {
    if (!currentThinkListId || !basePath) return;

    if (!window.confirm('Delete this Think List? This cannot be undone.')) return;

    try {
      const deletedTitle = title || 'Untitled Think List';
      // Cascade delete linked homework
      const linkedHwId = editingThinkList?.linkedHomeworkId;
      if (linkedHwId) {
        await deleteDoc(doc(db, `${basePath}/homework`, linkedHwId));
      }
      await deleteDoc(doc(db, `${basePath}/thinkLists`, currentThinkListId));
      await addDoc(collection(db, `${basePath}/activityLog`), {
        action: 'think_list_deleted',
        actor: role,
        actorUid: userProfile?.uid || '',
        actorName: userProfile?.name || role,
        details: `Deleted Think List: ${deletedTitle}`,
        timestamp: serverTimestamp()
      });
      onClose();
    } catch (error) {
      console.error('Delete failed:', error);
    }
  };

  const handleSaveDraft = async () => {
    await autoSave();
    onClose();
  };

  return (
    <div className="tl-page" ref={pageRef}>
      <header className="tl-page-header">
        <h1>Think List</h1>
        <div className="tl-save-status">
          {saveStatus === 'saving' && 'Saving...'}
          {saveStatus === 'saved' && 'Draft saved'}
          {saveStatus === 'submitted' && 'Submitted'}
        </div>
      </header>

      <div className="tl-page-content">
        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
          {/* Header */}
          <h2 className="tl-form-header">Meditation List / Principle</h2>

          {/* Title */}
          <div className="tl-field-group">
            <label htmlFor="tl-title">Title</label>
            <input
              id="tl-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Am I Thinking About God"
              readOnly={isReadOnly}
            />
          </div>

          {/* Instructions (visible to both, editable by counselor) */}
          {(role === 'counselor' || instructions) && (
            <div className="tl-field-group">
              <label htmlFor="tl-instructions">Instructions</label>
              <textarea
                id="tl-instructions"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="How should the counselee use this Think List? e.g., 'Read through this list slowly, pausing to reflect on each point. Pray through the put off/put on items.'"
                rows={2}
                readOnly={isReadOnly || role !== 'counselor'}
              />
            </div>
          )}

          {/* Homework Settings - both roles can set (except accountability) */}
          {!isReadOnly && (
          <div className="tl-homework-settings">
              <h3 className="tl-section-title">Homework Settings</h3>
              <small className="tl-hint">Set to 0x/day for a reference-only Think List (no homework tracking).</small>
              <div className="tl-settings-row">
                <div className="tl-field-group tl-field-small">
                  <label htmlFor="tl-times-per-day">Times per day</label>
                  <select
                    id="tl-times-per-day"
                    value={timesPerDay}
                    onChange={(e) => setTimesPerDay(parseInt(e.target.value))}
                  >
                    <option value={0}>0 (Reference only)</option>
                    <option value={1}>1x/day</option>
                    <option value={2}>2x/day</option>
                    <option value={3}>3x/day</option>
                  </select>
                </div>
                <div className="tl-field-group tl-field-small">
                  <label htmlFor="tl-days-per-week">Days per week</label>
                  <select
                    id="tl-days-per-week"
                    value={daysPerWeek}
                    onChange={(e) => setDaysPerWeek(parseInt(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5, 6, 7].map(n => (
                      <option key={n} value={n}>{n} day{n > 1 ? 's' : ''}</option>
                    ))}
                  </select>
                </div>
                <div className="tl-field-group tl-field-small">
                  <label htmlFor="tl-duration">Duration</label>
                  <select
                    id="tl-duration"
                    value={durationWeeks ?? 'ongoing'}
                    onChange={(e) => setDurationWeeks(e.target.value === 'ongoing' ? null : parseInt(e.target.value))}
                  >
                    <option value="ongoing">Ongoing</option>
                    {[1, 2, 3, 4, 6, 8, 12].map(n => (
                      <option key={n} value={n}>{n} week{n > 1 ? 's' : ''}</option>
                    ))}
                  </select>
                </div>
              </div>
              {timesPerDay > 0 && (
                <small className="tl-hint tl-homework-preview">
                  Weekly target: {timesPerDay * daysPerWeek}x ({timesPerDay}x/day × {daysPerWeek} days)
                  {durationWeeks ? ` for ${durationWeeks} weeks` : ', ongoing'}
                </small>
              )}
          </div>
          )}

          {/* Verse */}
          <div className="tl-field-group">
            <label htmlFor="tl-verse">Research a verse that is applicable to your situation and write it here:</label>
            <textarea
              id="tl-verse"
              value={verse}
              onChange={(e) => setVerse(e.target.value)}
              placeholder="e.g., 1 Corinthians 10:31 - 'Whether, then, you eat or drink or whatever you do, do all to the glory of God.'"
              rows={3}
              readOnly={isReadOnly}
            />
          </div>

          {/* Think List Content */}
          <div className="tl-field-group">
            <label htmlFor="tl-content">Write your think list below. Be specific to a situation, e.g., "The next time my child argues with me, I will remember..."</label>
            <textarea
              id="tl-content"
              value={thinkListContent}
              onChange={(e) => setThinkListContent(e.target.value)}
              placeholder="As I think about regular mundane, daily activities or consider large life-decisions, I want to always be thinking about God and how his Word applies..."
              rows={4}
              readOnly={isReadOnly}
            />
          </div>

          {/* Divider */}
          <hr className="tl-divider" />

          {/* PUT OFF / PUT ON Header */}
          <h2 className="tl-form-header tl-putoff-puton-header">PUT OFF / PUT ON</h2>

          {/* Attitude/Heart */}
          <div className="tl-section">
            <h3 className="tl-section-title">Attitude/Heart</h3>
            <div className="tl-two-column">
              <div className="tl-field-group">
                <label htmlFor="tl-attitude-off">Put Off - What are you treasuring in your heart that you need to put off?</label>
                <textarea
                  id="tl-attitude-off"
                  value={attitudePutOff}
                  onChange={(e) => setAttitudePutOff(e.target.value)}
                  placeholder="e.g., 'This is a small decision, God doesn't care.'"
                  rows={2}
                  readOnly={isReadOnly}
                />
              </div>
              <div className="tl-field-group">
                <label htmlFor="tl-attitude-on">Put On - What should you treasure in this situation instead?</label>
                <textarea
                  id="tl-attitude-on"
                  value={attitudePutOn}
                  onChange={(e) => setAttitudePutOn(e.target.value)}
                  placeholder="e.g., 'God cares and knows about all my decisions.'"
                  rows={2}
                  readOnly={isReadOnly}
                />
              </div>
            </div>
          </div>

          {/* Thoughts */}
          <div className="tl-section">
            <h3 className="tl-section-title">Thoughts</h3>
            <div className="tl-two-column">
              <div className="tl-field-group">
                <label htmlFor="tl-thoughts-off">Put Off - Write out a typical thought you might have that you need to put off.</label>
                <textarea
                  id="tl-thoughts-off"
                  value={thoughtsPutOff}
                  onChange={(e) => setThoughtsPutOff(e.target.value)}
                  placeholder="e.g., 'I deserve better. That is not fair! I will take matters into my own hand.'"
                  rows={2}
                  readOnly={isReadOnly}
                />
              </div>
              <div className="tl-field-group">
                <label htmlFor="tl-thoughts-on">Put On - What thought is most God-honoring?</label>
                <textarea
                  id="tl-thoughts-on"
                  value={thoughtsPutOn}
                  onChange={(e) => setThoughtsPutOn(e.target.value)}
                  placeholder="e.g., 'What honors God the most?'"
                  rows={2}
                  readOnly={isReadOnly}
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="tl-section">
            <h3 className="tl-section-title">Actions</h3>
            <div className="tl-two-column">
              <div className="tl-field-group">
                <label htmlFor="tl-actions-off">Put Off - What actions (quick words, angry words, rolling your eyes) will you put off?</label>
                <textarea
                  id="tl-actions-off"
                  value={actionsPutOff}
                  onChange={(e) => setActionsPutOff(e.target.value)}
                  placeholder="e.g., 'Quick words.'"
                  rows={2}
                  readOnly={isReadOnly}
                />
              </div>
              <div className="tl-field-group">
                <label htmlFor="tl-actions-on">Put On - What actions will you put on?</label>
                <textarea
                  id="tl-actions-on"
                  value={actionsPutOn}
                  onChange={(e) => setActionsPutOn(e.target.value)}
                  placeholder="e.g., 'Thoughtfully think through what I say.'"
                  rows={2}
                  readOnly={isReadOnly}
                />
              </div>
            </div>
          </div>

        </form>
      </div>

      {/* Sticky footer with all controls */}
      <footer className="tl-sticky-footer">
        {/* Navigation arrows - only show when viewing existing list */}
        {thinkLists.length > 0 && editingThinkList?.id && (
          <>
            <button
              type="button"
              className="tl-footer-btn tl-nav-btn"
              onClick={() => navigateThinkList('newer')}
              disabled={!hasNewer}
              title="Newer"
            >&larr;</button>
            <button
              type="button"
              className="tl-footer-btn tl-nav-btn"
              onClick={() => navigateThinkList('older')}
              disabled={!hasOlder}
              title="Older"
            >&rarr;</button>
          </>
        )}
        <button type="button" className="tl-footer-btn tl-back-btn" onClick={onClose}>
          Back
        </button>
        {!isReadOnly && (
          <>
            {editingThinkList?.status === 'active' && linkedHw ? (
              <button
                type="button"
                className={`tl-footer-btn ${reviewedRecently ? 'tl-reviewed-btn' : 'tl-mark-reviewed-btn'}`}
                onClick={handleMarkReviewed}
                disabled={reviewedRecently || markingReviewed}
              >
                {markingReviewed ? 'Marking...' : reviewedRecently ? 'Reviewed' : 'Mark Reviewed'}
              </button>
            ) : editingThinkList?.status !== 'active' ? (
              <button type="button" className="tl-footer-btn tl-draft-btn" onClick={handleSaveDraft}>
                Save Draft
              </button>
            ) : null}
            <button type="button" className="tl-footer-btn tl-submit-btn" onClick={handleSubmit} disabled={!title.trim() || !verse.trim() || !thinkListContent.trim() || !attitudePutOff.trim() || !attitudePutOn.trim() || !thoughtsPutOff.trim() || !thoughtsPutOn.trim() || !actionsPutOff.trim() || !actionsPutOn.trim()}>
              {editingThinkList?.status === 'active' ? 'Update' : 'Submit'}
            </button>
            {editingThinkList && currentThinkListId && (
              <button type="button" className="tl-footer-btn tl-delete-btn" onClick={handleDelete}>
                Delete
              </button>
            )}
          </>
        )}
      </footer>
    </div>
  );
}
