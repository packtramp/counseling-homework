import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../config/firebase';
import { collection, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, arrayUnion, Timestamp } from 'firebase/firestore';
import RichTextEditor from './RichTextEditor';

export default function JournalingPage({
  userProfile,
  editingJournal,
  onClose,
  onSaved,
  role = 'counselee',
  readOnly: forceReadOnly = false,
  basePath: propBasePath,
  journals = [],
  homework = [],
  onNavigate
}) {
  const isAccountability = role === 'accountability';
  const isReadOnly = forceReadOnly || isAccountability;
  // Form fields
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [instructions, setInstructions] = useState('');
  const [content, setContent] = useState('');
  const [dailyEntry, setDailyEntry] = useState('');

  // Homework settings
  const [timesPerWeek, setTimesPerWeek] = useState(0);
  const [durationWeeks, setDurationWeeks] = useState(null);

  const [saveStatus, setSaveStatus] = useState('');
  const [currentJournalId, setCurrentJournalId] = useState(null);
  const autoSaveTimeoutRef = useRef(null);
  const lastSavedDataRef = useRef(null);
  const isNewRef = useRef(false);

  // Determine base path
  const basePath = propBasePath || (userProfile?.counselorId && userProfile?.counseleeDocId
    ? `counselors/${userProfile.counselorId}/counselees/${userProfile.counseleeDocId}`
    : null);

  // Navigation: find current index in journals array (sorted newest first)
  const currentIndex = editingJournal?.id
    ? journals.findIndex(j => j.id === editingJournal.id)
    : -1;
  const hasNewer = currentIndex > 0;
  const hasOlder = currentIndex >= 0 && currentIndex < journals.length - 1;

  const navigateJournal = useCallback((direction) => {
    if (!onNavigate) return;
    if (direction === 'newer' && hasNewer) {
      onNavigate(journals[currentIndex - 1]);
    } else if (direction === 'older' && hasOlder) {
      onNavigate(journals[currentIndex + 1]);
    }
  }, [onNavigate, hasNewer, hasOlder, journals, currentIndex]);

  // Get current form data as object
  const getFormData = useCallback(() => ({
    title,
    goal,
    instructions,
    content,
    timesPerWeek,
    durationWeeks
  }), [title, goal, instructions, content, timesPerWeek, durationWeeks]);

  // Load existing journal
  useEffect(() => {
    if (editingJournal) {
      setTitle(editingJournal.title || '');
      setGoal(editingJournal.goal || '');
      setInstructions(editingJournal.instructions || '');
      setContent(editingJournal.content || '');
      setTimesPerWeek(editingJournal.timesPerWeek ?? 0);
      setDurationWeeks(editingJournal.durationWeeks ?? null);
      setCurrentJournalId(editingJournal.id);
      isNewRef.current = false;
      lastSavedDataRef.current = JSON.stringify({
        title: editingJournal.title || '',
        goal: editingJournal.goal || '',
        instructions: editingJournal.instructions || '',
        content: editingJournal.content || '',
        timesPerWeek: editingJournal.timesPerWeek ?? 0,
        durationWeeks: editingJournal.durationWeeks ?? null
      });
    } else {
      // New journal
      setTitle('');
      setGoal('');
      setInstructions('');
      setContent('');
      setTimesPerWeek(0);
      setDurationWeeks(null);
      setCurrentJournalId(null);
      isNewRef.current = true;
      lastSavedDataRef.current = JSON.stringify({ title: '', goal: '', instructions: '', content: '', timesPerWeek: 0, durationWeeks: null });
    }
    setDailyEntry('');
  }, [editingJournal]);

  // Check if data has changed
  const hasChanges = useCallback(() => {
    const currentData = JSON.stringify(getFormData());
    return currentData !== lastSavedDataRef.current;
  }, [getFormData]);

  // Auto-save function
  const autoSave = useCallback(async () => {
    if (!basePath || !hasChanges()) return;

    const formData = getFormData();
    // Don't save if completely empty
    if (!formData.title.trim() && !formData.content.trim()) return;

    setSaveStatus('saving');

    try {
      const journalData = {
        title: formData.title,
        goal: formData.goal,
        instructions: formData.instructions,
        content: formData.content,
        timesPerWeek: formData.timesPerWeek,
        durationWeeks: formData.durationWeeks,
        status: 'active',
        updatedAt: serverTimestamp()
      };

      if (currentJournalId) {
        await updateDoc(doc(db, `${basePath}/journals`, currentJournalId), journalData);
      } else {
        const docRef = await addDoc(collection(db, `${basePath}/journals`), {
          ...journalData,
          createdAt: serverTimestamp(),
          createdBy: role
        });
        setCurrentJournalId(docRef.id);

        // Log activity for creation
        if (isNewRef.current) {
          await addDoc(collection(db, `${basePath}/activityLog`), {
            action: 'journal_created',
            actor: role,
            actorUid: userProfile?.uid || '',
            actorName: userProfile?.name || role,
            details: `Created journal: ${formData.title || 'Untitled'}`,
            timestamp: serverTimestamp()
          });
          isNewRef.current = false;
        }
      }

      lastSavedDataRef.current = JSON.stringify(formData);
      setSaveStatus('saved');
    } catch (error) {
      console.error('Auto-save failed:', error);
      setSaveStatus('');
    }
  }, [basePath, currentJournalId, getFormData, hasChanges, role, userProfile?.name]);

  // Debounced auto-save on content changes
  useEffect(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      if (hasChanges()) {
        autoSave();
      }
    }, 2000);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [title, goal, instructions, content, timesPerWeek, durationWeeks, autoSave, hasChanges]);

  // Find linked homework for this journal
  const linkedHw = homework.find(h => h.linkedJournalingId === editingJournal?.id && h.status === 'active');

  // Add daily entry to main content + auto-complete homework (once per day)
  const handleAddEntry = async () => {
    if (!dailyEntry.trim() && dailyEntry !== '<p></p>') return;

    // Format date
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });

    // Create entry with date header
    const newEntry = `<p><strong>${dateStr}</strong></p>${dailyEntry}`;

    // Prepend to existing content (newest first)
    const separator = content.trim() ? '<hr/>' : '';
    setContent(newEntry + separator + content);
    setDailyEntry('');

    // Auto-complete linked homework (once per day - dailyCap is 1)
    if (linkedHw && basePath && role === 'counselee') {
      const completions = linkedHw.completions || [];
      const todayStr = now.toLocaleDateString('en-US', { timeZone: 'America/Chicago' });
      const alreadyDoneToday = completions.some(c => {
        const cDate = c.toDate ? c.toDate() : new Date(c);
        return cDate.toLocaleDateString('en-US', { timeZone: 'America/Chicago' }) === todayStr;
      });

      if (!alreadyDoneToday) {
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
            details: `Journaled in "${title || 'Untitled'}"`,
            timestamp: serverTimestamp()
          });
        } catch (error) {
          console.error('Failed to auto-complete journal homework:', error);
        }
      }
    }
  };

  // Submit (change status to active)
  const handleSubmit = async () => {
    if (!basePath) return;

    const formData = getFormData();
    if (!formData.title.trim() && !formData.content.trim()) {
      alert('Please add a title or content before submitting.');
      return;
    }

    setSaveStatus('saving');

    try {
      let journalId = currentJournalId;
      let linkedHomeworkId = editingJournal?.linkedHomeworkId || null;

      const journalData = {
        title: formData.title,
        goal: formData.goal,
        instructions: formData.instructions,
        content: formData.content,
        timesPerWeek: formData.timesPerWeek,
        durationWeeks: formData.durationWeeks,
        status: 'active',
        updatedAt: serverTimestamp()
      };

      // Save journal first
      if (journalId) {
        await updateDoc(doc(db, `${basePath}/journals`, journalId), journalData);

        // Log activity - check for homework setting changes
        const changeDetails = [];
        if (editingJournal) {
          const oldTpw = editingJournal.timesPerWeek ?? 0;
          const oldDur = editingJournal.durationWeeks ?? null;
          if (formData.timesPerWeek !== oldTpw) {
            changeDetails.push(`Changed journal homework to ${formData.timesPerWeek}x/week${oldTpw > 0 ? ` (was ${oldTpw}x/week)` : ''}`);
          }
          if (formData.durationWeeks !== oldDur) {
            const newDurStr = formData.durationWeeks ? `${formData.durationWeeks} weeks` : 'ongoing';
            const oldDurStr = oldDur ? `${oldDur} weeks` : 'ongoing';
            changeDetails.push(`Changed duration to ${newDurStr} (was ${oldDurStr})`);
          }
        }

        if (changeDetails.length > 0) {
          await addDoc(collection(db, `${basePath}/activityLog`), {
            action: 'journal_settings_changed',
            actor: role,
            actorUid: userProfile?.uid || '',
            actorName: userProfile?.name || role,
            details: changeDetails.join('. '),
            timestamp: serverTimestamp()
          });
        } else {
          await addDoc(collection(db, `${basePath}/activityLog`), {
            action: 'journal_edited',
            actor: role,
            actorUid: userProfile?.uid || '',
            actorName: userProfile?.name || role,
            details: `Updated journal: ${formData.title || 'Untitled'}`,
            timestamp: serverTimestamp()
          });
        }
      } else {
        const docRef = await addDoc(collection(db, `${basePath}/journals`), {
          ...journalData,
          createdAt: serverTimestamp(),
          createdBy: role
        });
        journalId = docRef.id;
        setCurrentJournalId(journalId);

        // Log activity for creation
        await addDoc(collection(db, `${basePath}/activityLog`), {
          action: 'journal_created',
          actor: role,
          actorUid: userProfile?.uid || '',
          actorName: userProfile?.name || role,
          details: `Created journal: ${formData.title || 'Untitled'}`,
          timestamp: serverTimestamp()
        });
      }

      // Handle linked homework based on timesPerWeek
      if (formData.timesPerWeek > 0) {
        const homeworkData = {
          title: `Journal: ${formData.title || 'Untitled'}`,
          description: formData.goal || formData.instructions || 'Write in your journal',
          type: 'journaling',
          assignedBy: role,
          status: 'active',
          weeklyTarget: formData.timesPerWeek,
          dailyCap: 1, // Journaling has hardcoded daily cap of 1
          durationWeeks: formData.durationWeeks,
          expiresAt: formData.durationWeeks
            ? Timestamp.fromDate(new Date(Date.now() + formData.durationWeeks * 7 * 24 * 60 * 60 * 1000))
            : null,
          linkedJournalingId: journalId,
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

          // Update journal with linked homework ID
          await updateDoc(doc(db, `${basePath}/journals`, journalId), {
            linkedHomeworkId
          });
        }
      } else if (linkedHomeworkId) {
        // timesPerWeek is 0 and there was linked homework - cancel it
        await updateDoc(doc(db, `${basePath}/homework`, linkedHomeworkId), {
          status: 'cancelled',
          updatedAt: serverTimestamp()
        });
        // Clear the link
        await updateDoc(doc(db, `${basePath}/journals`, journalId), {
          linkedHomeworkId: null
        });
      }

      setSaveStatus('submitted');
      onSaved?.();
      onClose();
    } catch (error) {
      console.error('Submit failed:', error);
      alert('Save failed: ' + error.message);
      setSaveStatus('');
    }
  };

  // Delete journal (and cascade delete linked homework)
  const handleDelete = async () => {
    if (!currentJournalId || !basePath) return;
    if (!window.confirm('Delete this journal? This cannot be undone.')) return;

    try {
      const deletedTitle = title || 'Untitled Journal';
      // Cascade delete linked homework
      const linkedHwId = editingJournal?.linkedHomeworkId;
      if (linkedHwId) {
        await deleteDoc(doc(db, `${basePath}/homework`, linkedHwId));
      }
      await deleteDoc(doc(db, `${basePath}/journals`, currentJournalId));
      await addDoc(collection(db, `${basePath}/activityLog`), {
        action: 'journal_deleted',
        actor: role,
        actorUid: userProfile?.uid || '',
        actorName: userProfile?.name || role,
        details: `Deleted journal: ${deletedTitle}`,
        timestamp: serverTimestamp()
      });
      onClose();
    } catch (error) {
      console.error('Delete failed:', error);
    }
  };

  return (
    <div className="jn-page">
      <header className="jn-page-header">
        <h1>Journaling</h1>
        <div className="jn-save-status">
          {saveStatus === 'saving' && 'Saving...'}
          {saveStatus === 'saved' && 'Saved'}
        </div>
      </header>

      <div className="jn-page-content">
        {/* Title */}
        <div className="jn-field-group">
          <label htmlFor="jn-title">Title</label>
          <input
            id="jn-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Journal title..."
            readOnly={isReadOnly}
          />
        </div>

        {/* Goal - visible to both, editable by counselor */}
        {(role === 'counselor' || goal) && (
          <div className="jn-field-group">
            <label htmlFor="jn-goal">Goal</label>
            <input
              id="jn-goal"
              type="text"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="What is the purpose of this journal?"
              readOnly={isReadOnly || role !== 'counselor'}
            />
          </div>
        )}

        {/* Instructions - visible to both, editable by counselor */}
        {(role === 'counselor' || instructions) && (
          <div className="jn-field-group">
            <label htmlFor="jn-instructions">Instructions</label>
            <textarea
              id="jn-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="How should the counselee use this journal? e.g., 'Write 3-5 sentences about what you're grateful for today.'"
              rows={2}
              readOnly={isReadOnly || role !== 'counselor'}
            />
          </div>
        )}

        {/* Homework Settings - both roles can set (except accountability) */}
        {!isReadOnly && (
        <div className="jn-homework-settings">
            <h3 className="jn-section-title">Homework Settings</h3>
            <small className="jn-hint">Set to 0x/week for a personal journal (no homework tracking).</small>
            <div className="jn-settings-row">
              <div className="jn-field-group jn-field-small">
                <label htmlFor="jn-times-per-week">Times per week</label>
                <select
                  id="jn-times-per-week"
                  value={timesPerWeek}
                  onChange={(e) => setTimesPerWeek(parseInt(e.target.value))}
                >
                  <option value={0}>0 (Personal only)</option>
                  {[1, 2, 3, 4, 5, 6, 7].map(n => (
                    <option key={n} value={n}>{n}x/week</option>
                  ))}
                </select>
              </div>
              <div className="jn-field-group jn-field-small">
                <label htmlFor="jn-duration">Duration</label>
                <select
                  id="jn-duration"
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
            {timesPerWeek > 0 && (
              <small className="jn-hint jn-homework-preview">
                Weekly target: {timesPerWeek}x/week (daily cap: 1)
                {durationWeeks ? ` for ${durationWeeks} weeks` : ', ongoing'}
              </small>
            )}
        </div>
        )}

        {/* Daily Entry - quick add (not for read-only) */}
        {!isReadOnly && (
        <div className="jn-field-group jn-daily-entry">
          <label>Add New Entry</label>
          <RichTextEditor
            content={dailyEntry}
            onChange={setDailyEntry}
            placeholder="Write today's entry..."
          />
          <button
            type="button"
            className="jn-add-entry-btn"
            onClick={handleAddEntry}
            disabled={!dailyEntry.trim() || dailyEntry === '<p></p>'}
          >
            Add Entry
          </button>
        </div>
        )}

        {/* Main content - all entries */}
        <div className="jn-field-group jn-main-content">
          <label>Journal Entries</label>
          <RichTextEditor
            content={content}
            onChange={isReadOnly ? () => {} : setContent}
            placeholder="Your journal entries will appear here..."
            readOnly={isReadOnly}
          />
        </div>
      </div>

      {/* Sticky footer with all controls */}
      <footer className="jn-sticky-footer">
        {/* Navigation arrows - only show when viewing existing journal */}
        {journals.length > 0 && editingJournal?.id && (
          <>
            <button
              type="button"
              className="jn-footer-btn jn-nav-btn"
              onClick={() => navigateJournal('newer')}
              disabled={!hasNewer}
              title="Newer"
            >&larr;</button>
            <button
              type="button"
              className="jn-footer-btn jn-nav-btn"
              onClick={() => navigateJournal('older')}
              disabled={!hasOlder}
              title="Older"
            >&rarr;</button>
          </>
        )}
        <button type="button" className="jn-footer-btn jn-back-btn" onClick={onClose}>
          Back
        </button>
        {!isReadOnly && (
          <>
            <button type="button" className="jn-footer-btn jn-submit-btn" onClick={handleSubmit} disabled={!title.trim() || !content.trim()}>
              {currentJournalId ? 'Update' : 'Submit'}
            </button>
            {currentJournalId && (
              <button type="button" className="jn-footer-btn jn-delete-btn" onClick={handleDelete}>
                Delete
              </button>
            )}
          </>
        )}
      </footer>
    </div>
  );
}
