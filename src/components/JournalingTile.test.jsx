import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import JournalingTile from './JournalingTile';

const makeJournal = (overrides = {}) => ({
  id: 'jn-1',
  title: 'Thankful Journal',
  timesPerWeek: 4,
  status: 'active',
  createdAt: { toDate: () => new Date('2026-03-10') },
  ...overrides
});

describe('JournalingTile', () => {
  describe('Display', () => {
    it('shows correct count in header', () => {
      const journals = [makeJournal(), makeJournal({ id: 'jn-2', title: 'Growth Journal' })];
      render(<JournalingTile journals={journals} />);
      expect(screen.getByText(/Journaling \(2\)/)).toBeInTheDocument();
    });

    it('shows empty message when no journals', () => {
      render(<JournalingTile journals={[]} />);
      expect(screen.getByText(/No journal entries yet/)).toBeInTheDocument();
    });

    it('shows journal titles in list', () => {
      render(<JournalingTile journals={[makeJournal()]} />);
      expect(screen.getByText('Thankful Journal')).toBeInTheDocument();
    });

    it('shows "Untitled" for journals without title', () => {
      render(<JournalingTile journals={[makeJournal({ title: '' })]} />);
      expect(screen.getByText('Untitled')).toBeInTheDocument();
    });
  });

  describe('Interactions', () => {
    it('calls onView when journal item clicked', () => {
      const mockOnView = vi.fn();
      const journal = makeJournal();
      render(<JournalingTile journals={[journal]} onView={mockOnView} />);
      fireEvent.click(screen.getByText('Thankful Journal'));
      expect(mockOnView).toHaveBeenCalledWith(journal);
    });

    it('does not crash when onView is not provided', () => {
      render(<JournalingTile journals={[makeJournal()]} />);
      // Click should not throw
      fireEvent.click(screen.getByText('Thankful Journal'));
    });
  });
});
