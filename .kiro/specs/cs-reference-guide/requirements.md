# Requirements Document

## Introduction

This document defines the requirements for transforming the existing Computer Science repository — currently a disorganized collection of markdown notes, images, and static HTML files — into a functional, interactive CS reference guide application. The app serves as a one-stop shop for studying and learning computer science topics, specifically designed for users with ADHD/ADD who struggle with traditional study methods. The app must be engaging and interactive without being gamified.

## Glossary

- **App**: The interactive CS reference guide web application built with React and served locally or deployed as a static site
- **Content_Parser**: The module responsible for reading existing markdown notes and converting them into structured content for the App
- **Topic**: A discrete CS subject area (e.g., Data Structures, Algorithms, Git, System Design) displayed as a navigable section in the App
- **Study_Session**: A user-initiated focused interaction with one or more Topics, with built-in engagement features
- **Focus_Timer**: A visible countdown or elapsed timer that helps users maintain awareness of time spent studying
- **Progress_Tracker**: The component that records which Topics and sections a user has visited and completed
- **Interactive_Element**: Any UI component that requires user action to reveal, manipulate, or explore content (e.g., expandable sections, code playgrounds, quizzes)
- **Quick_Reference_Card**: A condensed, visually distinct summary card for a Topic showing key facts at a glance
- **Navigation_System**: The sidebar, breadcrumb, and search components that allow users to move between Topics
- **Content_Section**: A subsection within a Topic containing explanations, examples, diagrams, or exercises
- **Search_Engine**: The client-side full-text search component that indexes all content for instant lookup
- **Bookmark**: A user-saved reference to a specific Content_Section for quick return access
- **Pomodoro_Mode**: A study mode that structures sessions into focused intervals with short breaks, based on the Pomodoro Technique

## Requirements

### Requirement 1: Application Architecture

**User Story:** As a CS student, I want a functional web application that runs locally or deploys as a static site, so that I can access all my study materials in one organized place.

#### Acceptance Criteria

1. THE App SHALL be a React single-page application bootstrapped with Vite
2. THE App SHALL serve all existing CS content from the repository as structured pages, each accessible via the Navigation_System defined in Requirement 2
3. THE App SHALL load in under 3 seconds on a simulated 10 Mbps connection with 20ms latency
4. WHEN the App has completed its initial load, THE App SHALL function offline by caching all content locally, enabling Topic navigation, Content_Section viewing, and Search_Engine queries without a network connection
5. WHEN the App is built, THE App SHALL produce a static bundle deployable to any static hosting provider without requiring server-side rendering or a backend process

### Requirement 2: Content Organization and Navigation

**User Story:** As a student with ADHD, I want content organized into clear, scannable categories with multiple ways to navigate, so that I can find what I need without getting overwhelmed or lost.

#### Acceptance Criteria

1. THE Navigation_System SHALL display all Topics in a persistent sidebar grouped by collapsible category (Data Structures, Algorithms, Git, System Design, Interview Prep, Java, Spring Framework, Build Tools, Databases, Messaging, AI, Operating Systems, Networking, Design Patterns, DevOps, Testing, Behavioral Interview), with each category expandable and collapsible by user click
2. THE Navigation_System SHALL provide breadcrumb navigation showing the current location within the Topic hierarchy
3. WHEN a user types at least 1 character in the Search_Engine, THE Search_Engine SHALL display up to 10 matching results within 200ms with the matching keywords highlighted in each result
4. THE Search_Engine SHALL index all content including headings, body text, code examples, and glossary terms
5. WHEN a user selects a search result, THE App SHALL navigate directly to that Content_Section and scroll it into view
6. THE Navigation_System SHALL display a visual indicator showing which Topics have been visited and which have not
7. IF a search query returns no matching results, THEN THE Search_Engine SHALL display a message indicating no results were found and suggest checking the spelling or using different keywords

### Requirement 3: ADHD-Friendly Content Presentation

**User Story:** As a user with ADHD, I want content broken into small, visually distinct chunks with clear hierarchy, so that I can absorb information without losing focus.

#### Acceptance Criteria

