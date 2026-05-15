import { describe, it, expect } from 'vitest';
import { parseMarkdown } from './markdown-parser';

describe('parseMarkdown', () => {
  describe('basic structure', () => {
    it('extracts H1 as the topic title', () => {
      const md = '# My Topic\n\nSome content here.';
      const result = parseMarkdown(md, 'test.md', 'general');

      expect(result.title).toBe('My Topic');
      expect(result.slug).toBe('my-topic');
      expect(result.id).toBe('my-topic');
      expect(result.category).toBe('general');
    });

    it('uses filename as title when no H1 is present', () => {
      const md = '## Section One\n\nContent.';
      const result = parseMarkdown(md, 'path/to/my-file.md', 'general');

      expect(result.title).toBe('my-file');
    });

    it('maps H2 headings to top-level ContentSections', () => {
      const md = `# Topic
## Section One
Paragraph one.
## Section Two
Paragraph two.
`;
      const result = parseMarkdown(md, 'test.md', 'dsa');

      expect(result.sections).toHaveLength(2);
      expect(result.sections[0].heading).toBe('Section One');
      expect(result.sections[0].level).toBe(2);
      expect(result.sections[1].heading).toBe('Section Two');
      expect(result.sections[1].level).toBe(2);
    });

    it('maps H3+ headings to subsections within their parent H2', () => {
      const md = `# Topic
## Section One
Content.
### Subsection A
Sub content A.
### Subsection B
Sub content B.
#### Deep Subsection
Deep content.
`;
      const result = parseMarkdown(md, 'test.md', 'dsa');

      expect(result.sections).toHaveLength(1);
      const section = result.sections[0];
      expect(section.subsections).toHaveLength(2);
      expect(section.subsections[0].heading).toBe('Subsection A');
      expect(section.subsections[0].level).toBe(3);
      expect(section.subsections[1].heading).toBe('Subsection B');
      expect(section.subsections[1].level).toBe(3);
      // H4 nested under second H3
      expect(section.subsections[1].subsections).toHaveLength(1);
      expect(section.subsections[1].subsections[0].heading).toBe('Deep Subsection');
      expect(section.subsections[1].subsections[0].level).toBe(4);
    });
  });

  describe('code blocks', () => {
    it('extracts code blocks with language annotation', () => {
      const md = `# Topic
## Code Section
\`\`\`python
print("hello")
\`\`\`
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      expect(result.codeBlocks).toHaveLength(1);
      expect(result.codeBlocks[0].language).toBe('python');
      expect(result.codeBlocks[0].code).toBe('print("hello")');
      expect(result.codeBlocks[0].runnable).toBe(false);
    });

    it('marks javascript code blocks as runnable', () => {
      const md = `# Topic
## Code Section
\`\`\`javascript
console.log("hi");
\`\`\`
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      expect(result.codeBlocks[0].language).toBe('javascript');
      expect(result.codeBlocks[0].runnable).toBe(true);
    });

    it('marks js code blocks as runnable', () => {
      const md = `# Topic
## Code Section
\`\`\`js
const x = 1;
\`\`\`
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      expect(result.codeBlocks[0].language).toBe('js');
      expect(result.codeBlocks[0].runnable).toBe(true);
    });

    it('marks non-js languages as not runnable', () => {
      const md = `# Topic
## Code Section
\`\`\`java
System.out.println("hi");
\`\`\`
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      expect(result.codeBlocks[0].runnable).toBe(false);
    });
  });

  describe('images', () => {
    it('extracts image references with original paths', () => {
      const md = `# Topic
## Images
![Alt text](./images/diagram.png)
`;
      const result = parseMarkdown(md, 'notes/topic.md', 'general');

      expect(result.images).toHaveLength(1);
      expect(result.images[0].alt).toBe('Alt text');
      expect(result.images[0].originalPath).toBe('./images/diagram.png');
      expect(result.images[0].src).toBe('./images/diagram.png');
    });

    it('handles multiple images', () => {
      const md = `# Topic
## Images
![First](img1.png)

![Second](img2.png)
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      expect(result.images).toHaveLength(2);
      expect(result.images[0].alt).toBe('First');
      expect(result.images[1].alt).toBe('Second');
    });
  });

  describe('math expressions', () => {
    it('parses block math ($$...$$) into math nodes with block display', () => {
      const md = `# Topic
## Math
$$
E = mc^2
$$
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      expect(result.mathExpressions.some(
        (m) => m.expression === 'E = mc^2' && m.display === 'block'
      )).toBe(true);
    });

    it('parses inline math ($...$) into math nodes with inline display', () => {
      const md = `# Topic
## Math
The formula $x^2 + y^2 = z^2$ is important.
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      expect(result.mathExpressions.some(
        (m) => m.expression === 'x^2 + y^2 = z^2' && m.display === 'inline'
      )).toBe(true);
    });
  });

  describe('content nodes', () => {
    it('parses paragraphs', () => {
      const md = `# Topic
## Section
This is a paragraph.

This is another paragraph.
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      const content = result.sections[0].content;
      expect(content.filter((n) => n.type === 'paragraph')).toHaveLength(2);
      expect(content[0]).toEqual({ type: 'paragraph', text: 'This is a paragraph.' });
    });

    it('parses ordered lists', () => {
      const md = `# Topic
## Section
1. First item
2. Second item
3. Third item
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      const listNode = result.sections[0].content.find((n) => n.type === 'list');
      expect(listNode).toBeDefined();
      if (listNode && listNode.type === 'list') {
        expect(listNode.ordered).toBe(true);
        expect(listNode.items).toHaveLength(3);
        expect(listNode.items[0]).toBe('First item');
      }
    });

    it('parses unordered lists', () => {
      const md = `# Topic
## Section
- Apple
- Banana
- Cherry
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      const listNode = result.sections[0].content.find((n) => n.type === 'list');
      expect(listNode).toBeDefined();
      if (listNode && listNode.type === 'list') {
        expect(listNode.ordered).toBe(false);
        expect(listNode.items).toHaveLength(3);
      }
    });

    it('parses tables (GFM)', () => {
      const md = `# Topic
## Section
| Name | Age |
|------|-----|
| Alice | 30 |
| Bob | 25 |
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      const tableNode = result.sections[0].content.find((n) => n.type === 'table');
      expect(tableNode).toBeDefined();
      if (tableNode && tableNode.type === 'table') {
        expect(tableNode.headers).toEqual(['Name', 'Age']);
        expect(tableNode.rows).toHaveLength(2);
        expect(tableNode.rows[0]).toEqual(['Alice', '30']);
      }
    });

    it('parses blockquotes', () => {
      const md = `# Topic
## Section
> This is a quote.
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      const bqNode = result.sections[0].content.find((n) => n.type === 'blockquote');
      expect(bqNode).toBeDefined();
      if (bqNode && bqNode.type === 'blockquote') {
        expect(bqNode.text).toBe('This is a quote.');
      }
    });
  });

  describe('word count', () => {
    it('calculates wordCount per section from paragraphs', () => {
      const md = `# Topic
## Section
One two three four five.
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      expect(result.sections[0].wordCount).toBe(5);
    });

    it('includes list items in word count', () => {
      const md = `# Topic
## Section
- one two
- three four five
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      // "one two" = 2, "three four five" = 3 → total 5
      expect(result.sections[0].wordCount).toBe(5);
    });

    it('includes blockquote text in word count', () => {
      const md = `# Topic
## Section
> hello world foo bar
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      expect(result.sections[0].wordCount).toBe(4);
    });

    it('includes table cells in word count', () => {
      const md = `# Topic
## Section
| Col A | Col B |
|-------|-------|
| one | two three |
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      // Headers: "Col A" (2) + "Col B" (2) = 4
      // Row: "one" (1) + "two three" (2) = 3
      // Total = 7
      expect(result.sections[0].wordCount).toBe(7);
    });

    it('reports total wordCount in metadata', () => {
      const md = `# Topic
## Section One
one two three
## Section Two
four five
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      expect(result.metadata.wordCount).toBe(5); // 3 + 2
    });
  });

  describe('metadata', () => {
    it('sets source to parsed', () => {
      const md = '# Topic\n## Section\nContent.';
      const result = parseMarkdown(md, 'path/file.md', 'general');

      expect(result.metadata.source).toBe('parsed');
    });

    it('stores the file path', () => {
      const md = '# Topic\n## Section\nContent.';
      const result = parseMarkdown(md, 'path/file.md', 'general');

      expect(result.metadata.filePath).toBe('path/file.md');
    });

    it('counts sections correctly', () => {
      const md = `# Topic
## Section One
Content.
### Sub A
Sub content.
## Section Two
Content.
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      // 2 top-level + 1 subsection = 3
      expect(result.metadata.sectionCount).toBe(3);
    });
  });

  describe('admonitions', () => {
    it('parses [!NOTE] blockquote as admonition node', () => {
      const md = `# Topic
## Section
> [!NOTE]
> This is a note about something important.
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      const admonitionNode = result.sections[0].content.find((n) => n.type === 'admonition');
      expect(admonitionNode).toBeDefined();
      if (admonitionNode && admonitionNode.type === 'admonition') {
        expect(admonitionNode.admonitionType).toBe('note');
        expect(admonitionNode.content).toBe('This is a note about something important.');
      }
    });

    it('parses [!WARNING] blockquote as admonition node', () => {
      const md = `# Topic
## Section
> [!WARNING]
> Be careful with this operation.
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      const admonitionNode = result.sections[0].content.find((n) => n.type === 'admonition');
      expect(admonitionNode).toBeDefined();
      if (admonitionNode && admonitionNode.type === 'admonition') {
        expect(admonitionNode.admonitionType).toBe('warning');
        expect(admonitionNode.content).toBe('Be careful with this operation.');
      }
    });

    it('parses [!TIP] blockquote as admonition node', () => {
      const md = `# Topic
## Section
> [!TIP]
> Use this shortcut to save time.
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      const admonitionNode = result.sections[0].content.find((n) => n.type === 'admonition');
      expect(admonitionNode).toBeDefined();
      if (admonitionNode && admonitionNode.type === 'admonition') {
        expect(admonitionNode.admonitionType).toBe('tip');
        expect(admonitionNode.content).toBe('Use this shortcut to save time.');
      }
    });

    it('produces standard blockquote for unrecognized admonition types', () => {
      const md = `# Topic
## Section
> [!DANGER]
> This is dangerous.
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      const blockquoteNode = result.sections[0].content.find((n) => n.type === 'blockquote');
      expect(blockquoteNode).toBeDefined();
      const admonitionNode = result.sections[0].content.find((n) => n.type === 'admonition');
      expect(admonitionNode).toBeUndefined();
    });

    it('produces standard blockquote for regular blockquotes without admonition syntax', () => {
      const md = `# Topic
## Section
> Just a regular quote.
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      const blockquoteNode = result.sections[0].content.find((n) => n.type === 'blockquote');
      expect(blockquoteNode).toBeDefined();
      if (blockquoteNode && blockquoteNode.type === 'blockquote') {
        expect(blockquoteNode.text).toBe('Just a regular quote.');
      }
      const admonitionNode = result.sections[0].content.find((n) => n.type === 'admonition');
      expect(admonitionNode).toBeUndefined();
    });

    it('handles admonition with content on the same line as the type marker', () => {
      const md = `# Topic
## Section
> [!NOTE] This is inline content.
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      const admonitionNode = result.sections[0].content.find((n) => n.type === 'admonition');
      expect(admonitionNode).toBeDefined();
      if (admonitionNode && admonitionNode.type === 'admonition') {
        expect(admonitionNode.admonitionType).toBe('note');
        expect(admonitionNode.content).toBe('This is inline content.');
      }
    });

    it('includes admonition content in word count', () => {
      const md = `# Topic
## Section
> [!TIP]
> one two three four five
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      expect(result.sections[0].wordCount).toBe(5);
    });
  });

  describe('mermaid blocks', () => {
    it('parses fenced code block with language mermaid as mermaid node', () => {
      const md = `# Topic
## Section
\`\`\`mermaid
graph TD
    A --> B
    B --> C
\`\`\`
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      const mermaidNode = result.sections[0].content.find((n) => n.type === 'mermaid');
      expect(mermaidNode).toBeDefined();
      if (mermaidNode && mermaidNode.type === 'mermaid') {
        expect(mermaidNode.source).toBe('graph TD\n    A --> B\n    B --> C');
      }
    });

    it('does not emit mermaid blocks as code nodes', () => {
      const md = `# Topic
## Section
\`\`\`mermaid
graph LR
    A --> B
\`\`\`
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      const codeNode = result.sections[0].content.find((n) => n.type === 'code');
      expect(codeNode).toBeUndefined();
    });

    it('does not include mermaid blocks in codeBlocks collection', () => {
      const md = `# Topic
## Section
\`\`\`mermaid
sequenceDiagram
    Alice->>Bob: Hello
\`\`\`
\`\`\`javascript
console.log("hi");
\`\`\`
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      // Only the javascript block should be in codeBlocks
      expect(result.codeBlocks).toHaveLength(1);
      expect(result.codeBlocks[0].language).toBe('javascript');
    });

    it('handles large mermaid blocks without truncation', () => {
      // Generate a mermaid block close to 50,000 characters
      const lines = ['graph TD'];
      for (let i = 0; i < 2000; i++) {
        lines.push(`    Node${i} --> Node${i + 1}`);
      }
      const mermaidSource = lines.join('\n');
      expect(mermaidSource.length).toBeGreaterThan(30000);

      const md = `# Topic
## Section
\`\`\`mermaid
${mermaidSource}
\`\`\`
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      const mermaidNode = result.sections[0].content.find((n) => n.type === 'mermaid');
      expect(mermaidNode).toBeDefined();
      if (mermaidNode && mermaidNode.type === 'mermaid') {
        expect(mermaidNode.source).toBe(mermaidSource);
        expect(mermaidNode.source.length).toBe(mermaidSource.length);
      }
    });

    it('handles mermaid language identifier case-insensitively', () => {
      const md = `# Topic
## Section
\`\`\`Mermaid
graph TD
    A --> B
\`\`\`
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      const mermaidNode = result.sections[0].content.find((n) => n.type === 'mermaid');
      expect(mermaidNode).toBeDefined();
      if (mermaidNode && mermaidNode.type === 'mermaid') {
        expect(mermaidNode.source).toBe('graph TD\n    A --> B');
      }
    });

    it('still parses non-mermaid code blocks normally', () => {
      const md = `# Topic
## Section
\`\`\`python
print("hello")
\`\`\`
\`\`\`mermaid
graph TD
    A --> B
\`\`\`
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      const codeNode = result.sections[0].content.find((n) => n.type === 'code');
      expect(codeNode).toBeDefined();
      if (codeNode && codeNode.type === 'code') {
        expect(codeNode.language).toBe('python');
        expect(codeNode.code).toBe('print("hello")');
      }

      const mermaidNode = result.sections[0].content.find((n) => n.type === 'mermaid');
      expect(mermaidNode).toBeDefined();
      if (mermaidNode && mermaidNode.type === 'mermaid') {
        expect(mermaidNode.source).toBe('graph TD\n    A --> B');
      }
    });
  });

  describe('unparseable content', () => {
    it('handles content gracefully without crashing', () => {
      // Even with unusual content, the parser should not throw
      const md = `# Topic
## Section
Normal paragraph.

\`\`\`
code without language
\`\`\`
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      expect(result.title).toBe('Topic');
      expect(result.sections).toHaveLength(1);
      // Code block without language should still parse
      const codeNode = result.sections[0].content.find((n) => n.type === 'code');
      expect(codeNode).toBeDefined();
      if (codeNode && codeNode.type === 'code') {
        expect(codeNode.language).toBe('');
        expect(codeNode.code).toBe('code without language');
      }
    });
  });

  describe('task lists', () => {
    it('parses task list items with checked and unchecked states', () => {
      const md = `# Topic
## Section
- [ ] unchecked task
- [x] checked task
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      const taskListNode = result.sections[0].content.find((n) => n.type === 'task-list');
      expect(taskListNode).toBeDefined();
      if (taskListNode && taskListNode.type === 'task-list') {
        expect(taskListNode.items).toHaveLength(2);
        expect(taskListNode.items[0]).toEqual({ checked: false, text: 'unchecked task' });
        expect(taskListNode.items[1]).toEqual({ checked: true, text: 'checked task' });
      }
    });

    it('does not produce task-list node for regular lists', () => {
      const md = `# Topic
## Section
- regular item one
- regular item two
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      const taskListNode = result.sections[0].content.find((n) => n.type === 'task-list');
      expect(taskListNode).toBeUndefined();

      const listNode = result.sections[0].content.find((n) => n.type === 'list');
      expect(listNode).toBeDefined();
    });

    it('handles mixed task list with all items having checked state', () => {
      const md = `# Topic
## Section
- [x] done item
- [ ] pending item
- [x] another done item
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      const taskListNode = result.sections[0].content.find((n) => n.type === 'task-list');
      expect(taskListNode).toBeDefined();
      if (taskListNode && taskListNode.type === 'task-list') {
        expect(taskListNode.items).toHaveLength(3);
        expect(taskListNode.items[0].checked).toBe(true);
        expect(taskListNode.items[1].checked).toBe(false);
        expect(taskListNode.items[2].checked).toBe(true);
      }
    });

    it('preserves task list item text content', () => {
      const md = `# Topic
## Section
- [ ] Install dependencies
- [x] Configure the build system
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      const taskListNode = result.sections[0].content.find((n) => n.type === 'task-list');
      expect(taskListNode).toBeDefined();
      if (taskListNode && taskListNode.type === 'task-list') {
        expect(taskListNode.items[0].text).toBe('Install dependencies');
        expect(taskListNode.items[1].text).toBe('Configure the build system');
      }
    });
  });

  describe('footnotes', () => {
    it('parses footnote references as footnote-ref nodes', () => {
      const md = `# Topic
## Section
Here is some text with a footnote[^1].

[^1]: This is the footnote content.
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      const footnoteRefNode = result.sections[0].content.find((n) => n.type === 'footnote-ref');
      expect(footnoteRefNode).toBeDefined();
      if (footnoteRefNode && footnoteRefNode.type === 'footnote-ref') {
        expect(footnoteRefNode.identifier).toBe('1');
        expect(footnoteRefNode.index).toBe(1);
      }
    });

    it('parses footnote definitions as footnote-def nodes', () => {
      const md = `# Topic
## Section
Here is some text with a footnote[^1].

[^1]: This is the footnote content.
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      const footnoteDefNode = result.sections[0].content.find((n) => n.type === 'footnote-def');
      expect(footnoteDefNode).toBeDefined();
      if (footnoteDefNode && footnoteDefNode.type === 'footnote-def') {
        expect(footnoteDefNode.identifier).toBe('1');
        expect(footnoteDefNode.content).toBe('This is the footnote content.');
      }
    });

    it('assigns sequential indices to multiple footnote references', () => {
      const md = `# Topic
## Section
First reference[^1] and second reference[^2].

[^1]: First footnote.
[^2]: Second footnote.
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      const footnoteRefs = result.sections[0].content.filter((n) => n.type === 'footnote-ref');
      expect(footnoteRefs).toHaveLength(2);
      if (footnoteRefs[0].type === 'footnote-ref' && footnoteRefs[1].type === 'footnote-ref') {
        expect(footnoteRefs[0].identifier).toBe('1');
        expect(footnoteRefs[0].index).toBe(1);
        expect(footnoteRefs[1].identifier).toBe('2');
        expect(footnoteRefs[1].index).toBe(2);
      }
    });

    it('handles footnotes with text identifiers', () => {
      const md = `# Topic
## Section
Some text with a named footnote[^note1].

[^note1]: A named footnote definition.
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      const footnoteRefNode = result.sections[0].content.find((n) => n.type === 'footnote-ref');
      expect(footnoteRefNode).toBeDefined();
      if (footnoteRefNode && footnoteRefNode.type === 'footnote-ref') {
        expect(footnoteRefNode.identifier).toBe('note1');
      }

      const footnoteDefNode = result.sections[0].content.find((n) => n.type === 'footnote-def');
      expect(footnoteDefNode).toBeDefined();
      if (footnoteDefNode && footnoteDefNode.type === 'footnote-def') {
        expect(footnoteDefNode.identifier).toBe('note1');
        expect(footnoteDefNode.content).toBe('A named footnote definition.');
      }
    });

    it('includes footnote reference marker in paragraph text', () => {
      const md = `# Topic
## Section
Text with footnote[^1] in it.

[^1]: Definition.
`;
      const result = parseMarkdown(md, 'test.md', 'general');

      const paragraphNode = result.sections[0].content.find((n) => n.type === 'paragraph');
      expect(paragraphNode).toBeDefined();
      if (paragraphNode && paragraphNode.type === 'paragraph') {
        expect(paragraphNode.text).toContain('[^1]');
      }
    });
  });
});
