/**
 * Reusable Think Lists Tile - displays list of think lists
 *
 * Props:
 * - thinkLists: array of think list entries
 * - role: 'counselee' | 'counselor'
 * - onView: (thinkList) => void - called when viewing a think list (opens ThinkListPage)
 * - onAdd: () => void - called when adding new
 */
export default function ThinkListsTile({
  thinkLists = [],
  role = 'counselee',
  onView,
  onAdd
}) {
  const isCounselor = role === 'counselor';

  // Separate drafts from submitted think lists
  const drafts = thinkLists.filter(t => t.status === 'draft');
  const submitted = thinkLists.filter(t => t.status !== 'draft');

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
          {drafts.length > 0 && (
            <span className="tl-draft-count"> + {drafts.length} draft{drafts.length > 1 ? 's' : ''}</span>
          )}
        </span>
        {onAdd && (
          <button className="tl-add-btn" onClick={onAdd} title="New Think List">
            {/* Yellow brain with white cross */}
            <svg viewBox="0 0 24 24" width="24" height="24">
              {/* Blue background square */}
              <rect x="0" y="0" width="24" height="24" rx="4" fill="#2c5282"/>
              {/* Yellow brain outline */}
              <path
                d="M12 4C9.5 4 7.5 5.5 7 7.5C5.5 7.8 4.5 9 4.5 10.5C4.5 11.8 5.3 12.9 6.5 13.3C6.5 13.5 6.5 13.8 6.5 14C6.5 16.2 8.3 18 10.5 18H13.5C15.7 18 17.5 16.2 17.5 14C17.5 13.8 17.5 13.5 17.5 13.3C18.7 12.9 19.5 11.8 19.5 10.5C19.5 9 18.5 7.8 17 7.5C16.5 5.5 14.5 4 12 4Z"
                fill="#ffc107"
                stroke="#ffc107"
                strokeWidth="0.5"
              />
              {/* White cross on brain */}
              <path
                d="M11 9v2H9v2h2v2h2v-2h2v-2h-2V9h-2z"
                fill="white"
              />
            </svg>
          </button>
        )}
      </div>

      <div className="tl-tile-content">
        {/* Drafts section */}
        {drafts.length > 0 && (
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
