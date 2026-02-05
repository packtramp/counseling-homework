/**
 * Reusable Heart Journals Tile - displays list of journals
 *
 * Props:
 * - journals: array of heart journal entries
 * - role: 'counselee' | 'counselor'
 * - onView: (journal) => void - called when viewing a journal (opens HeartJournalPage)
 * - onAdd: () => void - called when adding new (counselee only)
 */
export default function HeartJournalsTile({
  journals = [],
  role = 'counselee',
  onView,
  onAdd
}) {
  const isCounselor = role === 'counselor';

  // Separate drafts from submitted journals
  const drafts = journals.filter(j => j.status === 'draft');
  const submitted = journals.filter(j => j.status !== 'draft');

  const formatDate = (timestamp) => {
    if (!timestamp) return 'No date';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatShortDate = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="heart-journals-tile">
      <div className="hj-tile-header">
        <span className="hj-tile-title">
          Heart Journals ({submitted.length})
          {drafts.length > 0 && !isCounselor && (
            <span className="hj-draft-count"> + {drafts.length} draft{drafts.length > 1 ? 's' : ''}</span>
          )}
        </span>
        {!isCounselor && onAdd && (
          <button className="hj-add-btn" onClick={onAdd} title="New Heart Journal">
            <svg viewBox="0 0 24 24" width="24" height="24">
              <path
                d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                fill="#e53e3e"
              />
              <path
                d="M11 7v4H9v2h2v5h2v-5h2v-2h-2V7h-2z"
                fill="white"
              />
            </svg>
          </button>
        )}
      </div>

      <div className="hj-tile-content">
        {/* Drafts section - counselee only */}
        {drafts.length > 0 && !isCounselor && (
          <div className="hj-drafts-section">
            {drafts.map(journal => (
              <div
                key={journal.id}
                className="hj-draft-item"
                onClick={() => onView?.(journal)}
              >
                <span className="hj-draft-label">Continue Draft</span>
                <span className="hj-draft-date">
                  {formatShortDate(journal.lastAutoSavedAt || journal.createdAt)}
                </span>
                {journal.situation && (
                  <span className="hj-draft-preview">
                    {journal.situation.substring(0, 30)}
                    {journal.situation.length > 30 ? '...' : ''}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Submitted journals */}
        {submitted.length === 0 && drafts.length === 0 ? (
          <p className="empty-list">No heart journal entries yet.</p>
        ) : submitted.length === 0 ? (
          <p className="empty-list hj-no-submitted">No submitted entries yet.</p>
        ) : (
          <ul className="heart-journal-list">
            {submitted.map(journal => (
              <li
                key={journal.id}
                className="heart-journal-item"
                onClick={() => onView?.(journal)}
              >
                <span className="heart-journal-date">
                  {formatDate(journal.eventDateTime || journal.createdAt)}
                </span>
                <span className="heart-journal-preview">
                  {journal.situation?.substring(0, 50) || 'No details'}
                  {journal.situation?.length > 50 ? '...' : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
