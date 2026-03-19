import { describe, it, expect } from 'vitest';
import { getLinkedSpouse, isJointSession, buildJointFields } from './jointSession';

// Mock counselees list
const counselees = [
  {
    id: 'joe-id',
    name: 'Joe Hodge',
    linkedFamily: [{ counseleeId: 'gina-id', relationship: 'spouse' }]
  },
  {
    id: 'gina-id',
    name: 'Gina Hodge',
    linkedFamily: [{ counseleeId: 'joe-id', relationship: 'spouse' }]
  },
  {
    id: 'solo-id',
    name: 'Solo Person',
    linkedFamily: []
  },
  {
    id: 'parent-id',
    name: 'Parent Person',
    linkedFamily: [{ counseleeId: 'child-id', relationship: 'child' }]
  },
  {
    id: 'child-id',
    name: 'Child Person',
    linkedFamily: [{ counseleeId: 'parent-id', relationship: 'parent' }]
  },
  {
    id: 'no-family-id',
    name: 'No Family'
    // no linkedFamily field at all
  }
];

describe('getLinkedSpouse', () => {
  it('finds spouse for Joe → Gina', () => {
    const spouse = getLinkedSpouse('joe-id', counselees);
    expect(spouse).not.toBeNull();
    expect(spouse.id).toBe('gina-id');
    expect(spouse.name).toBe('Gina Hodge');
  });

  it('finds spouse for Gina → Joe (bidirectional)', () => {
    const spouse = getLinkedSpouse('gina-id', counselees);
    expect(spouse).not.toBeNull();
    expect(spouse.id).toBe('joe-id');
  });

  it('returns null for person with no spouse link', () => {
    expect(getLinkedSpouse('solo-id', counselees)).toBeNull();
  });

  it('returns null for parent-child relationship (not spouse)', () => {
    expect(getLinkedSpouse('parent-id', counselees)).toBeNull();
    expect(getLinkedSpouse('child-id', counselees)).toBeNull();
  });

  it('returns null when linkedFamily field is missing', () => {
    expect(getLinkedSpouse('no-family-id', counselees)).toBeNull();
  });

  it('returns null for unknown counselee ID', () => {
    expect(getLinkedSpouse('nonexistent-id', counselees)).toBeNull();
  });

  it('returns null when counselees list is empty', () => {
    expect(getLinkedSpouse('joe-id', [])).toBeNull();
  });

  it('returns null when spouse ID points to missing counselee', () => {
    const orphaned = [
      { id: 'orphan-id', name: 'Orphan', linkedFamily: [{ counseleeId: 'deleted-id', relationship: 'spouse' }] }
    ];
    expect(getLinkedSpouse('orphan-id', orphaned)).toBeNull();
  });
});

describe('isJointSession', () => {
  it('returns true for valid joint session', () => {
    expect(isJointSession({
      isJoint: true,
      linkedSessionId: 'session-abc',
      linkedCounseleeId: 'gina-id'
    })).toBe(true);
  });

  it('returns false when isJoint is false', () => {
    expect(isJointSession({
      isJoint: false,
      linkedSessionId: 'session-abc',
      linkedCounseleeId: 'gina-id'
    })).toBe(false);
  });

  it('returns false when linkedSessionId is missing', () => {
    expect(isJointSession({
      isJoint: true,
      linkedCounseleeId: 'gina-id'
    })).toBe(false);
  });

  it('returns false when linkedCounseleeId is missing', () => {
    expect(isJointSession({
      isJoint: true,
      linkedSessionId: 'session-abc'
    })).toBe(false);
  });

  it('returns false for regular (non-joint) session', () => {
    expect(isJointSession({ notes: 'hello', date: new Date() })).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isJointSession(null)).toBe(false);
    expect(isJointSession(undefined)).toBe(false);
  });
});

describe('buildJointFields', () => {
  it('returns correct joint field object', () => {
    const fields = buildJointFields('session-123', 'joe-id');
    expect(fields).toEqual({
      isJoint: true,
      linkedSessionId: 'session-123',
      linkedCounseleeId: 'joe-id'
    });
  });
});
