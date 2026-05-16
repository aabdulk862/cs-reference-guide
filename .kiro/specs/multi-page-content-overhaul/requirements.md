# Requirements Document

## Introduction

This feature overhauls the CS Reference Guide application to support multi-page topics (directories with subtopic files), restructures existing content into deeper topic hierarchies, adds new topic areas, and removes niche/redundant content. The goal is to transform shallow single-file topics into comprehensive multi-page reference guides while preserving backward compatibility for single-file topics.

## Glossary

- **Content_Pipeline**: The Vite plugin system (`src/plugins/vite-content-plugin.ts`) that scans markdown files, parses them, and generates JSON output and manifests at build time
- **Topic**: A unit of content identified by a slug, rendered on a dedicated page. A Topic is either a Single_File_Topic or a Multi_Page_Topic
- **Single_File_Topic**: A topic represented by a single `.md` file in a category directory (current behavior)
- **Multi_Page_Topic**: A topic represented by a directory containing an `index.md` file and one or more Subtopic files
- **Subtopic**: An individual `.md` file within a Multi_Page_Topic directory, representing a focused sub-area of the parent topic
- **Index_File**: The `index.md` file inside a Multi_Page_Topic directory that provides an overview and links to Subtopics
- **Content_Manifest**: The `content-manifest.json` file generated at build time containing the category/topic tree with metadata
- **Sidebar**: The navigation component (`src/components/navigation/Sidebar.tsx`) that renders the category and topic tree
- **Breadcrumb_Bar**: The navigation component that displays the user's current location as a hierarchical path
- **Topic_Slug**: The URL-friendly identifier for a topic derived from its filename or directory name
- **Subtopic_Slug**: The URL-friendly identifier for a subtopic derived from its filename
- **Category_Slug**: The URL-friendly identifier for a content category

## Requirements

### Requirement 1: Multi-Page Topic Detection

**User Story:** As a content author, I want to organize complex topics into directories with multiple subtopic files, so that I can provide deeper coverage without creating monolithic markdown files.

#### Acceptance Criteria

1. WHEN the Content_Pipeline encounters a directory that is an immediate child of a category directory and that directory contains an `index.md` file, THE Content_Pipeline SHALL treat that directory as a Multi_Page_Topic
2. WHEN the Content_Pipeline encounters a `.md` file directly inside a category directory (not inside a subdirectory), THE Content_Pipeline SHALL treat that file as a Single_File_Topic
3. WHEN the Content_Pipeline processes a Multi_Page_Topic directory, THE Content_Pipeline SHALL parse the `index.md` file as the topic overview and use its H1 heading as the topic title in the content manifest
4. WHEN the Content_Pipeline processes a Multi_Page_Topic directory, THE Content_Pipeline SHALL parse each additional `.md` file located directly in that directory (excluding files in nested subdirectories) as a Subtopic, ordered alphabetically by filename
5. IF a directory that is an immediate child of a category directory does not contain an `index.md` file, THEN THE Content_Pipeline SHALL skip that directory and log a warning message that includes the skipped directory path
6. WHEN the Content_Pipeline processes a Multi_Page_Topic directory containing more than 50 `.md` files (excluding `index.md`), THE Content_Pipeline SHALL log a warning indicating the subtopic count exceeds the recommended maximum

### Requirement 2: Manifest Schema Extension for Subtopics

**User Story:** As a frontend developer, I want the Content_Manifest to include subtopic metadata for multi-page topics, so that the UI can render navigation and load subtopic content.

#### Acceptance Criteria

