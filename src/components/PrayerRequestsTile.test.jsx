import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PrayerRequestsTile from './PrayerRequestsTile';
import { onSnapshot as mockOnSnapshot } from 'firebase/firestore';

// ── Firebase mocks ──

vi.mock('../config/firebase', () => ({
  db: {}
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()),
  addDoc: vi.fn().mockResolvedValue({ id: 'new-pr-1' }),
  updateDoc: vi.fn().mockResolvedValue(),
  deleteDoc: vi.fn().mockResolvedValue(),
  doc: vi.fn(),
  serverTimestamp: vi.fn(() => ({ _isServerTimestamp: true })),
  Timestamp: {
    now: vi.fn(() => ({ toDate: () => new Date() })),
    fromDate: vi.fn((d) => ({ toDate: () => d }))
  },
  getDocs: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
  orderBy: vi.fn(),
  increment: vi.fn((n) => n)
}));

// ── Fixtures ──

const mockUser = { uid: 'user-123' };
const mockUserProfile = { name: 'Test User', counselorId: 'counselor-456' };

// Use dates far in the future so expiry filtering never removes test data
const futureExpiry = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return { toDate: () => d };
};

const makePR = (overrides = {}) => ({
  id: 'pr-1',
  text: 'Please pray for my health',
  createdAt: { toDate: () => new Date('2026-02-01') },
  expiresAt: futureExpiry(),
  prayerCount: 3,
  ownerUid: 'user-123',
  ownerName: 'Test User',
  outcome: null,
  ...overrides
});

const makeAPPR = (overrides = {}) => ({
  id: 'pr-ap-1',
  text: 'Pray for my job interview',
  createdAt: { toDate: () => new Date('2026-02-10') },
  expiresAt: futureExpiry(),
  prayerCount: 1,
  ownerUid: 'ap-user-999',
  ownerName: 'John Smith',
  outcome: null,
  ...overrides
});

const makeCounseleePR = (overrides = {}) => ({
  id: 'pr-counselee-1',
  text: 'Pray for my marriage',
  createdAt: { toDate: () => new Date('2026-02-15') },
  expiresAt: futureExpiry(),
  prayerCount: 0,
  ownerUid: 'counselee-uid-1',
  ownerName: 'Jane Doe',
  outcome: null,
  ...overrides
});

// Default props for a basic owner/counselee render
const defaultProps = {
  user: mockUser,
  userProfile: mockUserProfile,
  role: 'counselee',
  isCounselor: false,
  watchingUsers: [],
  counseleeUids: [],
  targetUid: null,
  targetName: null,
  onPrayerCountUpdate: vi.fn(),
  getAuthToken: vi.fn().mockResolvedValue('mock-token')
};

// Helper: render with state injected via the onSnapshot mock
// Since Firestore listeners are mocked (onSnapshot returns unsub immediately),
// we force state by re-rendering with props that drive rendering logic.
// For sections that depend on state set by listeners, we test via direct state manipulation
// by wrapping the component and overriding the initial state stubs where possible.
// For the listener-driven state (myPrayerRequests, apPrayerRequests, counseleePrayerRequests),
// we inject those via a thin test wrapper that pre-seeds state using vi.spyOn on useState,
// OR we rely on the fact that the component also accepts those as computed from props.
//
// SIMPLER APPROACH: Since the component renders sections based on state arrays set by listeners,
// and we can't easily inject state, we test the listener-independent parts directly
// and test sections using a component that receives initial data through the onSnapshot mock callback.

// Setup onSnapshot to immediately call the callback with test data
const setupOnSnapshot = (docsForMyPRs = [], docsForAP = [], docsForCounselee = []) => {
  let callCount = 0;
  mockOnSnapshot.mockImplementation((q, successCb, errCb) => {
    // We can't distinguish which query is which, so call with different data per invocation order
    const datasets = [docsForMyPRs, docsForAP, docsForCounselee];
    const data = datasets[callCount] || [];
    callCount++;
    // Simulate Firestore snapshot
    successCb({
      docs: data.map(d => ({ id: d.id, data: () => d }))
    });
    return vi.fn(); // unsubscribe
  });
};

// ── Tests ──

