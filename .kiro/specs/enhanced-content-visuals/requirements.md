# Requirements Document

## Introduction

This feature adds rich visual elements to the CS Reference Guide's content rendering system to improve comprehension, enable self-testing, and provide structured comparisons. Some enhancements replace existing rendering behavior (Mermaid diagrams gain responsive scaling and error handling replacing the current fixed-width/silent-failure behavior; tables gain enhanced styling replacing the current uniform rows; interview Q&A sections gain collapsible answers replacing the current plain-text rendering). New content node types (comparison cards, prerequisite badges, data visualizations) are added alongside existing ones. No changes to existing markdown content files are required — the parser auto-detects existing patterns.

## Glossary

- **Content_Pipeline**: The Vite plugin system that parses markdown files into structured JSON content nodes at build time
- **Markdown_Parser**: The remark-based parser (`markdown-parser.ts`) that converts markdown AST into `ContentNode` discriminated union types
- **Content_Renderer**: The React component (`ContentCard.tsx`) that renders `ContentNode` objects into visual HTML elements
- **Mermaid_Renderer**: The existing React component that renders Mermaid diagram source code into SVG diagrams
- **Content_Node**: A discriminated union type representing a single renderable element within a content section
- **Collapsible_Section**: A UI element that hides content behind a toggle, requiring user interaction to reveal
- **Comparison_Card**: A side-by-side visual layout for presenting tradeoffs between two or more options
- **Prerequisite_Badge**: A visual indicator linking to content that should be read before the current topic
- **Data_Visualization**: A chart or graph rendered from structured data embedded in markdown content
- **Admonition**: An existing callout block type (NOTE, WARNING, TIP) already supported by the pipeline

## Requirements

### Requirement 1: Enhanced Mermaid Diagram Error Handling and Responsiveness

**User Story:** As a developer studying system design, I want Mermaid diagrams (architecture flows, sequence diagrams, class diagrams, state diagrams) to render responsively with clear error feedback, so that diagrams are usable on all screen sizes and authoring mistakes are easy to fix.

#### Acceptance Criteria

1. IF a Mermaid diagram contains syntax errors, THEN THE Mermaid_Renderer SHALL display an error message indicating the nature of the failure alongside the original diagram source code in a preformatted block, replacing the current behavior of rendering nothing or showing a blank container on error
2. IF a Mermaid diagram does not complete rendering within 5000 milliseconds, THEN THE Mermaid_Renderer SHALL abort the render attempt and display a timeout indication alongside the original diagram source code in a preformatted block
3. THE Mermaid_Renderer SHALL render all diagram types scaled to fit the width of the parent content container using SVG scaling, replacing the current fixed-width rendering behavior so that diagrams at or below the container width display without horizontal scrolling
4. WHEN a rendered Mermaid diagram's intrinsic width exceeds the parent content container width, THE Mermaid_Renderer SHALL constrain the diagram within a horizontally scrollable container that does not cause the page layout to overflow
5. WHEN the application theme changes between dark and light mode, THE Mermaid_Renderer SHALL re-render diagrams using the newly active theme colors for backgrounds, text, and lines within 1000 milliseconds of the theme change

### Requirement 2: Sequence Diagram Support Verification

**User Story:** As a developer studying protocols and multi-party interactions, I want to confirm that the existing Mermaid renderer correctly handles sequence diagram features, so that OAuth flows, DB transactions, and WebSocket lifecycles render completely.

#### Acceptance Criteria

1. THE Mermaid_Renderer SHALL support sequence diagram features including alt/opt/loop combined fragments, notes (over, left of, right of), participant aliases, activation/deactivation, and return arrows (solid and dashed), producing valid SVG output without throwing JavaScript exceptions
2. THE Mermaid_Renderer SHALL render sequence diagrams with participant labels at a minimum font size of 10px that do not overlap or get clipped by the container at viewport widths of 320px or greater for diagrams containing up to 8 participants
3. WHEN a sequence diagram contains nested combined fragments (e.g., an alt block inside a loop block), THE Mermaid_Renderer SHALL render all nesting levels with visually distinct boundaries separating each fragment

### Requirement 3: Class and Entity Diagram Support Verification

**User Story:** As a developer studying object-oriented design, I want to confirm that the existing Mermaid renderer correctly handles class diagram features, so that data models, interfaces, and type hierarchies render with proper UML notation.

#### Acceptance Criteria

1. THE Mermaid_Renderer SHALL support class diagram relationship types including inheritance (solid line with hollow arrowhead), composition (solid line with filled diamond), aggregation (solid line with hollow diamond), and association (solid line with open arrowhead) without rendering errors
2. THE Mermaid_Renderer SHALL render class diagrams with a minimum font size of 12px for all text elements including class names, member names, and relationship labels at viewport widths of 768px or greater
3. THE Mermaid_Renderer SHALL render class members including attributes and methods with their visibility modifiers (public, private, protected) displayed within the class box
4. THE Mermaid_Renderer SHALL visually distinguish interfaces from classes by rendering the interface stereotype annotation above the interface name