1. WHEN the Content_Pipeline generates a manifest entry for a Multi_Page_Topic, THE Content_Pipeline SHALL include a `subtopics` array containing each Subtopic's id, slug, title, and wordCount, ordered alphabetically by title
2. WHEN the Content_Pipeline generates a manifest entry for a Single_File_Topic, THE Content_Pipeline SHALL omit the `subtopics` field
3. WHEN the Content_Pipeline generates a manifest entry for a Multi_Page_Topic, THE Content_Pipeline SHALL set the topic-level `wordCount` to the sum of the Index_File wordCount and all Subtopic wordCounts, and set `sectionCount` to the sum of the Index_File sectionCount and all Subtopic sectionCounts
4. WHEN the Content_Pipeline processes a Multi_Page_Topic, THE Content_Pipeline SHALL generate a separate JSON file for each Subtopic at the path `/content/{categorySlug}/{topicSlug}/{subtopicSlug}.json`
5. WHEN the Content_Pipeline processes a Multi_Page_Topic, THE Content_Pipeline SHALL generate the Index_File JSON at the path `/content/{categorySlug}/{topicSlug}.json`
6. IF two Subtopics within the same Multi_Page_Topic produce identical slugs, THEN THE Content_Pipeline SHALL append a numeric suffix starting at `-2` to the duplicate slug and log a warning

### Requirement 3: Routing for Subtopics

**User Story:** As a user, I want each subtopic to have its own URL, so that I can bookmark and share links to specific subtopic pages.

#### Acceptance Criteria

1. THE Application SHALL support the route pattern `/topic/:categorySlug/:topicSlug/:subtopicSlug` for rendering individual Subtopic content
2. THE Application SHALL continue to support the route pattern `/topic/:categorySlug/:topicSlug` for rendering Single_File_Topics and Multi_Page_Topic overviews
3. WHEN a user navigates to `/topic/:categorySlug/:topicSlug` and the topic is a Multi_Page_Topic, THE TopicPage SHALL display the Index_File content followed by a list of links to each Subtopic, where each link displays the Subtopic title and navigates to `/topic/:categorySlug/:topicSlug/:subtopicSlug`
4. WHEN a user navigates to `/topic/:categorySlug/:topicSlug/:subtopicSlug`, THE TopicPage SHALL fetch the JSON file at `/content/{categorySlug}/{topicSlug}/{subtopicSlug}.json` and render the Subtopic content using the same section rendering as Single_File_Topics
5. IF a user navigates to a Subtopic_Slug that does not exist within the specified topic, THEN THE Application SHALL display an inline not-found error message indicating the subtopic was not found, along with a link back to the parent Multi_Page_Topic overview
6. IF a user navigates to a route matching `/topic/:categorySlug/:topicSlug/:subtopicSlug` but the topic is a Single_File_Topic, THEN THE Application SHALL display the not-found error message
7. IF a user navigates to a `:topicSlug` that does not exist within the specified category, THEN THE Application SHALL display the not-found error message regardless of whether a `:subtopicSlug` segment is present

### Requirement 4: Sidebar Navigation for Subtopics

**User Story:** As a user, I want to see subtopics listed under their parent topic in the sidebar, so that I can navigate directly to any subtopic.

#### Acceptance Criteria

1. WHEN the Sidebar renders a Multi_Page_Topic, THE Sidebar SHALL display the topic as an expandable item with a toggle control and nested Subtopic links listed in the order they appear in the Content_Manifest `subtopics` array
2. WHEN a user expands a Multi_Page_Topic in the Sidebar, THE Sidebar SHALL show each Subtopic as a nested link indented under the parent topic, where each link navigates to `/topic/:categorySlug/:topicSlug/:subtopicSlug`
3. WHEN the Sidebar renders a Single_File_Topic, THE Sidebar SHALL display the topic as a direct link without expansion capability
4. WHEN a user navigates to a Subtopic, THE Sidebar SHALL apply an `active` visual indicator (distinguishable style and `aria-current="page"`) to the active Subtopic link and expand both the parent Multi_Page_Topic and the parent category if not already expanded
5. THE Sidebar SHALL persist the expansion state of Multi_Page_Topics across page navigations using localStorage under the `csguide:` namespace prefix
6. IF localStorage is unavailable or the stored expansion state cannot be read, THEN THE Sidebar SHALL default to all Multi_Page_Topics collapsed except any topic containing the currently active Subtopic

### Requirement 5: Breadcrumb Navigation for Subtopics

**User Story:** As a user, I want breadcrumbs to show my full navigation path including the subtopic level, so that I can understand my location and navigate back to parent pages.

#### Acceptance Criteria

