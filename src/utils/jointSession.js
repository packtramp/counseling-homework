/**
 * Joint Session Helpers
 *
 * Shared logic for spouse-linked joint sessions.
 * Used by both UnifiedDashboard and CounselorDashboard.
 */

/**
 * Find the linked spouse for a given counselee.
 * @param {string} counseleeId - The counselee to check
 * @param {Array} counselees - All counselees list
 * @returns {object|null} The spouse counselee object, or null
 */
export function getLinkedSpouse(counseleeId, counselees) {
  const counselee = counselees.find(c => c.id === counseleeId);
  if (!counselee?.linkedFamily) return null;
  const spouseLink = counselee.linkedFamily.find(m => m.relationship === 'spouse');
  if (!spouseLink) return null;
  return counselees.find(c => c.id === spouseLink.counseleeId) || null;
}

/**
 * Check if a session is a joint session with valid link data.
 * @param {object} session - The session document
 * @returns {boolean}
 */
export function isJointSession(session) {
  return !!(session?.isJoint && session?.linkedSessionId && session?.linkedCounseleeId);
}

/**
 * Build the joint session fields for a mirror document.
 * @param {string} originalSessionId - The original session's ID
 * @param {string} originalCounseleeId - The original counselee's ID
 * @returns {object} Fields to merge into the mirror session doc
 */
export function buildJointFields(originalSessionId, originalCounseleeId) {
  return {
    isJoint: true,
    linkedSessionId: originalSessionId,
    linkedCounseleeId: originalCounseleeId
  };
}
