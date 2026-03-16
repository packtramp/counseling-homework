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
