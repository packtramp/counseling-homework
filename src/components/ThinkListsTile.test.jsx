import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ThinkListsTile from './ThinkListsTile';

const makeTL = (overrides = {}) => ({
  id: 'tl-1',
  title: 'Anxiety Thoughts',
  status: 'active',
  createdAt: { toDate: () => new Date('2026-03-10') },
  ...overrides
});

describe('ThinkListsTile', () => {
  describe('Display', () => {
    it('shows correct count in header', () => {
      const tls = [makeTL(), makeTL({ id: 'tl-2', title: 'Anger Thoughts' })];
      render(<ThinkListsTile thinkLists={tls} />);
      expect(screen.getByText(/Think Lists \(2\)/)).toBeInTheDocument();
    });

    it('shows empty message when no think lists', () => {
      render(<ThinkListsTile thinkLists={[]} />);
      expect(screen.getByText(/No think lists yet/)).toBeInTheDocument();
    });

    it('shows think list titles', () => {
      render(<ThinkListsTile thinkLists={[makeTL()]} />);
      expect(screen.getByText('Anxiety Thoughts')).toBeInTheDocument();
    });

    it('shows "Untitled" for think lists without title', () => {
      render(<ThinkListsTile thinkLists={[makeTL({ title: '' })]} />);
      expect(screen.getByText('Untitled')).toBeInTheDocument();
    });

    it('separates drafts from active items', () => {
      const tls = [
        makeTL({ id: 'tl-draft', status: 'draft', title: 'Draft TL' }),
        makeTL({ id: 'tl-active', status: 'active', title: 'Active TL' })
      ];
      render(<ThinkListsTile thinkLists={tls} role="counselee" />);
      expect(screen.getByText(/Continue Draft/)).toBeInTheDocument();
    });

    it('shows expired think lists struck-through in place, not counted in the header', () => {
      const tls = [
        makeTL({ id: 'tl-active', title: 'Active TL' }),
        makeTL({ id: 'tl-exp', title: 'Retired TL', status: 'expired' })
      ];
      const { container } = render(<ThinkListsTile thinkLists={tls} />);
      // Both remain visible (retired is kept for reference, not hidden)
      expect(screen.getByText('Active TL')).toBeInTheDocument();
      expect(screen.getByText('Retired TL')).toBeInTheDocument();
      // Header counts active only — retired no longer counts against you
      expect(screen.getByText(/Think Lists \(1\)/)).toBeInTheDocument();
      // Retired item carries the struck-through styling hook
      expect(container.querySelector('.think-list-item.retired')).toBeTruthy();
    });
  });

  describe('Interactions', () => {
    it('calls onView when think list clicked', () => {
      const mockOnView = vi.fn();
      const tl = makeTL();
      render(<ThinkListsTile thinkLists={[tl]} onView={mockOnView} />);
      const item = document.querySelector('.think-list-item');
      fireEvent.click(item);
      expect(mockOnView).toHaveBeenCalledWith(tl);
    });

    it('calls onView when draft clicked', () => {
      const mockOnView = vi.fn();
      const draft = makeTL({ id: 'tl-draft', status: 'draft', title: 'Draft' });
      render(<ThinkListsTile thinkLists={[draft]} role="counselee" onView={mockOnView} />);
      const draftItem = document.querySelector('.tl-draft-item');
      fireEvent.click(draftItem);
      expect(mockOnView).toHaveBeenCalledWith(draft);
    });

    it('does not crash when onView is not provided', () => {
      render(<ThinkListsTile thinkLists={[makeTL()]} />);
      const item = document.querySelector('.think-list-item');
      fireEvent.click(item);
    });
  });

  describe('Draft Count', () => {
    it('shows draft count badge', () => {
      const tls = [
        makeTL({ id: 'd1', status: 'draft' }),
        makeTL({ id: 'd2', status: 'draft' }),
        makeTL({ id: 'a1', status: 'active' })
      ];
      render(<ThinkListsTile thinkLists={tls} role="counselee" />);
      expect(screen.getByText(/2 draft/)).toBeInTheDocument();
    });
  });
});
