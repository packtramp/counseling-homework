/**
 * Reusable Think Lists Tile - displays list of think lists
 *
 * Props:
 * - thinkLists: array of think list entries
 * - role: 'counselee' | 'counselor' | 'accountability'
 * - onView: (thinkList) => void - called when viewing a think list (opens ThinkListPage)
 * - onAdd: () => void - called when adding new
 */
export default function ThinkListsTile({
  thinkLists = [],
  role = 'counselee',
  onView,
  onAdd
}) {
  const canEdit = role === 'counselee' || role === 'counselor'; // Accountability is read-only

  // Separate drafts from submitted think lists (exclude expired — by status OR by expiresAt timestamp)
  const isExpired = (t) => {
    if (t.status === 'expired') return true;
    if (t.expiresAt) {
      const exp = t.expiresAt.toDate ? t.expiresAt.toDate() : new Date(t.expiresAt);
      return exp <= new Date();
    }
    return false;
  };
  const drafts = thinkLists.filter(t => t.status === 'draft');
  const submitted = thinkLists.filter(t => t.status !== 'draft' && !isExpired(t));

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
    <div className="think-lists-tile">
      <div className="tl-tile-header">
        <span className="tl-tile-title">
          Think Lists ({submitted.length})
          {drafts.length > 0 && canEdit && (
            <span className="tl-draft-count"> + {drafts.length} draft{drafts.length > 1 ? 's' : ''}</span>
          )}
        </span>
      </div>

      <div className="tl-tile-content">
        {/* Drafts section */}
        {drafts.length > 0 && canEdit && (
          <div className="tl-drafts-section">
            {drafts.map(thinkList => (
              <div
                key={thinkList.id}
                className="tl-draft-item"
                onClick={() => onView?.(thinkList)}
              >
                <span className="tl-draft-label">Continue Draft</span>
                <span className="tl-draft-date">
                  {formatShortDate(thinkList.lastAutoSavedAt || thinkList.createdAt)}
                </span>
                {thinkList.title && (
                  <span className="tl-draft-preview">
                    {thinkList.title.substring(0, 30)}
                    {thinkList.title.length > 30 ? '...' : ''}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Submitted think lists */}
        {submitted.length === 0 && drafts.length === 0 ? (
          <p className="empty-list">No think lists yet.</p>
        ) : submitted.length === 0 ? (
          <p className="empty-list tl-no-submitted">No submitted entries yet.</p>
        ) : (
          <ul className="think-list-list">
            {submitted.map(thinkList => (
              <li
                key={thinkList.id}
                className="think-list-item"
                onClick={() => onView?.(thinkList)}
              >
                <span className="think-list-title-preview">
                  {thinkList.title || 'Untitled'}
                </span>
                <span className="think-list-date">
                  {formatDate(thinkList.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
