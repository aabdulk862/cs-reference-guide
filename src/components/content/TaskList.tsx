import type { TaskListItem } from '@/types/content';

export interface TaskListProps {
  items: TaskListItem[];
}

/**
 * Renders a task list with read-only checkboxes reflecting the authored state.
 * Each item displays a checkbox (checked or unchecked) followed by the item text.
 *
 * Validates: Requirement 15.3
 */
export function TaskList({ items }: TaskListProps) {
  return (
    <ul className="task-list" role="list">
      {items.map((item, index) => (
        <li key={index} className="task-list__item">
          <input
            type="checkbox"
            checked={item.checked}
            readOnly
            aria-label={`${item.text} (${item.checked ? 'completed' : 'not completed'})`}
            className="task-list__checkbox"
          />
          <span className="task-list__text">{item.text}</span>
        </li>
      ))}
    </ul>
  );
}

export default TaskList;
