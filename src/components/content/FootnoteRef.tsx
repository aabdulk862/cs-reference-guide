export interface FootnoteRefProps {
  identifier: string;
  index: number;
}

/**
 * Renders a footnote reference as a superscript link that navigates to the
 * corresponding footnote definition. Part of the bidirectional link system
 * between references and definitions.
 *
 * Validates: Requirement 15.4
 */
export function FootnoteRef({ identifier, index }: FootnoteRefProps) {
  return (
    <sup className="footnote-ref">
      <a
        href={`#footnote-def-${identifier}`}
        id={`footnote-ref-${identifier}`}
        className="footnote-ref__link"
        aria-label={`Footnote ${index}`}
        role="doc-noteref"
      >
        [{index}]
      </a>
    </sup>
  );
}

export default FootnoteRef;
