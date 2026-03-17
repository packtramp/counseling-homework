import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import HeartJournalsTile from './HeartJournalsTile';

const makeHJ = (overrides = {}) => ({
  id: 'hj-1',
  situation: 'Had an argument with my spouse about finances',
  status: 'submitted',
  createdAt: { toDate: () => new Date('2026-03-10') },
  ...overrides
});

describe('HeartJournalsTile', () => {
  describe('Display', () => {
    it('shows correct count in header', () => {
      const journals = [makeHJ(), makeHJ({ id: 'hj-2' })];
      render(<HeartJournalsTile journals={journals} />);
      expect(screen.getByText(/Heart Journals \(2\)/)).toBeInTheDocument();
    });

    it('shows empty message when no journals', () => {
      render(<HeartJournalsTile journals={[]} />);
      expect(screen.getByText(/No heart journal entries yet/)).toBeInTheDocument();
    });

    it('shows situation preview text', () => {
      render(<HeartJournalsTile journals={[makeHJ()]} />);
      expect(screen.getByText(/Had an argument/)).toBeInTheDocument();
    });

    it('separates drafts from submitted entries', () => {
      const journals = [
        makeHJ({ id: 'hj-draft', status: 'draft', situation: 'Draft entry' }),
        makeHJ({ id: 'hj-submitted', status: 'submitted', situation: 'Submitted entry' })
      ];
      render(<HeartJournalsTile journals={journals} role="counselee" />);
      expect(screen.getByText(/Continue Draft/)).toBeInTheDocument();
    });
  });

  describe('Interactions', () => {
    it('calls onView when submitted journal clicked', () => {
      const mockOnView = vi.fn();
      const journal = makeHJ();
      render(<HeartJournalsTile journals={[journal]} onView={mockOnView} />);
      const item = document.querySelector('.heart-journal-item');
      fireEvent.click(item);
      expect(mockOnView).toHaveBeenCalledWith(journal);
    });

    it('calls onView when draft clicked', () => {
      const mockOnView = vi.fn();
      const draft = makeHJ({ id: 'hj-draft', status: 'draft', situation: 'Draft' });
      render(<HeartJournalsTile journals={[draft]} role="counselee" onView={mockOnView} />);
      const draftItem = document.querySelector('.hj-draft-item');
      fireEvent.click(draftItem);
      expect(mockOnView).toHaveBeenCalledWith(draft);
    });

    it('does not crash when onView is not provided', () => {
      render(<HeartJournalsTile journals={[makeHJ()]} />);
      const item = document.querySelector('.heart-journal-item');
      fireEvent.click(item);
    });

    it('does NOT show drafts section for accountability role', () => {
      const draft = makeHJ({ id: 'hj-draft', status: 'draft' });
      render(<HeartJournalsTile journals={[draft]} role="accountability" />);
      expect(screen.queryByText(/Continue Draft/)).not.toBeInTheDocument();
    });
  });

  describe('Draft Count', () => {
    it('shows draft count badge for counselee', () => {
      const journals = [
        makeHJ({ id: 'd1', status: 'draft' }),
        makeHJ({ id: 'd2', status: 'draft' }),
        makeHJ({ id: 's1', status: 'submitted' })
      ];
      render(<HeartJournalsTile journals={journals} role="counselee" />);
      expect(screen.getByText(/2 draft/)).toBeInTheDocument();
    });

    it('does NOT show draft count for counselor', () => {
      const journals = [makeHJ({ id: 'd1', status: 'draft' })];
      render(<HeartJournalsTile journals={journals} role="counselor" />);
      expect(screen.queryByText(/draft/i)).not.toBeInTheDocument();
    });
  });
});
