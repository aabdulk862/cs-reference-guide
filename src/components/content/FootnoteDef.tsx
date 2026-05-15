export interface FootnoteDefProps {
  identifier: string;
  content: string;
}

/**
 * Renders a footnote definition with a back-link to the corresponding reference.
 * Part of the bidirectional link system between references and definitions.
 * Footnote definitions are rendered at the bottom of the topic page.
 *
 * Validates: Requirement 15.4
 */
export function FootnoteDef({ identifier, content }: FootnoteDefProps) {
  return (
    <div
      className="footnote-def"
      id={`footnote-def-${identifier}`}
      role="doc-footnote"
    >
      <a
        href={`#footnote-ref-${identifier}`}
        className="footnote-def__backref"
        aria-label={`Back to reference ${identifier}`}
      >
        ↩
      </a>
      <span className="footnote-def__identifier">[{identifier}]</span>
      <span className="footnote-def__content">{content}</span>
    </div>
  );
}

export default FootnoteDef;
