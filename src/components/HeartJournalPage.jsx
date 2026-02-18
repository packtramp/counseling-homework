import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../config/firebase';
import { collection, addDoc, doc, updateDoc, deleteDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';

const WANTED_CHIPS = ['Pleasure', 'Comfort', 'Respect', 'Acknowledgment', 'Control', 'Power', 'Acceptance', 'Safety', 'Peace', 'Security'];
const NOT_WANTED_CHIPS = ['Conflict', 'Anxiety', 'Fear', 'Pain', 'Discomfort'];
const FRUIT_CHIPS = ['Love', 'Joy', 'Peace', 'Patience', 'Kindness', 'Goodness', 'Faithfulness', 'Gentleness', 'Self-Control'];

// Helper to format date for datetime-local input
const formatDateTimeLocal = (timestamp) => {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const pad = (n) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

// Helper to format date for display
const formatDateTimeDisplay = (timestamp) => {
  if (!timestamp) return 'Not specified';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
};

/**
 * HeartJournalPage - Full-page Heart Journal view with edit/read-only modes
 *
 * Props:
 * - userProfile: user profile object with counselorId, counseleeDocId, name
 * - onClose: () => void - called when closing the page
 * - onSaved: () => void - called after saving
 * - editingJournal: journal object to edit/view (null for new)
 * - role: 'counselee' | 'counselor' | 'accountability' - determines permissions
 * - readOnly: boolean - force read-only mode (for accountability)
 */
export default function HeartJournalPage({ userProfile, onClose, onSaved, editingJournal = null, role = 'counselee', readOnly: forceReadOnly = false }) {
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(''); // '', 'saving', 'saved'
  const [currentJournalId, setCurrentJournalId] = useState(editingJournal?.id || null);
  const autoSaveTimeoutRef = useRef(null);
  const lastSavedFormRef = useRef(null);

  const isCounselor = role === 'counselor';
  const isAccountability = role === 'accountability';
  const canEverEdit = role === 'counselee'; // Only counselees can edit

  // Determine initial read-only state:
  // - Counselor/Accountability: always read-only
  // - Counselee on new/draft: edit mode
  // - Counselee on submitted: read-only (can toggle to edit)
  const getInitialReadOnly = () => {
    if (forceReadOnly || isCounselor || isAccountability) return true;
    if (!editingJournal) return false; // New journal = edit mode
    if (editingJournal.status === 'draft') return false;
    return true; // Submitted = start in read-only
  };

  const [readOnly, setReadOnly] = useState(getInitialReadOnly());
  const [showHelpImage, setShowHelpImage] = useState(false);

  const getInitialForm = (journal) => ({
    eventDateTime: journal ? formatDateTimeLocal(journal.eventDateTime) : '',
    situation: journal?.situation || '',
    decision1: journal?.decision1 || '',
    decision2: journal?.decision2 || '',
    decision3: journal?.decision3 || '',
    feelings: journal?.feelings || '',
    response: journal?.response || '',
    thinking: journal?.thinking || '',
    wantedOutcome: journal?.wantedOutcome || '',
    heartIdolsWanted: journal?.heartIdolsWanted || [],
    heartIdolsNotWanted: journal?.heartIdolsNotWanted || [],
    fruitToGrow: journal?.fruitToGrow || [],
    howOthersFelt: journal?.howOthersFelt || '',
    glorifyGodBy: journal?.glorifyGodBy || '',
    godHonoringThoughts: journal?.godHonoringThoughts || '',
    doneDifferently: journal?.doneDifferently || '',
    howFeelLater: journal?.howFeelLater || '',
    verseToMemorize: journal?.verseToMemorize || '',
    changeStatement: journal?.changeStatement || '',
    commitToPray: journal?.commitToPray || false,
    repentedBeforeGod: journal?.repentedBeforeGod || false
  });

  // Get repentance script parts (shared between display and save)
  const getRepentanceScriptParts = () => {
    const response = form.response?.trim() || '[your action]';
    const idols = form.heartIdolsWanted?.length > 0
      ? form.heartIdolsWanted.join(' and ').toLowerCase()
      : '[what you wanted]';
    const howOthersFelt = form.howOthersFelt?.trim() || '[how they felt]';
    const doneDifferently = form.doneDifferently?.trim() || '[what you would do differently]';

    // Build the "to help me grow" parts
    const growthParts = [];
    if (form.verseToMemorize?.trim()) growthParts.push(`memorize ${form.verseToMemorize.trim()}`);
    if (form.changeStatement?.trim()) growthParts.push(form.changeStatement.trim());
    if (form.commitToPray) growthParts.push('pray daily for one week');
    growthParts.push('confess to another brother/sister');

    const growthText = growthParts.length > 0 ? growthParts.join(', ') : '[your growth plan]';

    return { response, idols, howOthersFelt, doneDifferently, growthText };
  };

  // Plain text version for saving to Firestore
  const getRepentanceScriptText = () => {
    const { response, idols, howOthersFelt, doneDifferently, growthText } = getRepentanceScriptParts();
    return `When I ${response}, I was really wanting ${idols}. I recognize that my actions hurt you and you felt ${howOthersFelt}. Next time this happens, I want to respond by ${doneDifferently}. To help me grow and change in this area I am going to ${growthText}. Will you forgive me?`;
  };

  // JSX version with underlined fill-ins for display
  const generateRepentanceScript = () => {
    const { response, idols, howOthersFelt, doneDifferently, growthText } = getRepentanceScriptParts();
    const U = ({ children }) => <span className="hj-script-fill">{children}</span>;

    return (
      <>
        When I <U>{response}</U>, I was really wanting <U>{idols}</U>. I recognize that my actions hurt you and you felt <U>{howOthersFelt}</U>. Next time this happens, I want to respond by <U>{doneDifferently}</U>. To help me grow and change in this area I am going to <U>{growthText}</U>. Will you forgive me?
      </>
    );
  };

  const [form, setForm] = useState(getInitialForm(editingJournal));

  // Update form when editingJournal changes
  useEffect(() => {
    setForm(getInitialForm(editingJournal));
    setCurrentJournalId(editingJournal?.id || null);
    lastSavedFormRef.current = JSON.stringify(getInitialForm(editingJournal));
    setReadOnly(getInitialReadOnly());
  }, [editingJournal]);

  // Check if form has meaningful content (for auto-save)
  const hasContent = useCallback(() => {
    return form.situation.trim() ||
      form.feelings.trim() ||
      form.response.trim() ||
      form.thinking.trim() ||
      form.heartIdolsWanted.length > 0 ||
      form.heartIdolsNotWanted.length > 0;
  }, [form]);

  // Check if form has changed since last save
  const hasChanged = useCallback(() => {
    return JSON.stringify(form) !== lastSavedFormRef.current;
  }, [form]);

  // Auto-save draft function
  const saveDraft = useCallback(async () => {
    if (!hasContent() || !hasChanged() || readOnly) return;

    setSaveStatus('saving');
    try {
      const basePath = `counselors/${userProfile.counselorId}/counselees/${userProfile.counseleeDocId}`;
      const journalData = {
        ...form,
        eventDateTime: form.eventDateTime ? new Date(form.eventDateTime) : null,
        counseleeName: userProfile.name,
        status: 'draft',
        lastAutoSavedAt: serverTimestamp()
      };

      if (currentJournalId) {
        // Update existing draft
        await updateDoc(doc(db, `${basePath}/heartJournals`, currentJournalId), {
          ...journalData,
          updatedAt: serverTimestamp()
        });
      } else {
        // Create new draft
        const docRef = await addDoc(collection(db, `${basePath}/heartJournals`), {
          ...journalData,
          createdAt: serverTimestamp()
        });
        setCurrentJournalId(docRef.id);
      }
      lastSavedFormRef.current = JSON.stringify(form);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(''), 2000);
    } catch (error) {
      console.error('Error auto-saving draft:', error);
      setSaveStatus('');
    }
  }, [form, currentJournalId, userProfile, hasContent, hasChanged, readOnly]);

  // Debounced auto-save on form change (only when not read-only)
  useEffect(() => {
    if (readOnly) return;

    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Only auto-save if there's content and changes
    if (hasContent() && hasChanged()) {
      autoSaveTimeoutRef.current = setTimeout(() => {
        saveDraft();
      }, 3000); // 3 second debounce
    }

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [form, hasContent, hasChanged, saveDraft, readOnly]);

  const toggleChip = (field, value) => {
    if (readOnly) return;
    setForm(prev => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter(v => v !== value)
        : [...prev[field], value]
    }));
  };

  // Submit (finalize) the journal
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (readOnly) return;
    if (!form.situation.trim()) {
      alert('Please describe what happened');
      return;
    }

    setSaving(true);
    try {
      const basePath = `counselors/${userProfile.counselorId}/counselees/${userProfile.counseleeDocId}`;
      const journalData = {
        ...form,
        eventDateTime: form.eventDateTime ? new Date(form.eventDateTime) : null,
        counseleeName: userProfile.name,
        status: 'submitted',
        repentanceScript: getRepentanceScriptText()
      };

      if (currentJournalId) {
        // Update existing (was draft or editing)
        await updateDoc(doc(db, `${basePath}/heartJournals`, currentJournalId), {
          ...journalData,
          updatedAt: serverTimestamp(),
          submittedAt: serverTimestamp()
        });
      } else {
        // Create new submitted entry
        const docRef = await addDoc(collection(db, `${basePath}/heartJournals`), {
          ...journalData,
          createdAt: serverTimestamp(),
          submittedAt: serverTimestamp()
        });
        setCurrentJournalId(docRef.id);
      }

      // If "commit to pray" is checked, create homework item (if not already created for this journal)
      if (form.commitToPray && currentJournalId) {
        // Check if homework already exists for this journal
        const homeworkQuery = query(
          collection(db, `${basePath}/homework`),
          where('sourceJournalId', '==', currentJournalId)
        );
        const existingHomework = await getDocs(homeworkQuery);

        if (existingHomework.empty) {
          const situationPreview = form.situation.substring(0, 50) + (form.situation.length > 50 ? '...' : '');
          await addDoc(collection(db, `${basePath}/homework`), {
            title: `Pray daily about...${situationPreview}`,
            description: 'From Heart Journal commitment',
            frequency: 7,
            daysPerWeek: 7,
            repeating: false,
            status: 'active',
            source: 'heart-journal',
            sourceJournalId: currentJournalId,
            createdAt: serverTimestamp(),
            assignedAt: serverTimestamp()
          });
        }
      }

      // Log activity
      await addDoc(collection(db, `${basePath}/activityLog`), {
        action: 'heart_journal_submitted',
        actor: 'counselee',
        actorUid: userProfile?.uid || '',
        actorName: userProfile.name,
        details: `Submitted Heart Journal`,
        timestamp: serverTimestamp()
      });

      onSaved?.();
      onClose();
    } catch (error) {
      console.error('Error submitting heart journal:', error);
      alert('Error saving. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Handle back button - save draft if there's content (only in edit mode)
  const handleBack = async () => {
    if (!readOnly && hasContent() && hasChanged()) {
      await saveDraft();
    }
    onClose();
  };

  // Handle cancel - close without saving (with confirmation if changes exist)
  const handleCancel = () => {
    if (!readOnly && hasChanged() && hasContent()) {
      if (!window.confirm('You have unsaved changes. Are you sure you want to cancel without saving?')) {
        return;
      }
    }
    onClose();
  };

  // Handle delete draft (only for drafts, not submitted)
  const handleDelete = async () => {
    if (!currentJournalId) return;
    if (editingJournal?.status === 'submitted') {
      alert('Submitted entries cannot be deleted.');
      return;
    }
    if (!window.confirm('Are you sure you want to delete this draft? This cannot be undone.')) {
      return;
    }
    try {
      const basePath = `counselors/${userProfile.counselorId}/counselees/${userProfile.counseleeDocId}`;
      await deleteDoc(doc(db, `${basePath}/heartJournals`, currentJournalId));
      await addDoc(collection(db, `${basePath}/activityLog`), {
        action: 'heart_journal_deleted',
        actor: 'counselee',
        actorUid: userProfile?.uid || '',
        actorName: userProfile?.name || 'counselee',
        details: 'Deleted Heart Journal draft',
        timestamp: serverTimestamp()
      });
      onSaved?.();
      onClose();
    } catch (error) {
      console.error('Error deleting draft:', error);
      alert('Error deleting draft. Please try again.');
    }
  };

  // Toggle help image popup
  const toggleHelpImage = () => {
    setShowHelpImage(!showHelpImage);
  };

  // Toggle edit mode for counselees viewing submitted journals
  const handleEditToggle = () => {
    if (!isCounselor) {
      setReadOnly(false);
    }
  };

  // Render a text field - either as input or display text based on readOnly
  const renderTextField = (value, onChange, placeholder, multiline = false) => {
    if (readOnly) {
      return <div className="hj-readonly-value">{value || <span className="hj-empty">Not filled in</span>}</div>;
    }
    if (multiline) {
      return (
        <textarea
          value={value}
          onChange={onChange}
          placeholder={placeholder}
        />
      );
    }
    return (
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
    );
  };

  // Render chips - either as buttons or display chips based on readOnly
  const renderChips = (chips, selectedChips, field) => {
    if (readOnly) {
      if (selectedChips.length === 0) {
        return <div className="hj-readonly-value"><span className="hj-empty">None selected</span></div>;
      }
      return (
        <div className="hj-chip-group">
          {selectedChips.map(chip => (
            <span key={chip} className="hj-chip selected readonly">{chip}</span>
          ))}
        </div>
      );
    }
    return (
      <div className="hj-chip-group">
        {chips.map(chip => (
          <button
            key={chip}
            type="button"
            className={`hj-chip ${selectedChips.includes(chip) ? 'selected' : ''}`}
            onClick={() => toggleChip(field, chip)}
          >
            {chip}
          </button>
        ))}
      </div>
    );
  };

  // Render checkbox - either as checkbox or display text based on readOnly
  const renderCheckbox = (checked, onChange, label) => {
    if (readOnly) {
      return (
        <div className="hj-readonly-checkbox">
          <span className={`hj-check-indicator ${checked ? 'checked' : ''}`}>
            {checked ? '✓' : '✗'}
          </span>
          <span>{label}</span>
        </div>
      );
    }
    return (
      <label className="hj-checkbox-row">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
        />
        <span>{label}</span>
      </label>
    );
  };

  // Get page title based on state
  const getPageTitle = () => {
    if (!editingJournal) return 'Heart Journal';
    if (editingJournal.status === 'draft') return 'Heart Journal (Draft)';
    if (readOnly) return 'Heart Journal Entry';
    return 'Edit Heart Journal';
  };

  return (
    <div className="heart-journal-page">
      <header className="hj-page-header">
        <h2>{getPageTitle()}</h2>
        {saveStatus && !readOnly && (
          <span className={`save-status ${saveStatus}`}>
            {saveStatus === 'saving' ? 'Saving...' : 'Draft saved'}
          </span>
        )}
      </header>

      <main className="hj-page-content">
        {/* Edit button for counselees viewing submitted entries - at top of content */}
        {readOnly && canEverEdit && editingJournal?.status === 'submitted' && (
          <div className="hj-edit-bar">
            <button className="hj-edit-toggle-btn" onClick={handleEditToggle}>Edit Entry</button>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <p className="heart-journal-quote">
            "Search me, O God, and know my heart; test me and know my anxious thoughts." - Psalm 139:23
          </p>
          <p className="heart-journal-instruction">
            Focus solely on YOUR sin, not the sin of another.
          </p>

          <div className="hj-field-group">
            <label>Date/Time of event</label>
            {readOnly ? (
              <div className="hj-readonly-value">{formatDateTimeDisplay(editingJournal?.eventDateTime)}</div>
            ) : (
              <input
                type="datetime-local"
                value={form.eventDateTime}
                onChange={e => setForm({ ...form, eventDateTime: e.target.value })}
              />
            )}
          </div>

          <div className="hj-field-group">
            <label>What happened (situation) and where?</label>
            {renderTextField(form.situation, e => setForm({ ...form, situation: e.target.value }), 'Describe the situation...', true)}
          </div>

          <hr className="hj-section-divider" />

          <div className="hj-field-group">
            <label>What led up to the event? (3 decisions)</label>
            {readOnly ? (
              <div className="hj-decisions-display">
                {(form.decision1 || form.decision2 || form.decision3) ? (
                  <ul>
                    {form.decision1 && <li>{form.decision1}</li>}
                    {form.decision2 && <li>{form.decision2}</li>}
                    {form.decision3 && <li>{form.decision3}</li>}
                  </ul>
                ) : (
                  <div className="hj-readonly-value"><span className="hj-empty">Not filled in</span></div>
                )}
              </div>
            ) : (
              <div className="hj-decisions-group">
                <input
                  type="text"
                  placeholder="Decision 1"
                  value={form.decision1}
                  onChange={e => setForm({ ...form, decision1: e.target.value })}
                />
                <input
                  type="text"
                  placeholder="Decision 2"
                  value={form.decision2}
                  onChange={e => setForm({ ...form, decision2: e.target.value })}
                />
                <input
                  type="text"
                  placeholder="Decision 3"
                  value={form.decision3}
                  onChange={e => setForm({ ...form, decision3: e.target.value })}
                />
              </div>
            )}
          </div>

          <hr className="hj-section-divider" />

          <div className="hj-field-group">
            <label>What was I feeling at the time?</label>
            {renderTextField(form.feelings, e => setForm({ ...form, feelings: e.target.value }), 'My feelings...', true)}
          </div>

          <div className="hj-field-group">
            <label>My response or action</label>
            {renderTextField(form.response, e => setForm({ ...form, response: e.target.value }), 'What I did...', true)}
          </div>

          <div className="hj-field-group">
            <label>What was I thinking at the time?</label>
            {renderTextField(form.thinking, e => setForm({ ...form, thinking: e.target.value }), 'My thoughts...', true)}
          </div>

          <div className="hj-field-group">
            <label>What did I want as the outcome?</label>
            {renderTextField(form.wantedOutcome, e => setForm({ ...form, wantedOutcome: e.target.value }), 'What I wanted...', true)}
          </div>

          <hr className="hj-section-divider" />

          <div className="hj-field-group">
            <label>Heart idols - I WANTED</label>
            {renderChips(WANTED_CHIPS, form.heartIdolsWanted, 'heartIdolsWanted')}
          </div>

          <div className="hj-field-group">
            <label>Heart idols - I did NOT want</label>
            {renderChips(NOT_WANTED_CHIPS, form.heartIdolsNotWanted, 'heartIdolsNotWanted')}
          </div>

          <hr className="hj-section-divider" />

          <div className="hj-field-group">
            <label>Fruit of the Spirit to grow in</label>
            {renderChips(FRUIT_CHIPS, form.fruitToGrow, 'fruitToGrow')}
          </div>

          <hr className="hj-section-divider" />

          <div className="hj-field-group">
            <label>How did your action make others feel?</label>
            {renderTextField(form.howOthersFelt, e => setForm({ ...form, howOthersFelt: e.target.value }), 'How others felt...', true)}
          </div>

          <hr className="hj-section-divider" />

          <div className="hj-field-group">
            <label>I want to glorify God by:</label>
            {renderTextField(form.glorifyGodBy, e => setForm({ ...form, glorifyGodBy: e.target.value }), 'How I will glorify God...', true)}
          </div>

          <div className="hj-field-group">
            <label>What would have been God-honoring thoughts?</label>
            {renderTextField(form.godHonoringThoughts, e => setForm({ ...form, godHonoringThoughts: e.target.value }), 'God-honoring thoughts...', true)}
          </div>

          <div className="hj-field-group">
            <label>What could I have done differently?</label>
            {renderTextField(form.doneDifferently, e => setForm({ ...form, doneDifferently: e.target.value }), 'What I could have done...', true)}
          </div>

          <div className="hj-field-group">
            <label>How will this likely make me feel? (Reference Two Paths)</label>
            {renderTextField(form.howFeelLater, e => setForm({ ...form, howFeelLater: e.target.value }), 'How I will feel...', true)}
          </div>

          <hr className="hj-section-divider" />

          <div className="hj-field-group">
            <label>Bible verse to memorize (with citation)</label>
            {renderTextField(form.verseToMemorize, e => setForm({ ...form, verseToMemorize: e.target.value }), 'Verse and reference...', true)}
          </div>

          <div className="hj-field-group">
            <label>Change statement: "The next time I..."</label>
            {renderTextField(form.changeStatement, e => setForm({ ...form, changeStatement: e.target.value }), 'The next time I...', true)}
          </div>

          <div className="hj-field-group hj-checkbox-group">
            {renderCheckbox(form.commitToPray, e => setForm({ ...form, commitToPray: e.target.checked }), 'Commit to pray daily for 1 week')}
            <p className="hj-reminder-text">Remember to confess to another brother/sister</p>
          </div>

          <hr className="hj-section-divider" />

          <div className="hj-field-group hj-checkbox-group">
            {renderCheckbox(form.repentedBeforeGod, e => setForm({ ...form, repentedBeforeGod: e.target.checked }), 'Repented before God?')}
          </div>

          <div className="hj-field-group">
            <label>Repentance Script (to say when repenting to others)</label>
            <div className="hj-repentance-script">
              {generateRepentanceScript()}
            </div>
          </div>

        </form>
      </main>

      {/* Sticky footer with all controls */}
      <footer className="hj-sticky-footer">
        <button type="button" className="hj-footer-btn hj-back-btn" onClick={handleBack}>
          Back
        </button>
        {!readOnly && (
          <>
            <button type="button" className="hj-footer-btn hj-draft-btn" onClick={handleBack}>
              Save Draft
            </button>
            <button type="button" className="hj-footer-btn hj-submit-btn" onClick={handleSubmit} disabled={saving}>
              {saving ? 'Saving...' : (editingJournal?.status === 'submitted' ? 'Update' : 'Submit')}
            </button>
            {currentJournalId && editingJournal?.status === 'draft' && (
              <button type="button" className="hj-footer-btn hj-delete-btn" onClick={handleDelete}>
                Delete
              </button>
            )}
          </>
        )}
        {readOnly && canEverEdit && (
          <button type="button" className="hj-footer-btn hj-edit-btn" onClick={handleEditToggle}>
            Edit
          </button>
        )}
      </footer>

      {/* Floating Help Button */}
      <button
        className="hj-floating-help"
        onClick={toggleHelpImage}
        title="View Heart Journal Reference"
      >
        <svg viewBox="0 0 24 24" width="32" height="32">
          <path
            d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
            fill="#e53e3e"
          />
          <text x="12" y="13" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">?</text>
        </svg>
      </button>

      {/* Help Image Popup */}
      {showHelpImage && (
        <div className="hj-help-overlay" onClick={toggleHelpImage}>
          <div className="hj-help-popup" onClick={e => e.stopPropagation()}>
            <button className="hj-help-close" onClick={toggleHelpImage}>&times;</button>
            <img src="/heart-journal-page1.jpg" alt="Heart Journal Reference - Two Paths" />
          </div>
        </div>
      )}
    </div>
  );
}
