/**
 * Activity History Page - Full-page view of all activity
 *
 * Props:
 * - activityLog: array of all activity entries
 * - counseleeName: string - name to show in header
 * - onClose: () => void - called when Back button clicked
 */
export default function ActivityHistoryPage({ activityLog = [], counseleeName = '', onClose }) {
  // Format timestamp for display - more detailed for full page
  const formatLogDate = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  return (
    <div className="activity-history-page">
      <header className="ah-page-header">
        <h2>Activity History{counseleeName ? ` - ${counseleeName}` : ''}</h2>
      </header>

      <main className="ah-page-content">
        {activityLog.length === 0 ? (
          <p className="empty-list">No activity recorded yet.</p>
        ) : (
          <ul className="ah-full-list">
            {activityLog.map(entry => (
              <li key={entry.id} className="ah-entry">
                {entry.details} <span className="ah-time">— {formatLogDate(entry.timestamp)}</span>
                {entry.actorName && <span className="ah-actor"> by {entry.actorName}</span>}
              </li>
            ))}
          </ul>
        )}
      </main>

      <footer className="ah-sticky-footer">
        <button type="button" className="ah-footer-btn ah-back-btn" onClick={onClose}>
          Back
        </button>
      </footer>
    </div>
  );
}
