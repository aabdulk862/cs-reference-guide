import { describe, it, expect } from 'vitest';
import { shouldExclude } from './exclusion-filter';

describe('shouldExclude', () => {
  describe('excludes .tex files', () => {
    it('excludes a .tex file at root', () => {
      expect(shouldExclude('resume.tex')).toBe(true);
    });

    it('excludes a .tex file in a subdirectory', () => {
      expect(shouldExclude('docs/notes.tex')).toBe(true);
    });

    it('excludes a .tex file with absolute path', () => {
      expect(shouldExclude('/Users/user/project/file.tex')).toBe(true);
    });
  });

  describe('excludes .css files', () => {
    it('excludes a .css file at root', () => {
      expect(shouldExclude('styles.css')).toBe(true);
    });

    it('excludes a .css file in a subdirectory', () => {
      expect(shouldExclude('src/index.css')).toBe(true);
    });

    it('excludes guide-system.css', () => {
      expect(shouldExclude('public/guide-system.css')).toBe(true);
    });
  });

  describe('excludes files in public/ directory', () => {
    it('excludes a file directly in public/', () => {
      expect(shouldExclude('public/index.html')).toBe(true);
    });

    it('excludes a file nested in public/', () => {
      expect(shouldExclude('public/assets/logo.png')).toBe(true);
    });

    it('excludes a markdown file in public/', () => {
      expect(shouldExclude('public/readme.md')).toBe(true);
    });
  });

  describe('excludes files containing "Scope Document" in name', () => {
    it('excludes a file named with Scope Document', () => {
      expect(shouldExclude('Java Scope Document.md')).toBe(true);
    });

    it('excludes a Scope Document file in a subdirectory', () => {
      expect(shouldExclude('Infosys/Spring Scope Document.md')).toBe(true);
    });

    it('excludes a file with Scope Document anywhere in the name', () => {
      expect(shouldExclude('content/backend/My Scope Document Notes.md')).toBe(true);
    });

    it('does not exclude a file without Scope Document in name', () => {
      expect(shouldExclude('content/backend/java.md')).toBe(false);
    });
  });

  describe('excludes files in dot-prefixed directories', () => {
    it('excludes a file in .git/', () => {
      expect(shouldExclude('.git/config')).toBe(true);
    });

    it('excludes a file in .kiro/', () => {
      expect(shouldExclude('.kiro/specs/design.md')).toBe(true);
    });

    it('excludes a file in a nested dot directory', () => {
      expect(shouldExclude('src/.hidden/secret.md')).toBe(true);
    });

    it('excludes a file in .vscode/', () => {
      expect(shouldExclude('.vscode/settings.json')).toBe(true);
    });
  });

  describe('does NOT exclude valid content files', () => {
    it('does not exclude a .md file', () => {
      expect(shouldExclude('notes.md')).toBe(false);
    });

    it('does not exclude a .md file in a subdirectory', () => {
      expect(shouldExclude('Data Structures/Array.md')).toBe(false);
    });

    it('does not exclude a .png file', () => {
      expect(shouldExclude('images/diagram.png')).toBe(false);
    });

    it('does not exclude a .ts file', () => {
      expect(shouldExclude('src/utils/helper.ts')).toBe(false);
    });

    it('does not exclude a file with .tex in the name but different extension', () => {
      expect(shouldExclude('latex-notes.md')).toBe(false);
    });

    it('does not exclude a file whose name starts with a dot (not a directory)', () => {
      expect(shouldExclude('.gitignore')).toBe(false);
    });
  });

  describe('handles path normalization', () => {
    it('handles Windows-style backslashes', () => {
      expect(shouldExclude('src\\.hidden\\file.md')).toBe(true);
    });

    it('handles Windows-style path with .tex', () => {
      expect(shouldExclude('docs\\resume.tex')).toBe(true);
    });

    it('handles mixed separators', () => {
      expect(shouldExclude('public\\assets/file.md')).toBe(true);
    });
  });
});