1. THE App SHALL display each Content_Section as a self-contained card with a visible border or shadow boundary, containing a maximum of 300 words of visible text before requiring the user to activate an expand control to reveal remaining content
2. THE App SHALL use consistent visual hierarchy with color-coded category headers, a minimum body font size of 16px, a minimum line-height of 1.5, and a minimum of 16px spacing between Content_Section cards
3. THE App SHALL present code examples in syntax-highlighted blocks with a one-click copy button that displays a confirmation state (e.g., "Copied") for at least 2 seconds after activation
4. WHEN a Content_Section contains more than 3 paragraphs or exceeds 300 words (whichever threshold is reached first), THE App SHALL collapse content beyond the first 3 paragraphs or 300 words behind an expandable "Read more" control
5. THE App SHALL display Quick_Reference_Cards at the top of each Topic page summarizing key points in a bulleted list of no more than 7 items, each item no longer than 2 sentences
6. THE App SHALL use visual progress indicators (progress bars or checkmarks) within each Topic to show the ratio of viewed Content_Sections to total Content_Sections in that Topic
7. WHEN a user activates the "Read more" expand control on a Content_Section, THE App SHALL reveal the remaining content inline without navigating away from the current page and SHALL provide a corresponding "Show less" control to re-collapse the content

### Requirement 4: Interactive Learning Elements

**User Story:** As a student who struggles with passive reading, I want interactive elements that require me to engage with the material, so that I retain information better.

#### Acceptance Criteria

1. WHEN a Topic contains code examples, THE App SHALL provide an inline code playground where users can edit and run JavaScript or pseudocode snippets, with a maximum execution timeout of 5 seconds
2. IF code execution in the playground exceeds the 5-second timeout or produces a runtime error, THEN THE App SHALL halt execution and display an error message indicating the failure reason
3. THE App SHALL include expandable "Test Yourself" sections with 1 to 5 fill-in-the-blank or multiple-choice questions (each with 4 answer options) after each Topic heading (H2-level section)
4. WHEN a user answers a question correctly, THE App SHALL display positive feedback within 500ms, including an explanation of no more than 150 characters
5. WHEN a user answers a question incorrectly, THE App SHALL display the correct answer within 500ms along with a numbered step-by-step explanation
6. THE App SHALL provide interactive visualizations for data structures (e.g., animated insertion into a BST, step-through of BFS/DFS) with play, pause, step-forward, and reset controls, where each animation step lasts between 500ms and 2000ms
7. WHEN a Topic includes complexity analysis, THE App SHALL display an interactive Big O comparison chart where users can toggle up to 10 algorithms on and off

### Requirement 5: Focus and Study Session Management

**User Story:** As a user with ADHD, I want built-in tools that help me manage my study time and maintain focus, so that I can study effectively without external timers or apps.

#### Acceptance Criteria

1. THE App SHALL provide a Pomodoro_Mode with configurable work intervals (default 25 minutes, range 5 to 90 minutes) and break intervals (default 5 minutes, range 1 to 30 minutes), and SHALL persist the user's configured values in localStorage
2. WHEN a Pomodoro work interval ends, THE App SHALL display an in-app banner notification at the top of the content area suggesting a break, without interrupting the current view or requiring immediate action, and the notification SHALL remain visible until the user dismisses it or starts the break
3. WHEN a Pomodoro break interval ends, THE App SHALL display an in-app banner notification prompting the user to resume studying, which remains visible until dismissed or the user resumes the work interval
4. WHEN a user navigates to any Content_Section, THE App SHALL start a Study_Session and display a Focus_Timer in the header showing elapsed time in HH:MM:SS format, and the Focus_Timer SHALL continue counting across page navigations until the user manually ends the session or closes the App
5. WHILE Pomodoro_Mode is active, THE App SHALL reduce the opacity of the Navigation_System sidebar and any non-active Content_Section cards to 50% opacity, keeping only the current Content_Section and the Focus_Timer at full visibility
6. THE App SHALL allow users to set a daily study goal between 5 and 480 minutes and display progress toward that goal as a progress bar with elapsed minutes and percentage, and the daily goal SHALL reset at midnight in the user's local timezone
7. THE App SHALL provide start, pause, and stop controls for Pomodoro_Mode, and WHEN the user stops Pomodoro_Mode, THE App SHALL end the current interval and restore all dimmed UI elements to full opacity
8. IF the user closes or refreshes the App while a Study_Session is active, THEN THE App SHALL save the elapsed session time to localStorage and restore the accumulated time when the user returns

### Requirement 6: Progress Tracking and Bookmarks

**User Story:** As a student, I want to track what I've studied and bookmark important sections, so that I can pick up where I left off and revisit key material.

#### Acceptance Criteria

