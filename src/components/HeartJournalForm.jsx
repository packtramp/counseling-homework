import { useState, useEffect } from 'react';
import { db } from '../config/firebase';
import { collection, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';

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

export default function HeartJournalForm({ userProfile, onClose, onSaved, editingJournal = null }) {
  const [showHelp, setShowHelp] = useState(false);
  const [saving, setSaving] = useState(false);

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
    confessToOther: journal?.confessToOther || false,
    repentedBeforeGod: journal?.repentedBeforeGod || false,
    repentedBeforeOthers: journal?.repentedBeforeOthers || false
  });

  const [form, setForm] = useState(getInitialForm(editingJournal));

  // Update form when editingJournal changes
  useEffect(() => {
    setForm(getInitialForm(editingJournal));
  }, [editingJournal]);

  const toggleChip = (field, value) => {
    setForm(prev => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter(v => v !== value)
        : [...prev[field], value]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
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
        counseleeName: userProfile.name
      };

      if (editingJournal) {
        // Update existing journal
        await updateDoc(doc(db, `${basePath}/heartJournals`, editingJournal.id), {
          ...journalData,
          updatedAt: serverTimestamp()
        });
      } else {
        // Create new journal
        await addDoc(collection(db, `${basePath}/heartJournals`), {
          ...journalData,
          createdAt: serverTimestamp()
        });
      }
      onSaved?.();
      onClose();
    } catch (error) {
      console.error('Error saving heart journal:', error);
      alert('Error saving. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (showHelp) {
    return (
      <div className="help-overlay" onClick={() => setShowHelp(false)}>
        <div className="help-overlay-content" onClick={e => e.stopPropagation()}>
          <h3>Two Paths: The Anatomy of a Choice</h3>
          <div className="two-paths-diagram">
            <div className="path-column self-centered">
              <h4>Self-Centered Path</h4>
              <ul>
                <li>Feeling oriented</li>
                <li>Rooted in pride</li>
                <li>Focus on self</li>
                <li>Short-term relief</li>
                <li>Long-term consequences</li>
                <li>Guilt, shame, broken relationships</li>
              </ul>
            </div>
            <div className="path-column god-centered">
              <h4>God-Centered Path</h4>
              <ul>
                <li>Principle oriented</li>
                <li>Rooted in humility</li>
                <li>Focus on God's glory</li>
                <li>May be harder short-term</li>
                <li>Long-term blessing</li>
                <li>Peace, joy, restored relationships</li>
              </ul>
            </div>
          </div>
          <p>Every choice we make leads us down one of these two paths. Use this journal to examine your heart and grow in godliness.</p>
          <button className="help-close-btn" onClick={() => setShowHelp(false)}>Got it</button>
        </div>
      </div>
    );
  }

  return (
    <div className="heart-journal-overlay" onClick={onClose}>
      <div className="heart-journal-modal" onClick={e => e.stopPropagation()}>
        <div className="heart-journal-header">
          <button className="help-btn" onClick={() => setShowHelp(true)} title="View Two Paths diagram">?</button>
          <h2>{editingJournal ? 'Edit Heart Journal' : 'Heart Journal'}</h2>
          <button className="close-modal-btn" onClick={onClose}>Close</button>
        </div>

        <form className="heart-journal-content" onSubmit={handleSubmit}>
          <p className="heart-journal-quote">
            "Search me, O God, and know my heart; test me and know my anxious thoughts." - Psalm 139:23
          </p>
          <p className="heart-journal-instruction">
            Focus solely on YOUR sin, not the sin of another.
          </p>

          <div className="hj-field-group">
            <label>Date/Time of event</label>
            <input
              type="datetime-local"
              value={form.eventDateTime}
              onChange={e => setForm({ ...form, eventDateTime: e.target.value })}
            />
          </div>

          <div className="hj-field-group">
            <label>1. What happened (situation) and where?</label>
            <textarea
              value={form.situation}
              onChange={e => setForm({ ...form, situation: e.target.value })}
              placeholder="Describe the situation..."
            />
          </div>

          <div className="hj-field-group">
            <label>2. What led up to the event? (3 decisions)</label>
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
          </div>

          <div className="hj-field-group">
            <label>3a. What was I feeling at the time?</label>
            <textarea
              value={form.feelings}
              onChange={e => setForm({ ...form, feelings: e.target.value })}
              placeholder="My feelings..."
            />
          </div>

          <div className="hj-field-group">
            <label>3b. My response or action</label>
            <textarea
              value={form.response}
              onChange={e => setForm({ ...form, response: e.target.value })}
              placeholder="What I did..."
            />
          </div>

          <div className="hj-field-group">
            <label>3c. What was I thinking at the time?</label>
            <textarea
              value={form.thinking}
              onChange={e => setForm({ ...form, thinking: e.target.value })}
              placeholder="My thoughts..."
            />
          </div>

          <div className="hj-field-group">
            <label>3d. What did I want as the outcome?</label>
            <textarea
              value={form.wantedOutcome}
              onChange={e => setForm({ ...form, wantedOutcome: e.target.value })}
              placeholder="What I wanted..."
            />
          </div>

          <div className="hj-field-group">
            <label>4a. Heart idols - I WANTED</label>
            <div className="hj-chip-group">
              {WANTED_CHIPS.map(chip => (
                <button
                  key={chip}
                  type="button"
                  className={`hj-chip ${form.heartIdolsWanted.includes(chip) ? 'selected' : ''}`}
                  onClick={() => toggleChip('heartIdolsWanted', chip)}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          <div className="hj-field-group">
            <label>4b. Heart idols - I did NOT want</label>
            <div className="hj-chip-group">
              {NOT_WANTED_CHIPS.map(chip => (
                <button
                  key={chip}
                  type="button"
                  className={`hj-chip ${form.heartIdolsNotWanted.includes(chip) ? 'selected' : ''}`}
                  onClick={() => toggleChip('heartIdolsNotWanted', chip)}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          <div className="hj-field-group">
            <label>5. Fruit of the Spirit to grow in</label>
            <div className="hj-chip-group">
              {FRUIT_CHIPS.map(chip => (
                <button
                  key={chip}
                  type="button"
                  className={`hj-chip ${form.fruitToGrow.includes(chip) ? 'selected' : ''}`}
                  onClick={() => toggleChip('fruitToGrow', chip)}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          <div className="hj-field-group">
            <label>7. How did your action make others feel?</label>
            <textarea
              value={form.howOthersFelt}
              onChange={e => setForm({ ...form, howOthersFelt: e.target.value })}
              placeholder="How others felt..."
            />
          </div>

          <div className="hj-field-group">
            <label>8a. I want to glorify God by:</label>
            <textarea
              value={form.glorifyGodBy}
              onChange={e => setForm({ ...form, glorifyGodBy: e.target.value })}
              placeholder="How I will glorify God..."
            />
          </div>

          <div className="hj-field-group">
            <label>8b. What would have been God-honoring thoughts?</label>
            <textarea
              value={form.godHonoringThoughts}
              onChange={e => setForm({ ...form, godHonoringThoughts: e.target.value })}
              placeholder="God-honoring thoughts..."
            />
          </div>

          <div className="hj-field-group">
            <label>8c. What could I have done differently?</label>
            <textarea
              value={form.doneDifferently}
              onChange={e => setForm({ ...form, doneDifferently: e.target.value })}
              placeholder="What I could have done..."
            />
          </div>

          <div className="hj-field-group">
            <label>8d. How will this likely make me feel? (Reference Two Paths)</label>
            <textarea
              value={form.howFeelLater}
              onChange={e => setForm({ ...form, howFeelLater: e.target.value })}
              placeholder="How I will feel..."
            />
          </div>

          <div className="hj-field-group">
            <label>9a. Bible verse to memorize (with citation)</label>
            <textarea
              value={form.verseToMemorize}
              onChange={e => setForm({ ...form, verseToMemorize: e.target.value })}
              placeholder="Verse and reference..."
            />
          </div>

          <div className="hj-field-group">
            <label>9b. Change statement: "The next time I..."</label>
            <textarea
              value={form.changeStatement}
              onChange={e => setForm({ ...form, changeStatement: e.target.value })}
              placeholder="The next time I..."
            />
          </div>

          <div className="hj-field-group">
            <label className="hj-checkbox-row">
              <input
                type="checkbox"
                checked={form.commitToPray}
                onChange={e => setForm({ ...form, commitToPray: e.target.checked })}
              />
              <span>9c. Commit to pray daily for 1 week</span>
            </label>
            <label className="hj-checkbox-row">
              <input
                type="checkbox"
                checked={form.confessToOther}
                onChange={e => setForm({ ...form, confessToOther: e.target.checked })}
              />
              <span>9d. Confess to another brother/sister</span>
            </label>
          </div>

          <div className="hj-field-group">
            <label className="hj-checkbox-row">
              <input
                type="checkbox"
                checked={form.repentedBeforeGod}
                onChange={e => setForm({ ...form, repentedBeforeGod: e.target.checked })}
              />
              <span>11a. Repented before God?</span>
            </label>
            <label className="hj-checkbox-row">
              <input
                type="checkbox"
                checked={form.repentedBeforeOthers}
                onChange={e => setForm({ ...form, repentedBeforeOthers: e.target.checked })}
              />
              <span>11b. Repented before others?</span>
            </label>
          </div>

          <button type="submit" className="hj-submit-btn" disabled={saving}>
            {saving ? 'Saving...' : (editingJournal ? 'Update Entry' : 'Save Heart Journal Entry')}
          </button>
        </form>
      </div>
    </div>
  );
}
