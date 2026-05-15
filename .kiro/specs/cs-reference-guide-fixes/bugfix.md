# Bugfix Requirements Document

## Introduction

The CS Reference Guide app has multiple defects spanning broken tests, missing styles, incomplete pages, unintegrated components, and content pipeline issues. The storage utility tests fail due to missing localStorage in the test environment. The Dashboard page is a placeholder that doesn't use existing study components. Critical UI components (search bar, topic page, view toggle, breadcrumbs, sidebar quick links, cheat sheets page) have no CSS styles, rendering them unstyled or invisible. Interactive components (Big O Chart, Code Playground, DS Visualization, Quiz, SQL Playground) are never rendered — ContentCard shows placeholder text instead. The content pipeline produces duplicate topic IDs within categories (multiple "Summary", "Conclusion", etc.) causing data collisions, and many topics parse with 0 sections/words due to markdown files that lack H2 headings. These issues collectively make the app non-functional for its intended purpose as a study tool.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the test suite runs storage.test.ts THEN the system crashes with "TypeError: Cannot read properties of undefined (reading 'clear')" because localStorage is not available in the jsdom test environment

1.2 WHEN a user navigates to the Dashboard page THEN the system displays only a placeholder message and a bookmarks list, without progress overview, weekly stats, due-for-review items, daily goal widget, pomodoro timer, or resume prompt — despite these components already existing in src/components/study/

1.3 WHEN the SearchBar component renders in the header THEN the system displays unstyled elements because no CSS exists for .search-bar, .search-input-wrapper, .search-input, .search-icon, .search-results-dropdown, .search-results-list, .search-result-item, .search-highlight, and .search-no-results classes

1.4 WHEN a user navigates to a TopicPage THEN the system displays unstyled content because no CSS exists for .page-topic, .topic-progress, .topic-progress__bar, .topic-progress__fill, .topic-progress__label, .topic-content-sections, and .tracked-content-card classes

1.5 WHEN the ViewToggle component renders on a TopicPage THEN the system displays unstyled toggle buttons because no CSS is defined for the component

1.6 WHEN the Breadcrumbs component renders on a TopicPage THEN the system displays unstyled breadcrumb navigation because no CSS is defined for the component

1.7 WHEN the Sidebar quick links section renders THEN the system displays unstyled links because no CSS exists for .sidebar-quick-links and .sidebar-quick-link classes

1.8 WHEN a ContentCard contains an interactive element (bigo-chart, playground, visualization, quiz, or sql-playground) THEN the system displays only placeholder text "Interactive: {type}" instead of rendering the actual interactive component (BigOChart, CodePlayground, DSVisualization, Quiz, or SQLPlayground)

1.9 WHEN a user wants to switch between light and dark themes THEN the system provides no mechanism to do so, forcing dark mode only with no toggle control

1.10 WHEN the content pipeline processes markdown files that share the same H1 title within a category (e.g., multiple files titled "Summary", "Conclusion", "Best Practices", "Highlights") THEN the system generates duplicate topic IDs causing only the last-processed file to be accessible while earlier files are overwritten

1.11 WHEN the content pipeline processes markdown files that have no H2 headings (content is flat or only uses H1) THEN the system generates topics with 0 sections and 0 word count, making the content invisible in the app

1.12 WHEN the AllCheatSheets page renders THEN the system displays unstyled elements because no CSS exists for .all-cheat-sheets, .all-cheat-sheets__header, .all-cheat-sheets__search, .all-cheat-sheets__grid, .all-cheat-sheets__card, and related classes

1.13 WHEN the sidebar links to a topic using the pattern /topic/:categoryId/:topicId THEN the system may fail to load the content because the TopicPage fetches from /content/:categorySlug/:topicSlug.json but the sidebar uses topic.id (which may differ from the file slug used in the content path)

1.14 WHEN the content pipeline scans for markdown files THEN the system ignores the markdowns/ directory (which contains substantial content for Grokking Algorithms, Designing Data-Intensive Applications, Cracking the Coding Interview, Data Structures and Algorithms, Git, and more) because no category mapping exists for files in that directory

1.15 WHEN the content pipeline processes markdown files that use multiple H1 headings as chapter separators (e.g., "# Chapter 1:", "# Chapter 2:") THEN the system only captures the first H1 as the title and treats subsequent H1s as ignored content, resulting in most of the file's content being lost

1.16 WHEN the Grokking Algorithms or Cracking the Coding Interview categories are expected in the sidebar THEN the system shows no topics because their directories contain only image files with no markdown — the actual content exists in the markdowns/ directory but is not mapped

1.17 WHEN the Designing Data-Intensive Applications markdown is processed THEN the system only captures content for Chapters 1 and 2 because Chapters 3–12 are empty stubs (just "# Chapter N:" with no content below them), resulting in an incomplete System Design category

### Expected Behavior (Correct)

2.1 WHEN the test suite runs storage.test.ts THEN the system SHALL provide a localStorage mock/polyfill in the test setup (via jsdom environment configuration or explicit mock) so all 19 storage tests pass without environment errors

2.2 WHEN a user navigates to the Dashboard page THEN the system SHALL display a complete study dashboard including: overall progress overview (topics completed / total), WeeklyStats chart, DueForReview list, DailyGoal widget, PomodoroTimer, ResumePrompt (last studied topic), and Bookmarks section — all using the existing components from src/components/study/