describe('PrayerRequestsTile', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: onSnapshot returns unsub without calling callback (empty state)
    mockOnSnapshot.mockImplementation(() => vi.fn());
  });

  // ── 1. Empty state ──

  describe('Empty state', () => {
    it('renders empty state message when no prayer requests exist', () => {
      render(<PrayerRequestsTile {...defaultProps} />);

      expect(screen.getByText('No active prayer requests.')).toBeInTheDocument();
    });

    it('shows tile header with count of 0', () => {
      render(<PrayerRequestsTile {...defaultProps} />);

      expect(screen.getByText('Prayer Requests (0)')).toBeInTheDocument();
    });
  });

  // ── 2. Add button visibility ──

  describe('Add button — owner vs target view', () => {
    it('shows add button on owner view (no targetUid) when onAdd provided', () => {
      render(<PrayerRequestsTile {...defaultProps} targetUid={null} onAdd={vi.fn()} />);

      const addBtn = document.querySelector('.pr-add-btn');
      expect(addBtn).toBeInTheDocument();
    });

    it('does NOT show add button when targetUid is set (viewing someone else)', () => {
      render(
        <PrayerRequestsTile
          {...defaultProps}
          targetUid="other-user-uid"
          targetName="Other Person"
        />
      );

      const addBtn = document.querySelector('.pr-add-btn');
      expect(addBtn).not.toBeInTheDocument();
    });

    it('does NOT show add button when role is accountability and targetUid is set', () => {
      render(
        <PrayerRequestsTile
          {...defaultProps}
          role="accountability"
          targetUid="ap-target-uid"
          targetName="AP Target"
        />
      );

      const addBtn = document.querySelector('.pr-add-btn');
      expect(addBtn).not.toBeInTheDocument();
    });
  });

  // ── 3. AP Prayer Requests section ──

  describe('AP Prayer Requests section', () => {
    beforeEach(() => {
          // The component sets up listeners; we fire the AP callback to simulate data
      // First call = myPR listener (empty), second call = AP listener (with data)
      let callCount = 0;
      mockOnSnapshot.mockImplementation((_q, successCb) => {
        callCount++;
        if (callCount === 2) {
          // Second listener = AP PRs
          const apPR = makeAPPR();
          successCb({
            docs: [{ id: apPR.id, data: () => apPR }]
          });
        } else {
          successCb({ docs: [] });
        }
        return vi.fn();
      });
    });

    it('shows "AP Prayer Requests" section heading when AP PRs exist', () => {
      render(
        <PrayerRequestsTile
          {...defaultProps}
          watchingUsers={[{ uid: 'ap-user-999', name: 'John Smith' }]}
        />
      );

      expect(screen.getByText('AP Prayer Requests')).toBeInTheDocument();
    });

    it('renders prayed button (not edit/delete) for AP prayer requests', () => {
      render(
        <PrayerRequestsTile
          {...defaultProps}
          watchingUsers={[{ uid: 'ap-user-999', name: 'John Smith' }]}
        />
      );

      const prayedBtn = document.querySelector('.pr-prayed-btn');
      expect(prayedBtn).toBeInTheDocument();

      const editBtn = document.querySelector('.pr-edit-btn');
      expect(editBtn).not.toBeInTheDocument();
    });
  });

  // ── 4. My Prayer Requests section ──

  describe('My Prayer Requests section', () => {
    beforeEach(() => {
          mockOnSnapshot.mockImplementation((_q, successCb) => {
        const myPR = makePR();
        successCb({
          docs: [{ id: myPR.id, data: () => myPR }]
        });
        return vi.fn();
      });
    });

    it('shows "My Prayer Requests" section heading', () => {
      render(<PrayerRequestsTile {...defaultProps} />);

      expect(screen.getByText('My Prayer Requests')).toBeInTheDocument();
    });

    it('renders edit and delete buttons for own prayer requests', () => {
      render(<PrayerRequestsTile {...defaultProps} />);

      expect(document.querySelector('.pr-edit-btn')).toBeInTheDocument();
      expect(document.querySelector('.pr-delete-btn')).toBeInTheDocument();
    });

    it('does NOT render prayed button for own prayer requests', () => {
      render(<PrayerRequestsTile {...defaultProps} />);

      expect(document.querySelector('.pr-prayed-btn')).not.toBeInTheDocument();
    });

    it('shows truncated PR text in the list', () => {
      render(<PrayerRequestsTile {...defaultProps} />);

      // text is "Please pray for my health" (25 chars, under 80 limit — shown in full)
      expect(screen.getByText('Please pray for my health')).toBeInTheDocument();
    });
  });

  // ── 5. Counselee Prayer Requests section ──

  describe('Counselee Prayer Requests section', () => {
    it('does NOT show counselee section when isCounselor=false', () => {
      render(<PrayerRequestsTile {...defaultProps} isCounselor={false} />);

      expect(screen.queryByText('Counselee Prayer Requests')).not.toBeInTheDocument();
    });

    it('shows "Counselee Prayer Requests" section when isCounselor=true and counselees have PRs', () => {
          let callCount = 0;
      mockOnSnapshot.mockImplementation((_q, successCb) => {
        callCount++;
        // 3rd listener = counselee PRs (myPR first, then counselee listener)
        if (callCount === 2) {
          const pr = makeCounseleePR();
          successCb({
            docs: [{ id: pr.id, data: () => pr }]
          });
        } else {
          successCb({ docs: [] });
        }
        return vi.fn();
      });

      render(
        <PrayerRequestsTile
          {...defaultProps}
          isCounselor={true}
          counseleeUids={[{ uid: 'counselee-uid-1', name: 'Jane Doe' }]}
        />
      );

      expect(screen.getByText('Counselee Prayer Requests')).toBeInTheDocument();
    });
  });

  // ── 6. Add button calls onAdd callback ──

  describe('Add button callback', () => {
    it('calls onAdd when add button is clicked', () => {
      const onAdd = vi.fn();
      render(<PrayerRequestsTile {...defaultProps} onAdd={onAdd} />);

      const addBtn = document.querySelector('.pr-add-btn');
      fireEvent.click(addBtn);

      expect(onAdd).toHaveBeenCalledTimes(1);
    });

    it('does not show add button when onAdd is not provided', () => {
      render(<PrayerRequestsTile {...defaultProps} onAdd={undefined} />);

      const addBtn = document.querySelector('.pr-add-btn');
      expect(addBtn).not.toBeInTheDocument();
    });
  });

  // ── 7. Edit button calls onEdit callback ──

  describe('Edit button callback', () => {
    beforeEach(() => {
      mockOnSnapshot.mockImplementation((_q, successCb) => {
        const myPR = makePR({ text: 'Please pray for my health' });
        successCb({
          docs: [{ id: myPR.id, data: () => myPR }]
        });
        return vi.fn();
      });
    });

    it('calls onEdit with PR data when edit button is clicked', () => {
      const onEdit = vi.fn();
      render(<PrayerRequestsTile {...defaultProps} onEdit={onEdit} />);

      const editBtn = document.querySelector('.pr-edit-btn');
      fireEvent.click(editBtn);

      expect(onEdit).toHaveBeenCalledTimes(1);
      expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({
        id: 'pr-1',
        text: 'Please pray for my health'
      }));
    });
  });

  // ── Target view (AP/counselor detail) ──

  describe('Target view (viewing someone else)', () => {
    it('shows "Prayer Requests (0)" header in target view', () => {
      render(
        <PrayerRequestsTile
          {...defaultProps}
          targetUid="other-user-uid"
          targetName="Other Person"
        />
      );

      expect(screen.getByText('Prayer Requests (0)')).toBeInTheDocument();
    });

    it('shows empty state in target view when no PRs', () => {
      render(
        <PrayerRequestsTile
          {...defaultProps}
          targetUid="other-user-uid"
          targetName="Other Person"
        />
      );

      expect(screen.getByText('No active prayer requests.')).toBeInTheDocument();
    });

    it('does not show My/AP/Counselee section headings in target view', () => {
      render(
        <PrayerRequestsTile
          {...defaultProps}
          targetUid="other-user-uid"
          targetName="Other Person"
        />
      );

      expect(screen.queryByText('My Prayer Requests')).not.toBeInTheDocument();
      expect(screen.queryByText('AP Prayer Requests')).not.toBeInTheDocument();
      expect(screen.queryByText('Counselee Prayer Requests')).not.toBeInTheDocument();
    });
  });
});
