import { useState } from 'react';

/**
 * Family Link Modal
 *
 * Props:
 * - isOpen: boolean
 * - onClose: () => void
 * - counselees: array - list of all counselees
 * - currentCounseleeId: string - the counselee being edited
 * - onLink: (counseleeId, relationship) => void
 * - onAddCounselee: () => void - callback to open add counselee form
 */
export default function FamilyLinkModal({
  isOpen,
  onClose,
  counselees,
  currentCounseleeId,
  onLink,
  onAddCounselee
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCounselee, setSelectedCounselee] = useState(null);
  const [relationship, setRelationship] = useState('spouse');
  const [linking, setLinking] = useState(false);

  if (!isOpen) return null;

  // Filter out current counselee and already linked ones
  const availableCounselees = counselees.filter(c =>
    c.id !== currentCounseleeId &&
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleLink = async () => {
    if (!selectedCounselee) return;

    setLinking(true);
    try {
      await onLink(selectedCounselee.id, relationship);
      setSearchTerm('');
      setSelectedCounselee(null);
      setRelationship('spouse');
      onClose();
    } catch (err) {
      console.error('Link failed:', err);
      alert('Failed to link: ' + err.message);
    } finally {
      setLinking(false);
    }
  };

  const relationships = [
    { value: 'spouse', label: 'Spouse' },
    { value: 'parent', label: 'Parent' },
    { value: 'child', label: 'Child' },
    { value: 'sibling', label: 'Sibling' },
    { value: 'other', label: 'Other' }
  ];

  return (
    <div className="family-link-overlay" onClick={onClose}>
      <div className="family-link-modal" onClick={e => e.stopPropagation()}>
        <div className="family-link-header">
          <h3>Link Family Member</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="family-link-content">
          <div className="form-group">
            <label>Search Counselees</label>
            <input
              type="text"
              placeholder="Type to search..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          {searchTerm && (
            <ul className="counselee-search-results">
              {availableCounselees.length === 0 ? (
                <li className="no-results">No matching counselees found</li>
              ) : (
                availableCounselees.slice(0, 5).map(c => (
                  <li
                    key={c.id}
                    className={`search-result-item ${selectedCounselee?.id === c.id ? 'selected' : ''}`}
                    onClick={() => setSelectedCounselee(c)}
                  >
                    {c.name}
                    {c.email && <span className="result-email">{c.email}</span>}
                  </li>
                ))
              )}
            </ul>
          )}

          {selectedCounselee && (
            <div className="selected-person">
              <span>Selected: <strong>{selectedCounselee.name}</strong></span>
            </div>
          )}

          <div className="form-group">
            <label>Relationship</label>
            <select
              value={relationship}
              onChange={e => setRelationship(e.target.value)}
            >
              {relationships.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <button
            className="link-btn"
            onClick={handleLink}
            disabled={!selectedCounselee || linking}
          >
            {linking ? 'Linking...' : 'Link Family Member'}
          </button>

          {onAddCounselee && (
            <button
              type="button"
              className="add-new-counselee-btn"
              onClick={() => {
                onClose();
                onAddCounselee();
              }}
            >
              + Add New Counselee
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