2.3 WHEN the SearchBar component renders in the header THEN the system SHALL display a properly styled search input with icon, dropdown results panel, highlighted matches, and no-results state that is visually consistent with the app's design system

2.4 WHEN a user navigates to a TopicPage THEN the system SHALL display properly styled topic content with a progress bar showing sections completed, content section cards with appropriate spacing, and tracked content cards with visual distinction

2.5 WHEN the ViewToggle component renders on a TopicPage THEN the system SHALL display properly styled toggle buttons (Full / Cheat Sheet / ELI5) that clearly indicate the active view mode with distinct selected/unselected states

2.6 WHEN the Breadcrumbs component renders on a TopicPage THEN the system SHALL display a properly styled breadcrumb navigation trail (Home > Category > Topic) with clickable links and visual separators

2.7 WHEN the Sidebar quick links section renders THEN the system SHALL display properly styled quick-access links (e.g., "All Cheat Sheets") with appropriate hover and focus states, visually separated from the category tree

2.8 WHEN a ContentCard contains an interactive element THEN the system SHALL render the corresponding interactive component (BigOChart for bigo-chart, CodePlayground for playground, DSVisualization for visualization, Quiz for quiz, SQLPlayground for sql-playground) with full functionality instead of placeholder text

2.9 WHEN a user wants to switch between light and dark themes THEN the system SHALL provide a theme toggle button in the header that switches between light and dark color schemes, persisting the preference to localStorage via the storage utility

2.10 WHEN the content pipeline processes markdown files that share the same H1 title within a category THEN the system SHALL generate unique topic IDs by incorporating the parent directory name or file path context to disambiguate (e.g., "array-summary" vs "graph-summary" instead of both being "summary")

2.11 WHEN the content pipeline processes markdown files that have no H2 headings THEN the system SHALL treat the content under H1 as a single implicit section so that the topic's word count and section count are non-zero and the content is visible in the app

2.12 WHEN the AllCheatSheets page renders THEN the system SHALL display a properly styled page with a search/filter input, category-grouped topic cards in a responsive grid layout, and visual card styling consistent with the app's design system

2.13 WHEN the sidebar links to a topic THEN the system SHALL use consistent URL slugs that match the content JSON file paths so that clicking a sidebar topic link successfully loads the corresponding topic content

2.14 WHEN the content pipeline scans for markdown files THEN the system SHALL include the markdowns/ directory by adding category mappings for its files (Grokking Algorithms → Algorithms, Designing Data-Intensive Applications → System Design, Cracking the Coding Interview → Interview Prep, Data Structures and Algorithms → Data Structures, Git → Git) so that all available study content appears in the app

2.15 WHEN the content pipeline processes markdown files that use multiple H1 headings as chapter separators THEN the system SHALL treat each H1 (after the first) as an H2-level section boundary so that all chapters are captured as top-level sections with their content preserved

2.16 WHEN the content pipeline processes the markdowns/ directory files THEN the system SHALL generate complete topics with proper section hierarchy, ensuring Grokking Algorithms, Cracking the Coding Interview, and Designing Data-Intensive Applications content is accessible in the sidebar and navigable in the app

2.17 WHEN the Designing Data-Intensive Applications markdown has empty chapter stubs (Chapters 3–12) THEN the system SHALL generate comprehensive summary content for each missing chapter covering the key concepts from the book (Storage and Retrieval, Encoding and Evolution, Replication, Partitioning, Transactions, Distributed Systems challenges, Consistency and Consensus, Batch Processing, Stream Processing, and the Future of Data Systems) so the System Design category is complete and useful for study

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the app renders the AppShell layout (header, sidebar, main content area) THEN the system SHALL CONTINUE TO display the correct layout structure with sticky header, fixed-width sidebar, and scrollable main content

3.2 WHEN a user opens the Command Palette (Ctrl+K / Cmd+K) THEN the system SHALL CONTINUE TO display the overlay with search input, results list, and keyboard navigation working correctly

3.3 WHEN a user navigates between routes THEN the system SHALL CONTINUE TO lazy-load page components with the loading fallback spinner

3.4 WHEN a ContentCard renders text paragraphs, code blocks, tables, math expressions, images, lists, or blockquotes THEN the system SHALL CONTINUE TO display them with existing styles and formatting

3.5 WHEN the SQL Playground component is used directly THEN the system SHALL CONTINUE TO execute queries and display results with existing styling

3.6 WHEN the sidebar navigation renders categories and topics THEN the system SHALL CONTINUE TO display collapsible categories with topic links, active states, and visited indicators

3.7 WHEN localStorage is available and functioning THEN the system SHALL CONTINUE TO persist bookmarks, progress, navigation state, and preferences using the csguide: namespace prefix

3.8 WHEN the content pipeline processes well-formed markdown files (with H1 title and H2+ sections, unique titles within their category) THEN the system SHALL CONTINUE TO parse them correctly into structured JSON with proper section hierarchy, images, code blocks, and math expressions

3.9 WHEN the exclusion filter encounters .tex, .css, public/, or dot-prefixed directory files THEN the system SHALL CONTINUE TO exclude them from content processing

3.10 WHEN the content pipeline processes the Infosys/ subdirectories (Java, Spring, Maven, Gradle, MongoDB, Kafka, AI) THEN the system SHALL CONTINUE TO correctly map them to their respective categories and parse their markdown files into structured content
