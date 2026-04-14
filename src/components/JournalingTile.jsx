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

  // Filter out expired journals. Legacy fallback: compute from submittedAt + durationWeeks
  // when expiresAt wasn't written (pre-fix docs).
  const isExpired = (j) => {
    if (j.status === 'expired') return true;
    if (j.expiresAt) {
      const exp = j.expiresAt.toDate ? j.expiresAt.toDate() : new Date(j.expiresAt);
      return exp <= new Date();
    }
    if (j.durationWeeks && j.submittedAt) {
      const submitted = j.submittedAt.toDate ? j.submittedAt.toDate() : new Date(j.submittedAt);
      const exp = new Date(submitted.getTime() + j.durationWeeks * 7 * 24 * 60 * 60 * 1000);
      return exp <= new Date();
    }
    return false;
  };
  const activeJournals = journals.filter(j => !isExpired(j));

  const formatDate = (timestamp) => {
    if (!timestamp) return 'No date';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="journaling-tile">
      <div className="jn-tile-header">
        <span className="jn-tile-title">
          Journaling ({activeJournals.length})
        </span>
      </div>

      <div className="jn-tile-content">
        {activeJournals.length === 0 ? (
          <p className="empty-list">No journal entries yet.</p>
        ) : (
          <ul className="journal-list">
            {activeJournals.map(journal => (
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
