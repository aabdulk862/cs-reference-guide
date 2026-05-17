/**
 * Unit tests for interview Q/A parsing in markdown-parser.ts
 *
 * Validates: Requirements 6.1, 6.2, 6.8
 */

import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../markdown-parser';

describe('Interview Q/A Parsing', () => {
  describe('Pattern 1: Blank-line separated Q/A with A: prefix', () => {
    it('should parse a single Q/A pair into an interview node', () => {
      const md = `# Test Topic

## Interview Questions

**Q: What is X?**

A: X is a thing that does Y.
`;
      const result = parseMarkdown(md, 'test/topic.md', 'test');
      const interviewSection = result.sections.find(s => s.heading === 'Interview Questions');
      expect(interviewSection).toBeDefined();
      expect(interviewSection!.content).toHaveLength(1);
      expect(interviewSection!.content[0]).toEqual({
        type: 'interview',
        question: 'What is X?',
        answer: 'X is a thing that does Y.',
      });
    });

    it('should parse multiple Q/A pairs', () => {
      const md = `# Test Topic

## Interview Questions

**Q: What is X?**

A: X is a thing.

**Q: What is Y?**

A: Y is another thing.
`;
      const result = parseMarkdown(md, 'test/topic.md', 'test');
      const interviewSection = result.sections.find(s => s.heading === 'Interview Questions');
      expect(interviewSection).toBeDefined();
      expect(interviewSection!.content).toHaveLength(2);
      expect(interviewSection!.content[0]).toEqual({
        type: 'interview',
        question: 'What is X?',
        answer: 'X is a thing.',
      });
      expect(interviewSection!.content[1]).toEqual({
        type: 'interview',
        question: 'What is Y?',
        answer: 'Y is another thing.',
      });
    });

    it('should parse numbered Q patterns (Q1:, Q2:)', () => {
      const md = `# Test Topic

## Interview Questions

**Q1: First question?**

A: First answer.

**Q2: Second question?**

A: Second answer.
`;
      const result = parseMarkdown(md, 'test/topic.md', 'test');
      const interviewSection = result.sections.find(s => s.heading === 'Interview Questions');
      expect(interviewSection).toBeDefined();
      expect(interviewSection!.content).toHaveLength(2);
      expect(interviewSection!.content[0]).toEqual({
        type: 'interview',
        question: 'First question?',
        answer: 'First answer.',
      });
      expect(interviewSection!.content[1]).toEqual({
        type: 'interview',
        question: 'Second question?',
        answer: 'Second answer.',
      });
    });
  });

  describe('Pattern 2: No blank line between Q and A (inline format)', () => {
    it('should parse Q/A pairs without blank lines', () => {
      const md = `# Test Topic

## Interview Questions

**Q1: How does X work?**
X works by doing Y. It processes data efficiently.
**Q2: What is Z?**
Z is a data structure used for fast lookups.
`;
      const result = parseMarkdown(md, 'test/topic.md', 'test');
      const interviewSection = result.sections.find(s => s.heading === 'Interview Questions');
      expect(interviewSection).toBeDefined();
      expect(interviewSection!.content).toHaveLength(2);
      expect(interviewSection!.content[0]).toEqual({
        type: 'interview',
        question: 'How does X work?',
        answer: 'X works by doing Y. It processes data efficiently.',
      });
      expect(interviewSection!.content[1]).toEqual({
        type: 'interview',
        question: 'What is Z?',
        answer: 'Z is a data structure used for fast lookups.',
      });
    });
  });

  describe('Non-matching content', () => {
    it('should emit standard paragraph nodes for non-Q/A content in Interview Questions section', () => {
      const md = `# Test Topic

## Interview Questions

Here is some introductory text about interview questions.

**Q: What is X?**

A: X is a thing.
`;
      const result = parseMarkdown(md, 'test/topic.md', 'test');
      const interviewSection = result.sections.find(s => s.heading === 'Interview Questions');
      expect(interviewSection).toBeDefined();
      expect(interviewSection!.content).toHaveLength(2);
      expect(interviewSection!.content[0]).toEqual({
        type: 'paragraph',
        text: 'Here is some introductory text about interview questions.',
      });
      expect(interviewSection!.content[1]).toEqual({
        type: 'interview',
        question: 'What is X?',
        answer: 'X is a thing.',
      });
    });

    it('should NOT apply interview parsing outside Interview Questions section', () => {
      const md = `# Test Topic

## Some Other Section

**Q: What is X?**

A: X is a thing.
`;
      const result = parseMarkdown(md, 'test/topic.md', 'test');
      const section = result.sections.find(s => s.heading === 'Some Other Section');
      expect(section).toBeDefined();
      // Should be standard paragraphs, not interview nodes
      expect(section!.content.every(n => n.type === 'paragraph')).toBe(true);
    });
  });

  describe('Real-world content compatibility', () => {
    it('should handle Q with inline code in question text', () => {
      const md = `# Test Topic

## Interview Questions

**Q: What is the difference between \`==\` and \`.equals()\` in Java?**

A: The \`==\` operator compares reference identity. The \`.equals()\` method compares logical equality.
`;
      const result = parseMarkdown(md, 'test/topic.md', 'test');
      const interviewSection = result.sections.find(s => s.heading === 'Interview Questions');
      expect(interviewSection).toBeDefined();
      expect(interviewSection!.content).toHaveLength(1);
      expect(interviewSection!.content[0].type).toBe('interview');
      const node = interviewSection!.content[0] as { type: 'interview'; question: string; answer: string };
      expect(node.question).toContain('==');
      expect(node.answer).toContain('==');
    });
  });
});