1. THE Progress_Tracker SHALL record which Content_Sections a user has viewed, WHEN a user scrolls to at least 90% of a Content_Section's height, THE Progress_Tracker SHALL mark that section as complete
2. THE App SHALL display an overall progress dashboard showing percentage completion per Topic and total
3. WHEN a user clicks the Bookmark button on any Content_Section, THE App SHALL save that section to a persistent Bookmarks list accessible from the dashboard
4. WHEN a user clicks the Bookmark button on an already-bookmarked Content_Section, THE App SHALL remove that section from the Bookmarks list
5. THE App SHALL store all progress and bookmark data in browser localStorage so it persists across sessions
6. IF localStorage is unavailable or full, THEN THE App SHALL display a warning message indicating that progress data cannot be saved and continue operating with in-memory state for the current session
7. WHEN a user opens the App after at least 1 minute since their last session, THE Progress_Tracker SHALL display a "Continue where you left off" prompt linking to the last viewed Content_Section
8. THE App SHALL provide a weekly summary view showing total active study time (measured as elapsed time while the App tab is in the foreground) and topics covered over the past 7 days

### Requirement 7: Content Parsing and Migration

**User Story:** As the repository owner, I want all existing markdown notes automatically parsed and displayed in the app, so that I do not lose any existing study material.

#### Acceptance Criteria

1. THE Content_Parser SHALL recursively scan all directories in the repository and convert every file with a .md extension into a structured React component, preserving the directory nesting as Topic and Content_Section hierarchy
2. THE Content_Parser SHALL render all images, diagrams, and code blocks from the markdown source files such that images display at their original aspect ratio, diagrams remain visually intact, and code blocks appear with syntax highlighting and language annotation preserved
3. THE Content_Parser SHALL map markdown heading levels to the navigation hierarchy where H1 headings define a Topic, H2 headings define Content_Sections within that Topic, and H3 and below define subsections within a Content_Section for the table of contents
4. WHEN a markdown file contains LaTeX math notation using inline ($...$) or block ($$...$$) delimiters, THE Content_Parser SHALL render it as formatted mathematical expressions using a math rendering library
5. WHEN a markdown file contains relative image paths, THE Content_Parser SHALL resolve them relative to the source markdown file's directory and copy the referenced assets to the built App's static output so that images load without broken references
6. THE Content_Parser SHALL exclude files matching the following patterns from published App content: files with .tex extension, files with .css extension, files within the public/ directory, and files within hidden directories (prefixed with a dot)
7. IF a markdown file contains syntax that cannot be parsed, THEN THE Content_Parser SHALL render the parseable portions of that file and display a visible inline indicator at the location of unparseable content, without preventing the remaining files from being processed

### Requirement 8: Visual Design and Accessibility

**User Story:** As a user who studies for extended periods, I want a visually comfortable interface with good readability, so that I can study without eye strain.

#### Acceptance Criteria

1. THE App SHALL use a minimum font size of 16px for body text and maintain a contrast ratio of at least 4.5:1 for all text against its background
2. THE App SHALL be fully navigable via keyboard such that all interactive elements are reachable via Tab/Shift+Tab and activatable via Enter or Space, with focus indicators of at least 2px solid outline with a contrast ratio of at least 3:1 against adjacent colors
3. THE App SHALL apply the design tokens from guide-system.css for consistent styling across all components
4. THE App SHALL be responsive on screen widths from 320px to 2560px such that all content is readable without horizontal scrolling and all interactive elements maintain a minimum touch target size of 44x44 CSS pixels

### Requirement 9: Spaced Repetition Prompts

**User Story:** As a student preparing for interviews, I want the app to remind me to revisit topics at optimal intervals, so that I retain information long-term.

#### Acceptance Criteria

1. WHEN a user completes a Topic (all Content_Sections marked as complete by the Progress_Tracker), THE App SHALL schedule the first review reminder for 1 day from the completion date, following the interval sequence: 1 day, 3 days, 7 days, 14 days, 30 days
2. WHEN the current date is equal to or past a Topic's next scheduled review date, THE App SHALL display that Topic in a "Due for Review" list on the dashboard showing the Topic name and the number of days since last review, sorted by most overdue first, displaying up to 20 items
3. WHEN a user opens a due Topic from the review list and scrolls through at least one Content_Section to completion, THE App SHALL mark the review as complete and advance that Topic to the next interval in the spaced repetition schedule
4. IF a user marks a review as "Still struggling", THEN THE App SHALL reset that Topic's schedule to the first interval (1 day)
5. WHEN a Topic has completed all intervals in the schedule (after the 30-day review), THE App SHALL restart the schedule from the 30-day interval, repeating monthly until the user removes it from the review cycle
6. THE App SHALL store spaced repetition schedules in localStorage alongside progress data

