import RichTextEditor from './RichTextEditor';

// Strip HTML → first non-empty line, for the collapsed tile's topic.
function firstLine(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const text = (tmp.textContent || '').replace(/ /g, ' ');
  const line = text.split('\n').map(s => s.trim()).find(Boolean) || '';
  return line.length > 90 ? line.slice(0, 90) + '…' : line;
}

const DURATIONS = [
  ['', '—'], ['30', '30m'], ['45', '45m'], ['60', '1h'], ['75', '1h15'],
  ['90', '1h30'], ['105', '1h45'], ['120', '2h'], ['150', '2h30'], ['180', '3h'],
];
function durLabel(min) {
  if (!min) return '';
  const m = parseInt(min, 10);
  if (isNaN(m)) return '';
  const h = Math.floor(m / 60), r = m % 60;
  return h ? `${h}h${r ? String(r).padStart(2, '0') : ''}` : `${r}m`;
}

// One accordion tile for a single counseling session (counselor-only).
export default function SessionTile({
  session, notesContent, isOpen, onToggle, hwCount, dateLabel, dateTimeValue,
  onChangeDate, onChangeDuration, onDelete, onSaveNotes,
}) {
  const topic = firstLine(notesContent);
  const dur = durLabel(session.duration);

  return (
    <div className={`session-tile ${isOpen ? 'open' : ''}`}>
      <button type="button" className="session-tile-head" onClick={onToggle}>
        <span className="session-tile-chevron">{isOpen ? '▾' : '▸'}</span>
        <span className="session-tile-title">
          <span className="session-tile-date">{dateLabel}</span>
          {topic && <span className="session-tile-topic">{topic}</span>}
        </span>
        <span className="session-tile-badges">
          {dur && <span className="session-tile-dur">{dur}</span>}
          {session.isJoint && <span className="joint-badge">Joint</span>}
          <span className="session-tile-hw">{hwCount} hw</span>
        </span>
      </button>

      {isOpen && (
        <div className="session-tile-body">
          <div className="session-tile-controls">
            <label>Date:</label>
            <input
              type="datetime-local"
              value={dateTimeValue}
              onChange={(e) => onChangeDate(e.target.value)}
              className="session-date-input"
            />
            <select
              className="session-duration-select"
              value={session.duration || ''}
              onChange={(e) => onChangeDuration(e.target.value)}
            >
              {DURATIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button type="button" className="delete-session-btn" onClick={onDelete} title="Delete this session">Delete</button>
          </div>
          <RichTextEditor
            content={notesContent || ''}
            onChange={onSaveNotes}
            placeholder="Session notes... (the first line becomes the session topic)"
          />
        </div>
      )}
    </div>
  );
}
