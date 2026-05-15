/**
 * Unit tests for the useKeyboardShortcuts hook.
 * Tests the isInputFocused guard and shortcut dispatch behavior.
 *
 * Requirements: 20.3
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isInputFocused } from './useKeyboardShortcuts';

describe('isInputFocused', () => {
  beforeEach(() => {
    // setup
  });

  afterEach(() => {
    // Clean up any elements added to the DOM
    document.body.innerHTML = '';
  });

  it('should return false when no element has focus', () => {
    // When body is focused (default), no input is focused
    expect(isInputFocused()).toBe(false);
  });

  it('should return true when an <input> element has focus', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    expect(isInputFocused()).toBe(true);
  });

  it('should return true when a <textarea> element has focus', () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();
    expect(isInputFocused()).toBe(true);
  });

  it('should return true when a [contenteditable] element has focus', () => {
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    document.body.appendChild(div);
    div.focus();
    expect(isInputFocused()).toBe(true);
  });

  it('should return false when contenteditable is "false"', () => {
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'false');
    div.setAttribute('tabindex', '0');
    document.body.appendChild(div);
    div.focus();
    expect(isInputFocused()).toBe(false);
  });

  it('should return false when a regular <div> has focus', () => {
    const div = document.createElement('div');
    div.setAttribute('tabindex', '0');
    document.body.appendChild(div);
    div.focus();
    expect(isInputFocused()).toBe(false);
  });

  it('should return false when a <button> has focus', () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();
    expect(isInputFocused()).toBe(false);
  });

  it('should return true for contenteditable with empty string value', () => {
    // contenteditable="" is equivalent to contenteditable="true"
    const div = document.createElement('div');
    div.setAttribute('contenteditable', '');
    document.body.appendChild(div);
    div.focus();
    expect(isInputFocused()).toBe(true);
  });
});