### Requirement 10: Quick-Access Command Palette

**User Story:** As a power user, I want a keyboard-accessible command palette to quickly jump to any topic or action, so that I can navigate the app without using the mouse.

#### Acceptance Criteria

1. WHEN a user presses Ctrl+K (or Cmd+K on macOS), THE App SHALL open a command palette overlay centered on the viewport with a text input field focused and ready for typing
2. THE App SHALL populate the command palette with all Topics, Bookmarks, and available actions (start Pomodoro, open dashboard), each displayed with a label indicating its type (Topic, Bookmark, or Action)
3. WHEN a user types in the command palette, THE App SHALL filter results within 100ms of each keystroke using fuzzy matching and display up to 10 matching items
4. WHEN a user selects a result from the command palette via mouse click or by pressing Enter on a highlighted item, THE App SHALL execute the corresponding navigation or action within 100ms and close the palette
5. WHEN a user presses Escape or clicks outside the command palette, THE App SHALL close the command palette and return focus to the previously focused element
6. WHILE the command palette is open, THE App SHALL allow keyboard navigation of results using the Up and Down arrow keys, with a visible highlight on the currently selected item
7. IF the command palette filter yields zero matching results, THEN THE App SHALL display a "No results found" message within the results area

### Requirement 11: Built-In Content — Operating Systems

**User Story:** As a CS student preparing for interviews, I want comprehensive operating systems content covering processes, memory, and concurrency, so that I can study OS fundamentals without needing a separate textbook.

#### Acceptance Criteria

1. THE App SHALL include authored content covering: processes and threads, CPU scheduling algorithms (FCFS, SJF, Round Robin, Priority), memory management (paging, segmentation, virtual memory), deadlocks (conditions, prevention, avoidance, detection), file systems, and inter-process communication
2. EACH OS Topic SHALL include at least one interactive visualization (e.g., animated scheduling timeline, page table lookup simulation, deadlock resource graph)
3. THE App SHALL include "Test Yourself" questions for each OS subtopic following the format defined in Requirement 4

### Requirement 12: Built-In Content — Networking

**User Story:** As a CS student, I want networking fundamentals explained clearly with diagrams, so that I can understand how systems communicate and answer system design questions confidently.

#### Acceptance Criteria

1. THE App SHALL include authored content covering: OSI and TCP/IP models, HTTP/HTTPS (methods, status codes, headers), DNS resolution, TCP vs UDP, WebSockets, REST vs gRPC, load balancing, and CDNs
2. EACH networking Topic SHALL include a diagram or interactive visualization illustrating the concept (e.g., animated TCP handshake, DNS resolution flow, request lifecycle)
3. THE App SHALL include "Test Yourself" questions for each networking subtopic following the format defined in Requirement 4

### Requirement 13: Built-In Content — Relational Databases and SQL

**User Story:** As a developer, I want SQL and relational database fundamentals in one place, so that I can practice queries and understand database internals for interviews.

#### Acceptance Criteria

1. THE App SHALL include authored content covering: relational model, normalization (1NF through BCNF), SQL syntax (SELECT, JOIN, GROUP BY, HAVING, subqueries, window functions), indexing (B-tree, hash), transactions and ACID properties, isolation levels, and query optimization
2. THE App SHALL provide an inline SQL playground where users can write and execute SQL queries against a pre-loaded sample dataset, with results displayed in a table format
3. THE App SHALL include at least 20 progressively difficult SQL practice problems with solutions and explanations
4. THE App SHALL include "Test Yourself" questions for each database subtopic following the format defined in Requirement 4

### Requirement 14: Built-In Content — Design Patterns

**User Story:** As a Java/Spring developer, I want design patterns explained with real-world examples and code, so that I can recognize when and how to apply them.

#### Acceptance Criteria

1. THE App SHALL include authored content covering at minimum: Creational patterns (Singleton, Factory, Abstract Factory, Builder, Prototype), Structural patterns (Adapter, Decorator, Facade, Proxy, Composite), and Behavioral patterns (Observer, Strategy, Command, Template Method, State, Iterator)
2. EACH design pattern Topic SHALL include: a plain-language "when to use" summary, a UML class diagram, a Java code example, and a real-world analogy
3. THE App SHALL include "Test Yourself" questions for each pattern following the format defined in Requirement 4
4. THE App SHALL provide an interactive pattern selector where users can describe a problem scenario and receive a recommended pattern with explanation

### Requirement 15: Built-In Content — System Design

