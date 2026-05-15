export interface AdmonitionProps {
  /** The type of admonition: note, warning, or tip */
  type: 'note' | 'warning' | 'tip';
  /** The text content of the admonition */
  content: string;
}

const ADMONITION_CONFIG = {
  note: {
    icon: 'ℹ️',
    label: 'Note',
    className: 'admonition--note',
  },
  warning: {
    icon: '⚠️',
    label: 'Warning',
    className: 'admonition--warning',
  },
  tip: {
    icon: '💡',
    label: 'Tip',
    className: 'admonition--tip',
  },
} as const;

/**
 * Admonition component renders a callout block with type-specific
 * icon, background color, and left border for note, warning, and tip types.
 *
 * Validates: Requirement 15.2
 */
export function Admonition({ type, content }: AdmonitionProps) {
  const config = ADMONITION_CONFIG[type];

  return (
    <aside
      className={`admonition ${config.className}`}
      role="note"
      aria-label={`${config.label} admonition`}
    >
      <div className="admonition__header">
        <span className="admonition__icon" aria-hidden="true">
          {config.icon}
        </span>
        <span className="admonition__label">{config.label}</span>
      </div>
      <div className="admonition__content">
        {content}
      </div>
    </aside>
  );
}

export default Admonition;
