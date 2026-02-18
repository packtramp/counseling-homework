import { useState } from 'react';
import RichTextEditor from './RichTextEditor';
import { getCompletionsForDay, isCompletedToday, getTodayProgress, getWeeklyProgress, isItemBehind } from '../utils/homeworkHelpers';

/**
 * Reusable Homework Tile with Current/Done tabs
 *
 * Props:
 * - homework: array of homework items
 * - role: 'counselee' | 'counselor'
 * - onComplete: (item) => void - called when counselee checks off item
 * - onUncheck: (item) => void - called when unchecking item in Done tab (removes last completion)
 * - onEdit: (item, changes) => void - called when saving edits
 * - onCancel: (item) => void - called when cancelling homework
 * - onReactivate: (itemId) => void - called when reactivating cancelled homework
 * - onDelete: (itemId) => void - counselor only, permanent delete
 * - onAdd: (newHomework) => void - called when adding new homework
 * - showSessionFilter: boolean - show "This session only" toggle (counselor session view)
 * - sessionFilterOnly: boolean - current filter state
 * - onSessionFilterChange: (checked) => void - toggle callback
 * - completingId: string - ID of item currently being completed (for loading state)
 * - onOpenThinkList: (item) => void - called when clicking a Think List homework item
 */
export default function HomeworkTile({
  homework = [],
  role = 'counselee',
  onComplete,
  onUncheck,
  onEdit,
  onCancel,
  onReactivate,
  onDelete,
  onAdd,
  showSessionFilter = false,
  sessionFilterOnly = false,
  onSessionFilterChange,
  completingId = null,
  onOpenThinkList
}) {
  const [homeworkTab, setHomeworkTab] = useState('current');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newHomework, setNewHomework] = useState({ title: '', description: '', timesPerWeek: 7, recurring: true });
  const [editingHomework, setEditingHomework] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', description: '', timesPerWeek: 7, recurring: true, assignedDate: '' });
  const [originalValues, setOriginalValues] = useState(null);

  const isCounselor = role === 'counselor';

  // Helper: Get last completion date
  const getLastCompletionDate = (item) => {
    const completions = item.completions || [];
    if (completions.length === 0) return null;
    let latest = null;
    completions.forEach(c => {
      const cDate = c.toDate ? c.toDate() : new Date(c);
      if (!latest || cDate > latest) latest = cDate;
    });
    return latest;
  };

  // Helper: Format short date
  const formatShortDate = (date) => {
    if (!date) return '';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Helper: Get current weekly period end date
  const getPeriodEndDate = (item) => {
    let assignedDate;
    if (item.assignedDate?.toDate) {
      assignedDate = item.assignedDate.toDate();
    } else if (item.assignedDate) {
      assignedDate = new Date(item.assignedDate);
    } else {
      return null;
    }
    const now = new Date();
    const msPerDay = 24 * 60 * 60 * 1000;
    const msPerWeek = 7 * msPerDay;
    const weeksSinceAssigned = Math.max(0, Math.floor((now - assignedDate) / msPerWeek));
    const weekStartMs = assignedDate.getTime() + (weeksSinceAssigned * msPerWeek);
    const periodEnd = new Date(weekStartMs + 6 * msPerDay);
    return periodEnd;
  };

  // Helper: Get total weeks accomplished out of total elapsed weeks
  const getWeeksAccomplished = (item) => {
    const completions = item.completions || [];
    const weeklyTarget = item.weeklyTarget || 7;
    const dailyCap = item.dailyCap || 999;
    let assignedDate;
    if (item.assignedDate?.toDate) {
      assignedDate = item.assignedDate.toDate();
    } else if (item.assignedDate) {
      assignedDate = new Date(item.assignedDate);
    } else {
      return null;
    }
    const now = new Date();
    const msPerDay = 24 * 60 * 60 * 1000;
    const msPerWeek = 7 * msPerDay;
    const totalWeeks = Math.floor((now - assignedDate) / msPerWeek);
    // Include current (in-progress) week in count
    const totalPeriodsIncludingCurrent = totalWeeks + 1;
    let completed = 0;
    for (let w = 0; w < totalWeeks; w++) {
      const weekStart = new Date(assignedDate.getTime() + w * msPerWeek);
      const weekEnd = new Date(assignedDate.getTime() + (w + 1) * msPerWeek);
      const maxFirstWeekCap = dailyCap < 999 ? 6 * dailyCap : 6;
      const effectiveTarget = w === 0 ? Math.min(weeklyTarget, maxFirstWeekCap) : weeklyTarget;
      const dailyBuckets = {};
      for (const c of completions) {
        const cDate = c.toDate ? c.toDate() : (c.date ? new Date(c.date) : new Date(c));
        if (cDate >= weekStart && cDate < weekEnd) {
          const dayKey = cDate.toDateString();
          dailyBuckets[dayKey] = (dailyBuckets[dayKey] || 0) + 1;
        }
      }
      let weeklyCompleted = 0;
      for (const count of Object.values(dailyBuckets)) {
        weeklyCompleted += Math.min(count, dailyCap);
      }
      if (weeklyCompleted >= effectiveTarget) completed++;
    }
    // Check current week too
    const progress = getWeeklyProgress(item);
    if (progress.current >= progress.target) completed++;
    return { completed, total: totalPeriodsIncludingCurrent };
  };

  // Helper: Check if weekly target is fully met for this period
  const isWeeklyComplete = (item) => {
    if (item.status === 'cancelled') return false;
    const progress = getWeeklyProgress(item);
    return progress.current >= progress.target;
  };

  // Helper: Get streak info - consecutive weeks completed or missed
  const getStreakInfo = (item) => {
    const completions = item.completions || [];
    const weeklyTarget = item.weeklyTarget || 7;
    const dailyCap = item.dailyCap || 999;
    let assignedDate;
    if (item.assignedDate?.toDate) {
      assignedDate = item.assignedDate.toDate();
    } else if (item.assignedDate) {
      assignedDate = new Date(item.assignedDate);
    } else {
      return null;
    }
    const now = new Date();
    const msPerDay = 24 * 60 * 60 * 1000;
    const msPerWeek = 7 * msPerDay;
    const totalWeeks = Math.floor((now - assignedDate) / msPerWeek);
    if (totalWeeks === 0) return null; // Still in first week

    const weekResults = [];
    for (let w = 0; w < totalWeeks; w++) {
      const weekStart = new Date(assignedDate.getTime() + w * msPerWeek);
      const weekEnd = new Date(assignedDate.getTime() + (w + 1) * msPerWeek);
      const maxFirstWeekCap = dailyCap < 999 ? 6 * dailyCap : 6;
      const effectiveTarget = w === 0 ? Math.min(weeklyTarget, maxFirstWeekCap) : weeklyTarget;
      const dailyBuckets = {};
      for (const c of completions) {
        const cDate = c.toDate ? c.toDate() : (c.date ? new Date(c.date) : new Date(c));
        if (cDate >= weekStart && cDate < weekEnd) {
          const dayKey = cDate.toDateString();
          dailyBuckets[dayKey] = (dailyBuckets[dayKey] || 0) + 1;
        }
      }
      let weeklyCompleted = 0;
      for (const count of Object.values(dailyBuckets)) {
        weeklyCompleted += Math.min(count, dailyCap);
      }
      weekResults.push(weeklyCompleted >= effectiveTarget);
    }

    // Count streak from most recent completed week backward
    let streak = 0;
    const isPositive = weekResults[weekResults.length - 1];
    for (let i = weekResults.length - 1; i >= 0; i--) {
      if (weekResults[i] === isPositive) {
        streak++;
      } else {
        break;
      }
    }
    return { streak, isPositive, totalWeeks: weekResults.length };
  };

  // Filter homework: Done tab = cancelled, completed status, completed today, OR weekly target met
  const activeHomework = homework.filter(h =>
    (!h.status || h.status === 'active') &&
    !isWeeklyComplete(h) &&
    (isCounselor ? (h.status !== 'cancelled' && h.status !== 'completed' && !isCompletedToday(h)) : !isCompletedToday(h))
  );
  const completedHomework = homework.filter(h =>
    h.status === 'cancelled' || h.status === 'completed' || isCompletedToday(h) || isWeeklyComplete(h)
  );

  // Get change notes for counselee edits
  const getChangeNotes = () => {
    if (!originalValues) return null;
    const changes = [];
    if (editForm.timesPerWeek !== originalValues.timesPerWeek) {
      changes.push(`Changed from ${originalValues.timesPerWeek}x/week to ${editForm.timesPerWeek}x/week`);
    }
    if (editForm.title !== originalValues.title) {
      changes.push(`Renamed from "${originalValues.title}"`);
    }
    if (editForm.recurring !== originalValues.recurring) {
      changes.push(editForm.recurring ? 'Changed to recurring' : 'Changed to one-time');
    }
    return changes.length > 0 ? changes : null;
  };

  const startEdit = (item) => {
    // Format assignedDate for datetime-local input
    let assignedDateStr = '';
    if (item.assignedDate) {
      const d = item.assignedDate.toDate ? item.assignedDate.toDate() : new Date(item.assignedDate);
      const pad = (n) => n.toString().padStart(2, '0');
      assignedDateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    setEditingHomework(item);
    setEditForm({
      title: item.title,
      description: item.description || '',
      timesPerWeek: item.weeklyTarget || 7,
      recurring: item.recurring !== false,
      assignedDate: assignedDateStr
    });
    setOriginalValues({
      title: item.title,
      description: item.description || '',
      timesPerWeek: item.weeklyTarget || 7,
      recurring: item.recurring !== false
    });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingHomework || !onEdit) {
      console.error('Cannot save: editingHomework or onEdit missing', { editingHomework, hasOnEdit: !!onEdit });
      return;
    }
    try {
      const changeNotes = !isCounselor ? getChangeNotes() : null;
      await onEdit(editingHomework, {
        title: editForm.title,
        description: editForm.description,
        weeklyTarget: parseInt(editForm.timesPerWeek) || 7,
        recurring: editForm.recurring,
        assignedDate: editForm.assignedDate ? new Date(editForm.assignedDate) : null,
        changeNotes
      });
      setEditingHomework(null);
      setOriginalValues(null);
    } catch (err) {
      console.error('Save failed:', err);
      alert('Failed to save: ' + err.message);
    }
  };

  const handleAddHomework = async (e) => {
    e.preventDefault();
    if (!newHomework.title.trim() || !onAdd) return;
    await onAdd({
      title: newHomework.title,
      description: newHomework.description,
      weeklyTarget: parseInt(newHomework.timesPerWeek) || 7,
      recurring: newHomework.recurring
    });
    setNewHomework({ title: '', description: '', timesPerWeek: 7, recurring: true });
    setShowAddForm(false);
  };

  const changeNotes = getChangeNotes();

  return (
    <div className="homework-tabbed-tile">
      <div className="homework-tabs-header">
        <div className="homework-tabs-left">
          <span className="homework-tabs-title">Homework</span>
          {showSessionFilter && (
            <label className="session-filter-toggle">
              <input
                type="checkbox"
                checked={sessionFilterOnly}
                onChange={(e) => onSessionFilterChange?.(e.target.checked)}
              />
              <span>This session only</span>
            </label>
          )}
          {!showSessionFilter && onAdd && (
            <button className="add-homework-btn" onClick={() => setShowAddForm(true)}>+</button>
          )}
        </div>
        <div className="homework-tabs-right">
          <div className="homework-tabs">
            <button
              className={`homework-tab ${homeworkTab === 'current' ? 'active' : ''}`}
              onClick={() => setHomeworkTab('current')}
            >
              Current ({activeHomework.length})
            </button>
            <button
              className={`homework-tab ${homeworkTab === 'done' ? 'active' : ''}`}
              onClick={() => setHomeworkTab('done')}
            >
              Done ({completedHomework.length})
            </button>
          </div>
          {showSessionFilter && onAdd && (
            <button className="add-homework-btn" onClick={() => setShowAddForm(true)}>+</button>
          )}
        </div>
      </div>

      <div className="homework-tabs-content">
        {showAddForm && (
          <form className="add-form" onSubmit={handleAddHomework}>
            <input
              type="text"
              placeholder="Homework title"
              value={newHomework.title}
              onChange={(e) => setNewHomework({ ...newHomework, title: e.target.value })}
              required
            />
            {isCounselor ? (
              <div className="description-editor">
                <RichTextEditor
                  content={newHomework.description}
                  onChange={(val) => setNewHomework({ ...newHomework, description: val })}
                  placeholder="Description (optional)"
                />
              </div>
            ) : (
              <input
                type="text"
                placeholder="Description (optional)"
                value={newHomework.description}
                onChange={(e) => setNewHomework({ ...newHomework, description: e.target.value })}
              />
            )}
            <div className="frequency-row">
              <input
                type="number"
                min="1"
                max="7"
                value={newHomework.timesPerWeek}
                onChange={(e) => setNewHomework({ ...newHomework, timesPerWeek: e.target.value })}
                className="frequency-input"
              />
              <span>times per week</span>
            </div>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={newHomework.recurring}
                onChange={(e) => setNewHomework({ ...newHomework, recurring: e.target.checked })}
              />
              <span>Recurring (continues each week until stopped)</span>
            </label>
            <div className="form-buttons">
              <button type="submit">Assign</button>
              <button type="button" onClick={() => setShowAddForm(false)}>Cancel</button>
            </div>
          </form>
        )}

        {homeworkTab === 'current' ? (
          activeHomework.length === 0 && !showAddForm ? (
            <p className="empty-list">No current homework.</p>
          ) : (
            <div className="homework-status-list">
              {activeHomework.map(item => {
                const doneToday = isCompletedToday(item);
                const progress = getWeeklyProgress(item);
                const isCompleting = completingId === item.id;
                const isEditing = editingHomework?.id === item.id;
                const isBehind = isItemBehind(item);

                if (isEditing) {
                  return (
                    <li key={item.id} className={isCounselor ? 'homework-edit-inline' : 'counselee-edit-form'}>
                      <button
                        type="button"
                        className="edit-close-btn"
                        onClick={() => setEditingHomework(null)}
                        aria-label="Close"
                      >
                        ×
                      </button>
                      <form onSubmit={handleSaveEdit}>
                        <input
                          type="text"
                          value={editForm.title}
                          onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                          placeholder="Title"
                          required
                        />
                        <div className="description-editor">
                          <RichTextEditor
                            content={editForm.description}
                            onChange={(val) => setEditForm({ ...editForm, description: val })}
                            placeholder="Description (optional)"
                          />
                        </div>
                        {isCounselor && (
                          <div className="date-row">
                            <label>Assigned:</label>
                            <input
                              type="datetime-local"
                              value={editForm.assignedDate}
                              onChange={(e) => setEditForm({ ...editForm, assignedDate: e.target.value })}
                              className="assigned-date-input"
                            />
                          </div>
                        )}
                        {getPeriodEndDate(item) && (() => {
                          const weeks = getWeeksAccomplished(item);
                          const prog = getWeeklyProgress(item);
                          return (
                            <div className="date-row">
                              <label>Due:</label>
                              <span className="due-date-display">
                                {getPeriodEndDate(item).toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric', year: 'numeric' })}
                                {weeks && <span className="weeks-accomplished"> {weeks.completed}/{weeks.total} weeks</span>}
                                <span className="daily-progress"> - {prog.current}/{prog.target} this week</span>
                              </span>
                            </div>
                          );
                        })()}
                        <div className="frequency-row">
                          <input
                            type="number"
                            min="1"
                            max="7"
                            value={editForm.timesPerWeek}
                            onChange={e => setEditForm({ ...editForm, timesPerWeek: e.target.value })}
                            className="frequency-input"
                          />
                          <span>times per week</span>
                        </div>
                        <label className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={editForm.recurring}
                            onChange={(e) => setEditForm({ ...editForm, recurring: e.target.checked })}
                          />
                          <span>Recurring (continues each week until stopped)</span>
                        </label>
                        {!isCounselor && changeNotes && (
                          <div className="change-note">
                            Note to counselor: {changeNotes.join('; ')}
                          </div>
                        )}
                        <div className="form-buttons-row">
                          <button type="submit" className="save-btn">Save</button>
                          {onCancel && (
                            <button
                              type="button"
                              className="cancel-homework-btn"
                              onClick={() => {
                                onCancel(item);
                                setEditingHomework(null);
                              }}
                            >
                              Cancel Homework
                            </button>
                          )}
                          {isCounselor && onDelete && (
                            <button
                              type="button"
                              className="delete-btn"
                              onClick={() => {
                                onDelete(item.id);
                                setEditingHomework(null);
                              }}
                            >
                              Delete Forever
                            </button>
                          )}
                        </div>
                      </form>
                    </li>
                  );
                }

                const streak = getStreakInfo(item);

                if (isCounselor) {
                  const isThinkList = !!item.linkedThinkListId;
                  return (
                    <div key={item.id} className={`homework-status-item ${doneToday ? 'done-today' : ''} ${isBehind ? 'behind' : ''} ${isThinkList ? 'thinklist-item' : ''}`}
                      onClick={isThinkList && onOpenThinkList ? () => onOpenThinkList(item) : undefined}
                      style={isThinkList && onOpenThinkList ? { cursor: 'pointer' } : undefined}
                    >
                      {isThinkList ? (
                        <span className="thinklist-indicator">
                          <svg viewBox="1 0 22 24" width="28" height="28">
                            <path d="M8 4 C6 3.5 4 5 3.5 7 C3 9 3 11 4 13 C5 14.5 6.5 15 8 15 L8 15.5 C8.5 16.5 7.5 17.5 8 18.5 C8.5 19.5 9.5 19.5 10 19 L10.5 18 C11 17.5 12 17 13 17 C14 17.5 15.5 17.5 16.5 16.5 C17.5 15.5 18 14 18 13 C19 12 19.5 10 19 8 C18.5 6 17.5 4.5 16 4 C14.5 3.5 13 4 12 4.5 C11 3.5 9.5 3.5 8 4Z" fill="#F8A4B8" stroke="#333" strokeWidth="1" strokeLinejoin="round"/>
                            <path d="M4.5 7.5 C7 8.5 9 7.5 11.5 8 C13.5 8.5 16 7.5 18 8" fill="none" stroke="#333" strokeWidth="0.7"/>
                            <path d="M4 10.5 C6 11.5 9 10.5 11 11 C13 11.5 16 10.5 18.5 11" fill="none" stroke="#333" strokeWidth="0.7"/>
                            <path d="M5 13.5 C7 14 9 13 11 13.5" fill="none" stroke="#333" strokeWidth="0.7"/>
                            <path d="M13 17 C13.5 15.5 13 14 13.5 13" fill="none" stroke="#333" strokeWidth="0.6"/>
                            <path d="M10.5 7v2H8v2h2.5v5h2v-5H15v-2h-2.5V7h-2z" fill="white"/>
                          </svg>
                        </span>
                      ) : (
                        <span className={`counselor-check-indicator ${doneToday ? 'checked' : ''}`}>
                          {doneToday ? '✓' : ''}
                        </span>
                      )}
                      <a className="homework-status-title clickable" onClick={(e) => { if (isThinkList && onOpenThinkList) { e.stopPropagation(); onOpenThinkList(item); } else if (!isThinkList) startEdit(item); }}>
                        {item.title}
                      </a>
                      <span className="homework-status-progress">
                        {isThinkList ? (() => {
                          const todayProg = getTodayProgress(item);
                          return todayProg.cap ? `${todayProg.count}/${todayProg.cap} today · ` : '';
                        })() : ''}{progress.current}/{progress.target} this week
                        {streak && (
                          <span className={`streak-info ${streak.isPositive ? 'streak-positive' : 'streak-negative'}`}>
                            {streak.isPositive ? ` · ${streak.streak}wk streak` : ` · missed ${streak.streak}wk`}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                }

                // B-side: same compact layout as A-side, but with interactive check button
                const isThinkList = !!item.linkedThinkListId;
                return (
                  <div key={item.id} className={`homework-status-item ${doneToday ? 'done-today' : ''} ${isBehind ? 'behind' : ''} ${isThinkList ? 'thinklist-item' : ''}`}
                    onClick={isThinkList && onOpenThinkList ? () => onOpenThinkList(item) : undefined}
                    style={isThinkList && onOpenThinkList ? { cursor: 'pointer' } : undefined}
                  >
                    {isThinkList ? (
                      <span className="thinklist-indicator">
                        <svg viewBox="1 0 22 24" width="28" height="28">
                          <path d="M8 4 C6 3.5 4 5 3.5 7 C3 9 3 11 4 13 C5 14.5 6.5 15 8 15 L8 15.5 C8.5 16.5 7.5 17.5 8 18.5 C8.5 19.5 9.5 19.5 10 19 L10.5 18 C11 17.5 12 17 13 17 C14 17.5 15.5 17.5 16.5 16.5 C17.5 15.5 18 14 18 13 C19 12 19.5 10 19 8 C18.5 6 17.5 4.5 16 4 C14.5 3.5 13 4 12 4.5 C11 3.5 9.5 3.5 8 4Z" fill="#F8A4B8" stroke="#333" strokeWidth="1" strokeLinejoin="round"/>
                          <path d="M4.5 7.5 C7 8.5 9 7.5 11.5 8 C13.5 8.5 16 7.5 18 8" fill="none" stroke="#333" strokeWidth="0.7"/>
                          <path d="M4 10.5 C6 11.5 9 10.5 11 11 C13 11.5 16 10.5 18.5 11" fill="none" stroke="#333" strokeWidth="0.7"/>
                          <path d="M5 13.5 C7 14 9 13 11 13.5" fill="none" stroke="#333" strokeWidth="0.7"/>
                          <path d="M13 17 C13.5 15.5 13 14 13.5 13" fill="none" stroke="#333" strokeWidth="0.6"/>
                          <path d="M10.5 7v2H8v2h2.5v5h2v-5H15v-2h-2.5V7h-2z" fill="white"/>
                        </svg>
                      </span>
                    ) : (
                      <button
                        className={`check-btn ${doneToday ? 'checked' : ''} ${isCompleting ? 'completing' : ''}`}
                        onClick={() => onComplete?.(item)}
                        disabled={doneToday || isCompleting}
                      >
                        {doneToday ? '✓' : isCompleting ? '...' : ''}
                      </button>
                    )}
                    <a className="homework-status-title clickable" onClick={(e) => { if (isThinkList && onOpenThinkList) { e.stopPropagation(); onOpenThinkList(item); } else if (!isThinkList) startEdit(item); }}>
                      {item.title}
                    </a>
                    <span className="homework-status-progress">
                      {isThinkList ? (() => {
                        const todayProg = getTodayProgress(item);
                        return todayProg.cap ? `${todayProg.count}/${todayProg.cap} today · ` : '';
                      })() : ''}{progress.current}/{progress.target} this week
                      {streak && (
                        <span className={`streak-info ${streak.isPositive ? 'streak-positive' : 'streak-negative'}`}>
                          {streak.isPositive ? ` · ${streak.streak}wk streak` : ` · missed ${streak.streak}wk`}
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          completedHomework.length === 0 ? (
            <p className="empty-list">No done homework.</p>
          ) : (
            <ul className="done-homework-list">
              {completedHomework.map(item => {
                const progress = getWeeklyProgress(item);
                const lastDate = getLastCompletionDate(item);
                const isCancelled = item.status === 'cancelled';
                const canUncheck = !isCancelled && onUncheck;
                const isEditing = editingHomework?.id === item.id;
                const isBehind = isItemBehind(item);

                if (isEditing) {
                  return (
                    <li key={item.id} className={isCounselor ? 'homework-edit-inline' : 'counselee-edit-form'}>
                      <button
                        type="button"
                        className="edit-close-btn"
                        onClick={() => setEditingHomework(null)}
                        aria-label="Close"
                      >
                        ×
                      </button>
                      <form onSubmit={handleSaveEdit}>
                        <input
                          type="text"
                          value={editForm.title}
                          onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                          placeholder="Title"
                          required
                        />
                        <div className="description-editor">
                          <RichTextEditor
                            content={editForm.description}
                            onChange={(val) => setEditForm({ ...editForm, description: val })}
                            placeholder="Description (optional)"
                          />
                        </div>
                        {isCounselor && (
                          <div className="date-row">
                            <label>Assigned:</label>
                            <input
                              type="datetime-local"
                              value={editForm.assignedDate}
                              onChange={(e) => setEditForm({ ...editForm, assignedDate: e.target.value })}
                              className="assigned-date-input"
                            />
                          </div>
                        )}
                        {getPeriodEndDate(item) && (() => {
                          const weeks = getWeeksAccomplished(item);
                          const prog = getWeeklyProgress(item);
                          return (
                            <div className="date-row">
                              <label>Due:</label>
                              <span className="due-date-display">
                                {getPeriodEndDate(item).toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric', year: 'numeric' })}
                                {weeks && <span className="weeks-accomplished"> {weeks.completed}/{weeks.total} weeks</span>}
                                <span className="daily-progress"> - {prog.current}/{prog.target} this week</span>
                              </span>
                            </div>
                          );
                        })()}
                        <div className="frequency-row">
                          <input
                            type="number"
                            min="1"
                            max="7"
                            value={editForm.timesPerWeek}
                            onChange={e => setEditForm({ ...editForm, timesPerWeek: e.target.value })}
                            className="frequency-input"
                          />
                          <span>times per week</span>
                        </div>
                        <label className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={editForm.recurring}
                            onChange={(e) => setEditForm({ ...editForm, recurring: e.target.checked })}
                          />
                          <span>Recurring (continues each week until stopped)</span>
                        </label>
                        {!isCounselor && changeNotes && (
                          <div className="change-note">
                            Note to counselor: {changeNotes.join('; ')}
                          </div>
                        )}
                        <div className="form-buttons-row">
                          <button type="submit" className="save-btn">Save</button>
                          {onCancel && (
                            <button
                              type="button"
                              className="cancel-homework-btn"
                              onClick={() => {
                                onCancel(item);
                                setEditingHomework(null);
                              }}
                            >
                              Cancel Homework
                            </button>
                          )}
                          {isCounselor && onDelete && (
                            <button
                              type="button"
                              className="delete-btn"
                              onClick={() => {
                                onDelete(item.id);
                                setEditingHomework(null);
                              }}
                            >
                              Delete Forever
                            </button>
                          )}
                        </div>
                      </form>
                    </li>
                  );
                }

                const streak = getStreakInfo(item);

                return (
                  <li key={item.id} className={`homework-done-item ${isCancelled ? 'cancelled' : ''} ${isBehind ? 'behind' : ''}`}>
                    {canUncheck ? (
                      <button
                        className="counselor-check-indicator checked clickable-check"
                        onClick={() => onUncheck(item)}
                        title="Undo completion"
                      >
                        ✓
                      </button>
                    ) : (
                      <span className={`counselor-check-indicator ${!isCancelled ? 'checked' : ''}`}>
                        {isCancelled ? '✕' : '✓'}
                      </span>
                    )}
                    <a className="done-item-title clickable" onClick={() => startEdit(item)}>{item.title}</a>
                    <span className="done-item-date">{isCancelled ? 'Cancelled' : formatShortDate(lastDate)}</span>
                    <span className="done-item-progress">
                      {progress.current}/{progress.target}
                      {streak && !isCancelled && (
                        <span className={`streak-info ${streak.isPositive ? 'streak-positive' : 'streak-negative'}`}>
                          {streak.isPositive ? ` · ${streak.streak}wk` : ` · missed ${streak.streak}wk`}
                        </span>
                      )}
                    </span>
                    {isCancelled && onReactivate && (
                      <button
                        className="reinstate-btn"
                        onClick={() => onReactivate(item.id)}
                        title="Reinstate homework"
                      >
                        Reinstate
                      </button>
                    )}
                    {isCounselor && onDelete && (
                      <button
                        className="delete-btn-small"
                        onClick={() => onDelete(item.id)}
                        title="Delete permanently"
                      >
                        Delete
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )
        )}
      </div>
    </div>
  );
}
