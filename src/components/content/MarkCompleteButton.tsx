interface MarkCompleteButtonProps {
  isCompleted: boolean;
  onToggle: () => void;
}

export function MarkCompleteButton({ isCompleted, onToggle }: MarkCompleteButtonProps) {
  return (
    <div className="topic-completion">
      <button
        type="button"
        className={`topic-completion__btn ${isCompleted ? 'topic-completion__btn--completed' : ''}`}
        onClick={onToggle}
        aria-pressed={isCompleted}
      >
        {isCompleted ? '✓ Completed' : 'Mark as complete'}
      </button>
    </div>
  );
}