**User Story:** As a student preparing for system design interviews, I want structured content on distributed systems concepts with diagrams, so that I can practice designing scalable systems.

#### Acceptance Criteria

1. THE App SHALL include authored content covering: scalability (horizontal vs vertical), load balancers, caching (Redis, CDN, application-level), database sharding and replication, CAP theorem, consistent hashing, message queues, rate limiting, API design, and microservices communication patterns
2. EACH system design Topic SHALL include at least one architecture diagram showing component relationships
3. THE App SHALL include 10 end-to-end system design walkthroughs (e.g., design a URL shortener, design a chat system, design a news feed) with step-by-step breakdowns
4. THE App SHALL include "Test Yourself" questions for each system design subtopic following the format defined in Requirement 4

### Requirement 16: Built-In Content — Docker and Kubernetes

**User Story:** As a developer working with microservices, I want containerization and orchestration fundamentals explained clearly, so that I can understand deployment pipelines and answer DevOps questions.

#### Acceptance Criteria

1. THE App SHALL include authored content covering: Docker (images, containers, Dockerfile, volumes, networking, Docker Compose), Kubernetes (pods, services, deployments, ConfigMaps, Secrets, namespaces, Helm basics), and CI/CD pipeline concepts
2. EACH DevOps Topic SHALL include annotated configuration file examples (Dockerfile, docker-compose.yml, Kubernetes YAML manifests) with syntax highlighting and inline explanations
3. THE App SHALL include "Test Yourself" questions for each DevOps subtopic following the format defined in Requirement 4

### Requirement 17: Built-In Content — Testing Patterns

**User Story:** As a developer, I want to understand testing strategies beyond unit tests, so that I can write comprehensive test suites and discuss testing in interviews.

#### Acceptance Criteria

1. THE App SHALL include authored content covering: unit testing, integration testing, contract testing, end-to-end testing, load/performance testing, test doubles (mocks, stubs, fakes, spies), TDD and BDD methodologies, and testing pyramids
2. EACH testing Topic SHALL include code examples in Java (JUnit/Mockito) demonstrating the testing pattern
3. THE App SHALL include "Test Yourself" questions for each testing subtopic following the format defined in Requirement 4

### Requirement 18: Built-In Content — Behavioral Interview Prep

**User Story:** As a job candidate, I want structured behavioral interview preparation with frameworks and examples, so that I can articulate my experiences clearly under pressure.

#### Acceptance Criteria

1. THE App SHALL include authored content covering: the STAR method (Situation, Task, Action, Result), common behavioral question categories (leadership, conflict, failure, teamwork, initiative), and tips for structuring responses
2. THE App SHALL provide at least 30 common behavioral interview questions organized by category, each with a sample STAR-format answer outline
3. THE App SHALL include a "Practice Mode" where users can select a random behavioral question and type their response, with a visible timer showing elapsed time

### Requirement 19: Built-In Content — Coding Patterns

**User Story:** As a student preparing for coding interviews, I want algorithm patterns organized by technique with examples, so that I can recognize which pattern to apply to new problems.

#### Acceptance Criteria

1. THE App SHALL include authored content covering at minimum: sliding window, two pointers, fast and slow pointers, merge intervals, cyclic sort, in-place reversal of linked list, BFS, DFS, two heaps, subsets, modified binary search, top K elements, K-way merge, dynamic programming (tabulation and memoization), backtracking, and greedy algorithms
2. EACH coding pattern Topic SHALL include: a plain-language explanation of when to use it, a template/skeleton code snippet, at least 3 example problems with step-by-step solutions, and time/space complexity analysis
3. THE App SHALL provide an inline code playground for each example problem where users can attempt the solution before revealing the answer

### Requirement 20: Cheat Sheets and ELI5 Summaries

**User Story:** As a user with ADHD who needs quick refreshers, I want one-page cheat sheets and plain-language summaries for every major topic, so that I can review key concepts in under 2 minutes.

#### Acceptance Criteria

1. THE App SHALL provide a "Cheat Sheet" view for each Topic containing key concepts, syntax, and formulas in a single scrollable page with no more than 500 words
2. THE App SHALL provide an "Explain Like I'm 5" summary at the top of each Topic that explains the core concept in plain language using everyday analogies, limited to 3 sentences
3. WHEN a user navigates to any Topic, THE App SHALL display a toggle to switch between "Full Content", "Cheat Sheet", and "ELI5" views
4. THE App SHALL provide a dedicated "All Cheat Sheets" page accessible from the Navigation_System that lists all Topic cheat sheets for rapid browsing