1. WHEN a user is viewing a Subtopic page, THE Breadcrumb_Bar SHALL display the path: Home > Category > Topic > Subtopic, where each segment label is the human-readable title from the Content_Manifest (not the raw slug)
2. WHEN a user is viewing a Multi_Page_Topic overview, THE Breadcrumb_Bar SHALL display the path: Home > Category > Topic, where each segment label is the human-readable title from the Content_Manifest (not the raw slug)
3. WHEN a user clicks the Topic breadcrumb segment while viewing a Subtopic, THE Application SHALL navigate to the Multi_Page_Topic overview page at the route `/topic/:categorySlug/:topicSlug`
4. WHEN a user clicks the Category breadcrumb segment, THE Application SHALL navigate to the category listing page at the route `/category/:categorySlug`
5. WHILE the Breadcrumb_Bar is displayed, THE Breadcrumb_Bar SHALL render the last segment as non-clickable text with `aria-current="page"`, and all preceding segments as clickable links
6. WHILE the user is on the home page (root path `/`), THE Breadcrumb_Bar SHALL not be rendered

### Requirement 6: Backward Compatibility for Single-File Topics

**User Story:** As a user, I want existing single-file topics to continue working without changes, so that the content overhaul does not break existing bookmarks or navigation.

#### Acceptance Criteria

1. THE Content_Pipeline SHALL process Single_File_Topics (topics defined by a single markdown file within a category directory) by producing a JSON output file with the same `id`, `slug`, `title`, `sectionCount`, and `sections` structure as produced before the content overhaul changes
2. THE Application SHALL render Single_File_Topics at URL paths matching the pattern `/{category-slug}/{topic-slug}`, preserving the same category-slug and topic-slug values that existed prior to the content overhaul
3. THE Sidebar SHALL display Single_File_Topics as a flat list entry within their parent category group, using the topic title as the label and maintaining alphabetical sort order within the category
4. THE Breadcrumb_Bar SHALL render breadcrumbs for Single_File_Topics as a two-segment path displaying the category name followed by the topic title
5. IF the Content_Pipeline encounters a Single_File_Topic in a category directory that also contains multi-file topic subdirectories, THEN THE Content_Pipeline SHALL process the Single_File_Topic independently using the same parsing logic applied to single-file-only directories
6. THE Content_Pipeline SHALL include Single_File_Topics in the content-manifest.json with a `contentPath` value matching the pattern `/content/{category-slug}/{topic-slug}.json`

### Requirement 7: Content Removal

**User Story:** As a content curator, I want to remove niche and redundant topic files, so that the guide focuses on high-value content.

#### Acceptance Criteria

1. WHEN the content restructuring is applied, THE Repository SHALL no longer contain the following files: `content/backend/mapstruct.md`, `content/backend/resilience4j.md`, `content/backend/apache-maven.md`, `content/backend/gradle.md`, `content/backend/incident-response.md`, `content/interview-prep/grokking-algorithms.md`, `content/interview-prep/cracking-the-coding-interview.md`
2. WHEN a removed topic's URL is accessed, THE Application SHALL render the NotFound page with a link to return to the Dashboard
3. WHEN the content pipeline runs after file removal, THE Application SHALL exclude the removed topics from the content manifest and the search index
4. WHEN the content restructuring is applied, THE Repository SHALL not contain references to the removed files in any remaining topic's Related Topics section

### Requirement 8: Content Splitting into Multi-Page Topics

**User Story:** As a content author, I want to split shallow single-file topics into multi-page directories with focused subtopic files, so that each subtopic can provide 2000-3000 words of in-depth coverage.

#### Acceptance Criteria

1. WHEN a topic is split into a Multi_Page_Topic, THE Index_File (named `index.md`) SHALL contain an overview of the topic (150 to 300 words), a learning path presented as a numbered list of subtopics in recommended reading order, and markdown links to each Subtopic file within the directory
2. WHEN a topic is split into a Multi_Page_Topic, EACH Subtopic file SHALL contain between 2000 and 3000 words of prose content, where prose content excludes code blocks, headings, diagram source, and frontmatter
3. THE following topics SHALL be converted to Multi_Page_Topic directories: java, spring-framework, databases, messaging, react, typescript, javascript, docker, kubernetes, aws, observability, arrays-and-strings, trees-and-graphs, dynamic-programming, sorting-and-searching, system-design, interview-prep
4. EACH Subtopic file SHALL follow the content authoring guidelines defined in the content-authoring steering file
5. WHEN a topic is split into a Multi_Page_Topic, THE Multi_Page_Topic directory SHALL contain a minimum of 3 and a maximum of 8 Subtopic files, each named using kebab-case reflecting the subtopic title
6. WHEN a topic is split into a Multi_Page_Topic, THE Multi_Page_Topic directory SHALL replace the original single-file topic at the same path within its parent category directory (e.g., `content/backend/java.md` becomes `content/backend/java/index.md`)

