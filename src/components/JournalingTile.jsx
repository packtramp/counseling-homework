/**
 * Journaling Tile - displays list of journal entries
 *
 * Props:
 * - journals: array of journal entries
 * - role: 'counselee' | 'counselor' | 'accountability'
 * - onView: (journal) => void - called when viewing a journal
 * - onAdd: () => void - called when adding new
 */
export default function JournalingTile({
  journals = [],
  role = 'counselee',
  onView,
  onAdd
}) {
  const canEdit = role === 'counselee' || role === 'counselor'; // Accountability is read-only
  const formatDate = (timestamp) => {
    if (!timestamp) return 'No date';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="journaling-tile">
      <div className="jn-tile-header">
        <span className="jn-tile-title">
          Journaling ({journals.length})
        </span>
        {canEdit && onAdd && (
          <button className="jn-add-btn" onClick={onAdd} title="New Journal Entry">
            {/* Blue square with open book icon */}
            <svg viewBox="0 0 24 24" width="24" height="24">
              {/* Blue background square */}
              <rect x="0" y="0" width="24" height="24" rx="4" fill="#2c5282"/>
              {/* Open book icon */}
              <path
                d="M6 6C6 5.45 6.45 5 7 5H11V17H7C6.45 17 6 16.55 6 16V6Z"
                fill="white"
              />
              <path
                d="M13 5H17C17.55 5 18 5.45 18 6V16C18 16.55 17.55 17 17 17H13V5Z"
                fill="white"
              />
              {/* Book spine */}
              <rect x="11" y="5" width="2" height="12" fill="#e2e8f0"/>
              {/* White cross for "new" */}
              <path
                d="M11 9v2H9v2h2v2h2v-2h2v-2h-2V9h-2z"
                fill="#2c5282"
              />
            </svg>
          </button>
        )}
      </div>

      <div className="jn-tile-content">
        {journals.length === 0 ? (
          <p className="empty-list">No journal entries yet.</p>
        ) : (
          <ul className="journal-list">
            {journals.map(journal => (
              <li
                key={journal.id}
                className="journal-item"
                onClick={() => onView?.(journal)}
              >
                <span className="journal-title-preview">
                  {journal.title || 'Untitled'}
                </span>
                <span className="journal-date">
                  {formatDate(journal.updatedAt || journal.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
