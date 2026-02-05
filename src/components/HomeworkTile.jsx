import { useState } from 'react';
import RichTextEditor from './RichTextEditor';

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
  completingId = null
}) {
  const [homeworkTab, setHomeworkTab] = useState('current');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newHomework, setNewHomework] = useState({ title: '', description: '', timesPerWeek: 7, recurring: true });
  const [editingHomework, setEditingHomework] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', description: '', timesPerWeek: 7, recurring: true, assignedDate: '' });
  const [originalValues, setOriginalValues] = useState(null);

  const isCounselor = role === 'counselor';

  // Helper: Count completions for a specific day (for daily cap logic)
  const getCompletionsForDay = (completions, targetDate) => {
    const targetStr = targetDate.toDateString();
    return completions.filter(c => {
      const date = c.toDate ? c.toDate() : (c.date ? new Date(c.date) : new Date(c));
      return date.toDateString() === targetStr;
    }).length;
  };

  // Helper: Check if completed today (or hit daily cap)
  const isCompletedToday = (item) => {
    if (!item.completions || item.completions.length === 0) return false;
    const today = new Date();
    const todayCount = getCompletionsForDay(item.completions, today);
    // If there's a daily cap, check if we've hit it; otherwise, any completion counts
    const dailyCap = item.dailyCap || 999;
    return todayCount >= dailyCap || (todayCount > 0 && !item.dailyCap);
  };

  // Helper: Get today's completions count and remaining (for display)
  const getTodayProgress = (item) => {
    const completions = item.completions || [];
    const today = new Date();
    const todayCount = getCompletionsForDay(completions, today);
    const dailyCap = item.dailyCap || null;
    return { count: todayCount, cap: dailyCap };
  };

  // Helper: Get weekly progress (respecting daily caps)
  const getWeeklyProgress = (item) => {
    const completions = item.completions || [];
    const weeklyTarget = item.weeklyTarget || 7;
    const dailyCap = item.dailyCap || 999; // Default to no cap
    let assignedDate;
    if (item.assignedDate?.toDate) {
      assignedDate = item.assignedDate.toDate();
    } else if (item.assignedDate) {
      assignedDate = new Date(item.assignedDate);
    } else {
      assignedDate = new Date();
    }
    const now = new Date();
    const msPerDay = 24 * 60 * 60 * 1000;
    const msPerWeek = 7 * msPerDay;
    const weeksSinceAssigned = Math.max(0, Math.floor((now - assignedDate) / msPerWeek));

    // Group completions by day within this week
    const dailyCounts = {};
    completions.forEach(c => {
      const cDate = c.toDate ? c.toDate() : (c.date ? new Date(c.date) : new Date(c));
      const weekNum = Math.floor((cDate - assignedDate) / msPerWeek);
      if (weekNum === weeksSinceAssigned) {
        const dayKey = cDate.toDateString();
        dailyCounts[dayKey] = (dailyCounts[dayKey] || 0) + 1;
      }
    });

    // Sum capped daily completions
    let currentWeekCompletions = 0;
    for (const count of Object.values(dailyCounts)) {
      currentWeekCompletions += Math.min(count, dailyCap);
    }

    // Week 1 pro-rate: assignment night doesn't count as a full day
    const effectiveTarget = weeksSinceAssigned === 0 ? Math.min(weeklyTarget, 6) : weeklyTarget;
    return { current: currentWeekCompletions, target: effectiveTarget };
  };

  // Helper: Check if item is "behind" - can't catch up even with perfect completion
  // Logic: isBehind = (cappedCompletionsThisWeek + maxPossibleRemaining) < effectiveTarget
  const isItemBehind = (item) => {
    if (item.status === 'cancelled') return false;
    const completions = item.completions || [];
    const weeklyTarget = item.weeklyTarget || 7;
    const dailyCap = item.dailyCap || 999; // Default to no cap
    let assignedDate;
    if (item.assignedDate?.toDate) {
      assignedDate = item.assignedDate.toDate();
    } else if (item.assignedDate) {
      assignedDate = new Date(item.assignedDate);
    } else {
      assignedDate = new Date();
    }
    const now = new Date();
    const msPerDay = 24 * 60 * 60 * 1000;
    const msPerWeek = 7 * msPerDay;
    const weeksSinceAssigned = Math.max(0, Math.floor((now - assignedDate) / msPerWeek));

    // Group completions by day within this week
    const dailyCounts = {};
    completions.forEach(c => {
      const cDate = c.toDate ? c.toDate() : (c.date ? new Date(c.date) : new Date(c));
      const weekNum = Math.floor((cDate - assignedDate) / msPerWeek);
      if (weekNum === weeksSinceAssigned) {
        const dayKey = cDate.toDateString();
        dailyCounts[dayKey] = (dailyCounts[dayKey] || 0) + 1;
      }
    });

    // Sum capped daily completions
    let currentWeekCompletions = 0;
    for (const count of Object.values(dailyCounts)) {
      currentWeekCompletions += Math.min(count, dailyCap);
    }

    // Calculate days remaining in this homework week (including today)
    const weekStartMs = assignedDate.getTime() + (weeksSinceAssigned * msPerWeek);
    const dayOfWeek = Math.floor((now.getTime() - weekStartMs) / msPerDay);
    const daysRemaining = 7 - dayOfWeek;

    // For "behind" calculation with daily cap, max possible = daysRemaining * min(dailyCap, 1)
    // But for simplicity, if there's a daily cap, max per day is that cap
    // Otherwise it's 1 (assuming they do at least 1 per day max)
    const maxPerDay = dailyCap < 999 ? dailyCap : 1;
    const maxPossibleRemaining = daysRemaining * maxPerDay;

    // Week 1 pro-rate: assignment night doesn't count as a full day
    // e.g. 7/week assigned Thu 8pm = only 6 full days (Fri-Wed), so cap target at 6
    // Week 2+ gets full target since they had all 7 days
    const effectiveTarget = weeksSinceAssigned === 0 ? Math.min(weeklyTarget, 6) : weeklyTarget;

    // Behind if even perfect completion from now can't meet target
    return (currentWeekCompletions + maxPossibleRemaining) < effectiveTarget;
  };

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
      const effectiveTarget = w === 0 ? Math.min(weeklyTarget, 6) : weeklyTarget;
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
      const effectiveTarget = w === 0 ? Math.min(weeklyTarget, 6) : weeklyTarget;
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
                  return (
                    <div key={item.id} className={`homework-status-item ${doneToday ? 'done-today' : ''} ${isBehind ? 'behind' : ''}`}>
                      <span className={`counselor-check-indicator ${doneToday ? 'checked' : ''}`}>
                        {doneToday ? '✓' : ''}
                      </span>
                      <a className="homework-status-title clickable" onClick={() => startEdit(item)}>
                        {item.title}
                      </a>
                      <span className="homework-status-progress">
                        {progress.current}/{progress.target} this week
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
                return (
                  <div key={item.id} className={`homework-status-item ${doneToday ? 'done-today' : ''} ${isBehind ? 'behind' : ''}`}>
                    <button
                      className={`check-btn ${doneToday ? 'checked' : ''} ${isCompleting ? 'completing' : ''}`}
                      onClick={() => onComplete?.(item)}
                      disabled={doneToday || isCompleting}
                    >
                      {doneToday ? '✓' : isCompleting ? '...' : ''}
                    </button>
                    <a className="homework-status-title clickable" onClick={() => startEdit(item)}>
                      {item.title}
                    </a>
                    <span className="homework-status-progress">
                      {progress.current}/{progress.target} this week
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
