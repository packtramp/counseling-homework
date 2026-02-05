/**
 * Activity History Tile - Shows recent activity with "View All" button
 *
 * Props:
 * - activityLog: array of activity entries
 * - onViewAll: () => void - called when "View All" clicked
 */
export default function ActivityHistoryTile({ activityLog = [], onViewAll }) {
  // Format timestamp for display
  const formatLogDate = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="tile activity-history-tile">
      <div className="tile-header">
        <h3>Activity History</h3>
        {activityLog.length > 0 && (
          <button className="view-all-btn" onClick={onViewAll}>View All</button>
        )}
      </div>
      <div className="tile-content">
        {activityLog.length === 0 ? (
          <p className="empty-list">No activity yet.</p>
        ) : (
          <ul className="activity-log-list">
            {activityLog.slice(0, 5).map(entry => (
              <li key={entry.id} className="log-entry">
                <span className="log-time">{formatLogDate(entry.timestamp)}</span>
                <span className="log-details">{entry.details}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