### Requirement 9: New Topic Addition

**User Story:** As a user, I want new topic areas added to the guide, so that I have comprehensive coverage of modern software engineering topics.

#### Acceptance Criteria

1. THE Repository SHALL contain new content category directories under `content/` for: security, nextjs, html-css, ci-cd, linux, each containing at least one `.md` topic file that follows the mandatory file structure defined in the content-authoring guidelines
2. THE Repository SHALL contain topic files named `hash-tables.md` and `linked-lists.md` in the `content/data-structures-and-algorithms/` directory, each with a minimum of 1500 words of prose and containing all mandatory sections (Quick Reference, When to Use, Code Examples, Common Pitfalls, Real-World Use Cases, Interview Questions, Production Tips, Related Topics)
3. WHEN new topic files are added to a `content/` subdirectory that has a corresponding entry in CATEGORY_MAPPINGS, THE Content_Pipeline SHALL detect and include the new files in the generated content-manifest.json and per-topic JSON output without requiring code changes beyond the category mapping entry
4. THE file previously named `map.md` in `content/data-structures-and-algorithms/` SHALL be renamed to `hash-tables.md` with the H1 title updated to reflect the new filename and content focused specifically on hash table data structures
5. THE file previously named `list.md` in `content/data-structures-and-algorithms/` SHALL be renamed to `linked-lists.md` with the H1 title updated to reflect the new filename and content focused specifically on linked list data structures
6. WHEN new content category directories are added, THE CATEGORY_MAPPINGS array in the content pipeline SHALL include a corresponding entry for each new directory mapping its pattern to a display category name

### Requirement 10: Git Topics Preservation

**User Story:** As a user, I want the git category to remain as single-file topics, so that the concise reference format is preserved for version control content.

#### Acceptance Criteria

1. THE Content_Pipeline SHALL process all `.md` files in the `content/git/` directory as Single_File_Topics, with no file treated as a Multi_Page_Topic
2. THE `content/git/` directory SHALL NOT contain any subdirectories after the content restructuring is applied
3. THE following files SHALL remain present and unmodified in path and filename within `content/git/`: `git-branching.md`, `git-commands.md`, `gitignore.md`, `local-vs-remote.md`, `merge-conflicts.md`, `pull-requests.md`, `what-is-git.md`
4. THE Content_Pipeline SHALL include the `git` category mapping in CATEGORY_MAPPINGS, and THE Content_Manifest SHALL list all git topics under the "Git" category with no `subtopics` field on any entry

### Requirement 11: Build Verification

**User Story:** As a developer, I want the application to build successfully after all content and architecture changes, so that I can deploy the updated guide.

#### Acceptance Criteria

1. WHEN all changes are applied, THE Application SHALL complete the build process (`tsc -b && vite build`) with exit code 0 and zero TypeScript compilation errors
2. WHEN all changes are applied, THE Content_Pipeline SHALL generate a Content_Manifest that is valid JSON, contains at least one topic per mapped category, reports a `totalTopics` count greater than 0, and includes entries for all new and restructured topics with non-empty `title`, `slug`, and `contentPath` fields
3. WHEN all changes are applied, THE Application SHALL pass all existing unit and integration tests (`vitest run`) with zero failures and zero errors
4. WHEN all changes are applied, THE Application SHALL render the Sidebar displaying all categories from the Content_Manifest, each listing its topics, and Multi_Page_Topics SHALL be expandable via click to reveal their child sub-topics
5. WHEN all changes are applied, THE Application SHALL produce zero errors from the linter (`eslint .`) across all modified and new source files
