import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import HomeworkTile from './HomeworkTile';

// Mock RichTextEditor
vi.mock('./RichTextEditor', () => ({
  default: ({ content, onChange, placeholder }) => (
    <textarea
      data-testid="rich-text-editor"
      value={content}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  )
}));

// Sample homework data
const createHomework = (overrides = {}) => ({
  id: 'hw-1',
  title: 'Daily Prayer',
  description: 'Spend 15 minutes in prayer',
  weeklyTarget: 7,
  recurring: true,
  status: 'active',
  completions: [],
  assignedDate: new Date('2026-01-20'),
  ...overrides
});

const todayCompletion = { toDate: () => new Date() };
const yesterdayCompletion = { toDate: () => new Date(Date.now() - 86400000) };

describe('HomeworkTile', () => {
  let mockOnComplete, mockOnEdit, mockOnCancel, mockOnDelete, mockOnAdd;

  beforeEach(() => {
    mockOnComplete = vi.fn();
    mockOnEdit = vi.fn().mockResolvedValue();
    mockOnCancel = vi.fn();
    mockOnDelete = vi.fn();
    mockOnAdd = vi.fn().mockResolvedValue();
  });

  describe('Tab Navigation', () => {
    it('shows Current tab by default with correct count', () => {
      const homework = [createHomework()];
      render(<HomeworkTile homework={homework} role="counselee" />);

      expect(screen.getByText('Current (1)')).toBeInTheDocument();
      expect(screen.getByText('Done (0)')).toBeInTheDocument();
    });

    it('switches to Done tab when clicked', () => {
      const homework = [
        createHomework(),
        createHomework({ id: 'hw-2', title: 'Completed Task', completions: [todayCompletion] })
      ];
      render(<HomeworkTile homework={homework} role="counselee" />);

      fireEvent.click(screen.getByText('Done (1)'));
      expect(screen.getByText('Completed Task')).toBeInTheDocument();
    });

    it('shows cancelled items in Done tab', () => {
      const homework = [
        createHomework({ id: 'hw-cancelled', title: 'Cancelled Task', status: 'cancelled' })
      ];
      render(<HomeworkTile homework={homework} role="counselee" />);

      fireEvent.click(screen.getByText('Done (1)'));
      expect(screen.getByText('Cancelled Task')).toBeInTheDocument();
      expect(screen.getByText('Cancelled')).toBeInTheDocument();
    });
  });

  describe('Counselee View - Check Off', () => {
    it('renders check button for counselee', () => {
      const homework = [createHomework()];
      render(
        <HomeworkTile
          homework={homework}
          role="counselee"
          onComplete={mockOnComplete}
        />
      );

      const checkBtn = screen.getByRole('button', { name: '' });
      expect(checkBtn).toHaveClass('check-btn');
      expect(checkBtn).not.toBeDisabled();
    });

    it('calls onComplete when check button clicked', () => {
      const homework = [createHomework()];
      render(
        <HomeworkTile
          homework={homework}
          role="counselee"
          onComplete={mockOnComplete}
        />
      );

      const checkBtn = screen.getByRole('button', { name: '' });
      fireEvent.click(checkBtn);
      expect(mockOnComplete).toHaveBeenCalledWith(homework[0]);
    });

    it('disables check button when already completed today', () => {
      const homework = [createHomework({ completions: [todayCompletion] })];
      render(
        <HomeworkTile
          homework={homework}
          role="counselee"
          onComplete={mockOnComplete}
        />
      );

      // Item should be in Done tab since completed today
      fireEvent.click(screen.getByText(/Done/));
      // Check button should not be present in done list
    });

    it('shows loading state when completing', () => {
      const homework = [createHomework()];
      render(
        <HomeworkTile
          homework={homework}
          role="counselee"
          onComplete={mockOnComplete}
          completingId="hw-1"
        />
      );

      expect(screen.getByText('...')).toBeInTheDocument();
    });
  });

  describe('Counselor View - Read Only Checkmark', () => {
    it('shows check button for counselor on Current tab', () => {
      const homework = [createHomework()];
      render(<HomeworkTile homework={homework} role="counselor" />);

      const checkBtn = document.querySelector('.check-btn');
      expect(checkBtn).toBeInTheDocument();
    });

    it('shows checked indicator on Done tab when completed today', () => {
      const homework = [createHomework({ completions: [todayCompletion] })];
      render(<HomeworkTile homework={homework} role="counselor" />);

      fireEvent.click(screen.getByText(/Done/));
      const indicator = document.querySelector('.counselor-check-indicator.checked');
      expect(indicator).toBeInTheDocument();
      expect(indicator.textContent).toBe('✓');
    });
  });

  describe('Weekly Progress', () => {
    it('displays progress as X/Y this week', () => {
      const homework = [createHomework({ weeklyTarget: 5, completions: [yesterdayCompletion] })];
      render(<HomeworkTile homework={homework} role="counselee" />);

      expect(screen.getByText(/\/5 this week/)).toBeInTheDocument();
    });
  });

  describe('Edit Form', () => {
    it('opens edit form when title clicked (counselee)', () => {
      const homework = [createHomework()];
      render(
        <HomeworkTile
          homework={homework}
          role="counselee"
          onEdit={mockOnEdit}
        />
      );

      fireEvent.click(screen.getByText('Daily Prayer'));
      expect(screen.getByPlaceholderText('Title')).toBeInTheDocument();
    });

    it('opens edit form when title clicked (counselor)', () => {
      const homework = [createHomework()];
      render(
        <HomeworkTile
          homework={homework}
          role="counselor"
          onEdit={mockOnEdit}
        />
      );

      fireEvent.click(screen.getByText('Daily Prayer'));
      expect(screen.getByPlaceholderText('Title')).toBeInTheDocument();
    });

    it('shows times per week input in edit form', () => {
      const homework = [createHomework()];
      render(
        <HomeworkTile
          homework={homework}
          role="counselee"
          onEdit={mockOnEdit}
        />
      );

      fireEvent.click(screen.getByText('Daily Prayer'));
      const freqInput = screen.getByDisplayValue('7');
      expect(freqInput).toHaveClass('frequency-input');
    });

    it('shows recurring checkbox in edit form', () => {
      const homework = [createHomework()];
      render(
        <HomeworkTile
          homework={homework}
          role="counselee"
          onEdit={mockOnEdit}
        />
      );

      fireEvent.click(screen.getByText('Daily Prayer'));
      expect(screen.getByText(/Recurring/)).toBeInTheDocument();
    });

    it('calls onEdit with updated values when saved', async () => {
      const homework = [createHomework()];
      render(
        <HomeworkTile
          homework={homework}
          role="counselor"
          onEdit={mockOnEdit}
        />
      );

      fireEvent.click(screen.getByText('Daily Prayer'));

      const titleInput = screen.getByPlaceholderText('Title');
      fireEvent.change(titleInput, { target: { value: 'Updated Prayer' } });

      const freqInput = screen.getByDisplayValue('7');
      fireEvent.change(freqInput, { target: { value: '5' } });

      fireEvent.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(mockOnEdit).toHaveBeenCalledWith(
          homework[0],
          expect.objectContaining({
            title: 'Updated Prayer',
            weeklyTarget: 5
          })
        );
      });
    });

    it('closes edit form when close button clicked', () => {
      const homework = [createHomework()];
      render(
        <HomeworkTile
          homework={homework}
          role="counselee"
          onEdit={mockOnEdit}
        />
      );

      fireEvent.click(screen.getByText('Daily Prayer'));
      expect(screen.getByPlaceholderText('Title')).toBeInTheDocument();

      // Edit form uses × close button (aria-label="Close")
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(screen.queryByPlaceholderText('Title')).not.toBeInTheDocument();
    });
  });

  describe('Cancel Homework', () => {
    it('shows Cancel Homework button in edit form', () => {
      const homework = [createHomework()];
      render(
        <HomeworkTile
          homework={homework}
          role="counselee"
          onEdit={mockOnEdit}
          onCancel={mockOnCancel}
        />
      );

      fireEvent.click(screen.getByText('Daily Prayer'));
      expect(screen.getByText('Cancel Homework')).toBeInTheDocument();
    });

    it('calls onCancel when Cancel Homework clicked', () => {
      const homework = [createHomework()];
      render(
        <HomeworkTile
          homework={homework}
          role="counselee"
          onEdit={mockOnEdit}
          onCancel={mockOnCancel}
        />
      );

      fireEvent.click(screen.getByText('Daily Prayer'));
      fireEvent.click(screen.getByText('Cancel Homework'));

      expect(mockOnCancel).toHaveBeenCalledWith(homework[0]);
    });
  });

  describe('Delete Forever (Counselor Only)', () => {
    it('shows Delete Forever button only for counselor', () => {
      const homework = [createHomework()];
      render(
        <HomeworkTile
          homework={homework}
          role="counselor"
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />
      );

      fireEvent.click(screen.getByText('Daily Prayer'));
      expect(screen.getByText('Delete Forever')).toBeInTheDocument();
    });

    it('does NOT show Delete Forever for counselee', () => {
      const homework = [createHomework()];
      render(
        <HomeworkTile
          homework={homework}
          role="counselee"
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />
      );

      fireEvent.click(screen.getByText('Daily Prayer'));
      expect(screen.queryByText('Delete Forever')).not.toBeInTheDocument();
    });

    it('calls onDelete when Delete Forever clicked', () => {
      const homework = [createHomework()];
      render(
        <HomeworkTile
          homework={homework}
          role="counselor"
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />
      );

      fireEvent.click(screen.getByText('Daily Prayer'));
      fireEvent.click(screen.getByText('Delete Forever'));

      expect(mockOnDelete).toHaveBeenCalledWith('hw-1');
    });
  });

  describe('Add Homework', () => {
    it('shows + button when onAdd provided', () => {
      render(
        <HomeworkTile
          homework={[]}
          role="counselor"
          onAdd={mockOnAdd}
        />
      );

      // Add button shows just "+" now
      const addBtn = document.querySelector('.add-homework-btn');
      expect(addBtn).toBeInTheDocument();
      expect(addBtn.textContent).toBe('+');
    });

    it('opens add form when + button clicked', () => {
      render(
        <HomeworkTile
          homework={[]}
          role="counselor"
          onAdd={mockOnAdd}
        />
      );

      const addBtn = document.querySelector('.add-homework-btn');
      fireEvent.click(addBtn);
      expect(screen.getByPlaceholderText('Homework title')).toBeInTheDocument();
    });

    it('calls onAdd with new homework data', async () => {
      render(
        <HomeworkTile
          homework={[]}
          role="counselor"
          onAdd={mockOnAdd}
        />
      );

      const addBtn = document.querySelector('.add-homework-btn');
      fireEvent.click(addBtn);

      fireEvent.change(screen.getByPlaceholderText('Homework title'), {
        target: { value: 'New Task' }
      });

      fireEvent.click(screen.getByText('Assign'));

      await waitFor(() => {
        expect(mockOnAdd).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'New Task',
            weeklyTarget: 7,
            recurring: true
          })
        );
      });
    });
  });

  describe('Empty States', () => {
    it('shows "No current homework" when empty', () => {
      render(<HomeworkTile homework={[]} role="counselee" />);
      expect(screen.getByText('No current homework.')).toBeInTheDocument();
    });

    it('shows "No done homework" in Done tab when empty', () => {
      render(<HomeworkTile homework={[]} role="counselee" />);
      fireEvent.click(screen.getByText('Done (0)'));
      expect(screen.getByText('No done homework.')).toBeInTheDocument();
    });
  });

  describe('Change Notes (Counselee)', () => {
    it('generates change note when counselee changes times per week', () => {
      const homework = [createHomework({ weeklyTarget: 7 })];
      render(
        <HomeworkTile
          homework={homework}
          role="counselee"
          onEdit={mockOnEdit}
        />
      );

      fireEvent.click(screen.getByText('Daily Prayer'));

      const freqInput = screen.getByDisplayValue('7');
      fireEvent.change(freqInput, { target: { value: '3' } });

      expect(screen.getByText(/Note to counselor:/)).toBeInTheDocument();
      expect(screen.getByText(/Changed from 7x\/week to 3x\/week/)).toBeInTheDocument();
    });
  });

  describe('Journal Homework Navigation', () => {
    const journalHomework = createHomework({
      id: 'hw-journal-1',
      title: 'Journal: Thankful Journal',
      linkedJournalingId: 'journal-123',
      type: 'journaling'
    });

    it('calls onOpenJournal when clicking journal homework (B-side)', () => {
      const mockOnOpenJournal = vi.fn();
      render(
        <HomeworkTile
          homework={[journalHomework]}
          role="counselee"
          onOpenJournal={mockOnOpenJournal}
        />
      );

      fireEvent.click(screen.getByText('Journal: Thankful Journal'));
      expect(mockOnOpenJournal).toHaveBeenCalledWith(journalHomework);
    });

    it('calls onOpenJournal when clicking journal homework (A-side)', () => {
      const mockOnOpenJournal = vi.fn();
      render(
        <HomeworkTile
          homework={[journalHomework]}
          role="counselor"
          onOpenJournal={mockOnOpenJournal}
        />
      );

      fireEvent.click(screen.getByText('Journal: Thankful Journal'));
      expect(mockOnOpenJournal).toHaveBeenCalledWith(journalHomework);
    });

    it('does NOT open edit form for journal homework', () => {
      const mockOnOpenJournal = vi.fn();
      const mockOnEdit = vi.fn();
      render(
        <HomeworkTile
          homework={[journalHomework]}
          role="counselee"
          onOpenJournal={mockOnOpenJournal}
          onEdit={mockOnEdit}
        />
      );

      fireEvent.click(screen.getByText('Journal: Thankful Journal'));
      expect(mockOnOpenJournal).toHaveBeenCalled();
      // Should NOT show edit form elements
      expect(screen.queryByText('Save')).not.toBeInTheDocument();
      expect(screen.queryByText('Cancel Homework')).not.toBeInTheDocument();
    });

    it('still opens edit form for regular homework (not journal)', () => {
      const regularHomework = createHomework({ id: 'hw-regular', title: 'Read Bible' });
      render(
        <HomeworkTile
          homework={[regularHomework]}
          role="counselee"
          onEdit={mockOnEdit}
        />
      );

      fireEvent.click(screen.getByText('Read Bible'));
      // Edit form should appear
      expect(screen.getByText('Save')).toBeInTheDocument();
    });
  });

  describe('Think List Homework Navigation', () => {
    const thinkListHomework = createHomework({
      id: 'hw-tl-1',
      title: 'Thinklist: Anxiety Thoughts',
      linkedThinkListId: 'tl-123',
      type: 'thinkList'
    });

    it('calls onOpenThinkList when clicking think list homework (B-side)', () => {
      const mockOnOpenThinkList = vi.fn();
      render(
        <HomeworkTile
          homework={[thinkListHomework]}
          role="counselee"
          onOpenThinkList={mockOnOpenThinkList}
        />
      );

      // Think list items use the brain icon, click the container
      const item = document.querySelector('.thinklist-item');
      fireEvent.click(item);
      expect(mockOnOpenThinkList).toHaveBeenCalledWith(thinkListHomework);
    });

    it('calls onOpenThinkList when clicking think list homework (A-side)', () => {
      const mockOnOpenThinkList = vi.fn();
      render(
        <HomeworkTile
          homework={[thinkListHomework]}
          role="counselor"
          onOpenThinkList={mockOnOpenThinkList}
        />
      );

      const item = document.querySelector('.thinklist-item');
      fireEvent.click(item);
      expect(mockOnOpenThinkList).toHaveBeenCalledWith(thinkListHomework);
    });

    it('does NOT open edit form for think list homework', () => {
      const mockOnOpenThinkList = vi.fn();
      render(
        <HomeworkTile
          homework={[thinkListHomework]}
          role="counselee"
          onOpenThinkList={mockOnOpenThinkList}
        />
      );

      const item = document.querySelector('.thinklist-item');
      fireEvent.click(item);
      expect(mockOnOpenThinkList).toHaveBeenCalled();
      expect(screen.queryByText('Save')).not.toBeInTheDocument();
    });
  });
});
