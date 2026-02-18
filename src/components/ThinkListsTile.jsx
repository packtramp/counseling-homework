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
          {drafts.length > 0 && canEdit && (
            <span className="tl-draft-count"> + {drafts.length} draft{drafts.length > 1 ? 's' : ''}</span>
          )}
        </span>
        {canEdit && onAdd && (
          <button className="tl-add-btn" onClick={onAdd} title="New Think List">
            {/* Pink side-view brain with white cross */}
            <svg viewBox="0 0 24 24" width="24" height="24">
              {/* Blue background square */}
              <rect x="0" y="0" width="24" height="24" rx="4" fill="#2c5282"/>
              {/* Brain group - scaled up to fill the blue square */}
              <g transform="translate(11.5 11) scale(1.25) translate(-11.5 -11)">
                {/* Pink brain - side view cartoon profile */}
                <path
                  d="M8 4 C6 3.5 4 5 3.5 7 C3 9 3 11 4 13 C5 14.5 6.5 15 8 15 L8 15.5 C8.5 16.5 7.5 17.5 8 18.5 C8.5 19.5 9.5 19.5 10 19 L10.5 18 C11 17.5 12 17 13 17 C14 17.5 15.5 17.5 16.5 16.5 C17.5 15.5 18 14 18 13 C19 12 19.5 10 19 8 C18.5 6 17.5 4.5 16 4 C14.5 3.5 13 4 12 4.5 C11 3.5 9.5 3.5 8 4Z"
                  fill="#F8A4B8"
                  stroke="#333"
                  strokeWidth="0.8"
                  strokeLinejoin="round"
                />
                {/* Brain fold lines */}
                <path d="M4.5 7.5 C7 8.5 9 7.5 11.5 8 C13.5 8.5 16 7.5 18 8" fill="none" stroke="#333" strokeWidth="0.6"/>
                <path d="M4 10.5 C6 11.5 9 10.5 11 11 C13 11.5 16 10.5 18.5 11" fill="none" stroke="#333" strokeWidth="0.6"/>
                <path d="M5 13.5 C7 14 9 13 11 13.5" fill="none" stroke="#333" strokeWidth="0.6"/>
                {/* Cerebellum divider */}
                <path d="M13 17 C13.5 15.5 13 14 13.5 13" fill="none" stroke="#333" strokeWidth="0.5"/>
                {/* White cross on brain */}
                <path
                  d="M10.5 7v2H8v2h2.5v5h2v-5H15v-2h-2.5V7h-2z"
                  fill="white"
                />
              </g>
            </svg>
          </button>
        )}
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