### Requirement 4: State Diagram Support Verification

**User Story:** As a developer studying lifecycle management, I want to confirm that the existing Mermaid renderer correctly handles state diagram features, so that lifecycle states and transitions render with proper notation.

#### Acceptance Criteria

1. THE Mermaid_Renderer SHALL render state diagrams containing composite states (nested to at least 2 levels), forks, joins, and choice pseudostates without rendering errors, producing visible SVG output for each feature
2. THE Mermaid_Renderer SHALL visually distinguish start states, end states, and intermediate states using standard UML state notation (filled circle for start, bullseye for end, rounded rectangle for intermediate)
3. THE Mermaid_Renderer SHALL render state transition labels and guard conditions at a minimum font size of 12px

### Requirement 5: Enhanced Comparison Table Styling

**User Story:** As a developer comparing technologies, I want existing markdown tables to render with enhanced styling including sticky headers and alternating rows, so that I can quickly scan differences between options.

#### Acceptance Criteria

1. THE Content_Renderer SHALL render all existing markdown tables with alternating row background colors that are visible in both dark and light themes, replacing the current uniform row background styling
2. THE Content_Renderer SHALL render tables with horizontal scrolling on viewports narrower than the table's natural width, replacing any current overflow behavior that causes page-level horizontal scrolling
3. THE Content_Renderer SHALL apply bold styling to the first column cells of table body rows to highlight the comparison dimension
4. IF a table has more than 5 rows, THEN THE Content_Renderer SHALL render the table within a container with a maximum height of 400px and vertical overflow scrolling, with the table header row remaining fixed at the top of the scrollable container during vertical scrolling
5. THE Content_Renderer SHALL preserve existing table hover highlighting and border styling when applying the new enhanced styles

### Requirement 6: Collapsible Interview Answers

**User Story:** As a developer preparing for interviews, I want interview question answers hidden by default behind a toggle, so that I can test my knowledge before revealing the answer.

#### Acceptance Criteria

1. WHEN a markdown file contains content under an `## Interview Questions` heading where questions are identified by lines starting with `**Q:` (or `**Q1:`, `**Q2:`, etc.) and answers are identified by the subsequent paragraph(s) starting with `A:`, THE Markdown_Parser SHALL parse each Q/A pair into a collapsible interview node with separate question and answer fields, replacing the current plain-text rendering of interview sections
2. IF a line under `## Interview Questions` does not match the `**Q:` pattern, THEN THE Markdown_Parser SHALL render it using standard paragraph rendering without errors
3. THE Content_Renderer SHALL display the interview question text visibly and hide the answer behind a "Show Answer" toggle button that is rendered in the collapsed state by default
4. WHEN the user activates the "Show Answer" toggle while the answer is collapsed, THE Content_Renderer SHALL reveal the answer text with an expand animation completing within 300ms
5. WHEN the user activates the "Show Answer" toggle while the answer is expanded, THE Content_Renderer SHALL hide the answer text with a collapse animation completing within 300ms
6. THE Content_Renderer SHALL render the toggle button with a minimum touch target of 44x44px
7. WHEN the user navigates to a different page, THE Collapsible_Section SHALL reset all interview answer toggles to the collapsed state
8. THE Markdown_Parser SHALL require no changes to existing content files — all 182 existing subtopic files with `## Interview Questions` sections SHALL be parsed into collapsible nodes using the auto-detection pattern

### Requirement 7: Comparison Cards

**User Story:** As a developer evaluating tradeoffs, I want side-by-side comparison cards for technology or pattern comparisons, so that I can visually weigh pros and cons.

#### Acceptance Criteria

1. WHEN a markdown file contains a blockquote with the pattern `> [!COMPARE]` followed by a title line, then option blocks each starting with `### Option Name` and containing markdown body content, THE Markdown_Parser SHALL parse the content into a comparison card node with a title string, an array of 2 to 4 option objects each containing a name and body content, and optional pros and cons lists per option
2. THE Content_Renderer SHALL display comparison cards as a side-by-side layout with equal-width columns on viewports 768px or wider, and as a stacked vertical layout on narrower viewports
3. THE Content_Renderer SHALL visually distinguish each option card with a bordered container and a header displaying the option name
4. IF a comparison card block contains fewer than 2 or more than 4 options, THEN THE Markdown_Parser SHALL fall through to standard blockquote rendering without errors
5. WHEN a comparison card option contains a bullet list prefixed with "Pros:" or "Cons:" labels, THE Content_Renderer SHALL render pros list items with a green accent and cons list items with a red accent
6. THE Content_Renderer SHALL render comparison card content with a minimum touch target of 44x44px for any interactive elements within the card

