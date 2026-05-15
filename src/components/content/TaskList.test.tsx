import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TaskList } from './TaskList';

describe('TaskList', () => {
  it('renders all task list items', () => {
    const items = [
      { checked: true, text: 'Complete setup' },
      { checked: false, text: 'Write tests' },
      { checked: true, text: 'Deploy app' },
    ];

    render(<TaskList items={items} />);

    expect(screen.getByText('Complete setup')).toBeInTheDocument();
    expect(screen.getByText('Write tests')).toBeInTheDocument();
    expect(screen.getByText('Deploy app')).toBeInTheDocument();
  });

  it('renders checkboxes with correct checked state', () => {
    const items = [
      { checked: true, text: 'Done task' },
      { checked: false, text: 'Pending task' },
    ];

    render(<TaskList items={items} />);

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
  });

  it('renders checkboxes as read-only', () => {
    const items = [{ checked: false, text: 'Task' }];

    render(<TaskList items={items} />);

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('readonly');
  });

  it('renders an empty list when no items provided', () => {
    render(<TaskList items={[]} />);

    const list = screen.getByRole('list');
    expect(list).toBeInTheDocument();
    expect(list.children).toHaveLength(0);
  });

  it('provides accessible labels for each checkbox', () => {
    const items = [
      { checked: true, text: 'Completed item' },
      { checked: false, text: 'Incomplete item' },
    ];

    render(<TaskList items={items} />);

    expect(screen.getByLabelText('Completed item (completed)')).toBeInTheDocument();
    expect(screen.getByLabelText('Incomplete item (not completed)')).toBeInTheDocument();
  });
});