### Requirement 8: Prerequisite Link Badges

**User Story:** As a developer navigating advanced topics, I want to see "Read X first" badges on content that has prerequisites, so that I can follow the recommended learning order.

#### Acceptance Criteria

1. WHEN a markdown file contains a blockquote starting with `> [!PREREQ]` followed by one or more lines each containing a single markdown link (e.g., `> [Display Text](./path.md)`), THE Markdown_Parser SHALL parse the content into a prerequisite badge node containing an ordered array of link objects, each with a display text string and a relative path target, supporting a maximum of 5 prerequisite links per blockquote
2. IF a `> [!PREREQ]` blockquote contains no parseable markdown links, THEN THE Markdown_Parser SHALL skip prerequisite badge node creation and emit the content as a standard blockquote node
3. THE Content_Renderer SHALL display prerequisite badge nodes as the first rendered elements within the content area, positioned before any other content nodes in the section
4. THE Content_Renderer SHALL render each prerequisite badge as a clickable anchor element styled as a pill-shaped badge (border-radius producing fully rounded ends) containing a prefix icon and the prerequisite display text
5. WHEN the user activates a prerequisite badge link, THE Content_Renderer SHALL navigate to the referenced topic using the application's client-side routing, resolving the relative markdown path to the corresponding route path
6. THE Content_Renderer SHALL render prerequisite badges with a background color that meets WCAG 2.1 AA contrast ratio (at least 4.5:1 for text against the badge background, and at least 3:1 for the badge background against the page background) in both light and dark themes

### Requirement 9: Data Visualization

**User Story:** As a developer studying algorithms and performance, I want embedded charts and graphs rendered from structured data in markdown, so that I can visualize complexity curves, performance benchmarks, and statistical distributions.

#### Acceptance Criteria

1. WHEN a markdown file contains a fenced code block with language `chart` followed by a JSON configuration object containing at minimum a `type` field (one of "line", "bar", or "area"), a `data` array of objects, and an `xKey` string identifying the x-axis field, THE Markdown_Parser SHALL parse the content into a data visualization node with the chart type, data array, and axis configuration fields
2. THE Content_Renderer SHALL support exactly three chart types — line charts, bar charts, and area charts — using the existing Recharts library
3. THE Content_Renderer SHALL render charts responsively, filling the available content width and maintaining a 16:9 aspect ratio
4. IF a chart configuration contains invalid JSON, THEN THE Content_Renderer SHALL display an inline error message indicating the JSON parse failure location instead of a broken chart
5. IF a chart configuration contains valid JSON but is missing any of the required fields (`type`, `data`, `xKey`), THEN THE Content_Renderer SHALL display an inline error message identifying the missing field names instead of a broken chart
6. IF the `data` array in a chart configuration is empty or contains zero valid data points, THEN THE Content_Renderer SHALL render the chart container with an empty-state message indicating no data is available
7. IF multiple data series keys are present in the chart configuration, THEN THE Content_Renderer SHALL render a legend identifying each series; IF only a single data series is present, THEN THE Content_Renderer SHALL hide the legend
8. THE Content_Renderer SHALL render labeled axes on all charts, with axis labels derived from the `xKey` and series key names in the configuration
9. THE Content_Renderer SHALL apply the application's current theme colors (dark or light mode) to all chart elements including axes, gridlines, tooltips, and data series

### Requirement 10: Content Pipeline Integration for New Node Types

**User Story:** As a content author, I want the new visual elements to be processed through the existing Vite content pipeline without modifying existing behavior, so that content builds remain fast and all current content continues to render correctly.

#### Acceptance Criteria

1. THE Markdown_Parser SHALL recognize and parse all new content node types (interview, compare, prereq, chart) from their respective markdown syntax patterns into corresponding ContentNode entries within the section hierarchy, in addition to all existing node types
2. THE Content_Pipeline SHALL include new content node types in the generated JSON output without altering the serialized structure or field values of any existing node types, such that JSON output for files containing no new syntax remains byte-identical to the output produced before the new node types were added
3. THE Content_Pipeline SHALL include text content from all four new node types (comparison card text, interview questions and answers, prerequisite descriptions, and chart labels) in the search index so that this content is returned in search results
4. IF a markdown file contains a blockquote matching admonition-style syntax with a type identifier not recognized by the parser (not one of NOTE, WARNING, TIP, or the new node type identifiers), THEN THE Markdown_Parser SHALL render it as a standard blockquote node without producing errors or warnings
5. THE Content_Pipeline SHALL process all new node types within the existing build time budget, adding no more than 10% to the total content build duration measured against the baseline of building the 182 existing subtopic files without new syntax
6. THE Content_Pipeline SHALL maintain backward compatibility with all 182 existing subtopic files, producing byte-identical JSON output for every file that does not use new syntax
