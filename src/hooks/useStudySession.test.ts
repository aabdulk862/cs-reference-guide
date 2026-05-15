/**
 * Unit tests for the useStudySession hook.
 * Tests cover: formatElapsedTime utility function.
 *
 * Requirements: 5.4, 5.8
 */
import { describe, it, expect } from 'vitest';
import { formatElapsedTime } from './useStudySession';

describe('formatElapsedTime', () => {
  it('should format 0 seconds as 00:00:00', () => {
    expect(formatElapsedTime(0)).toBe('00:00:00');
  });

  it('should format seconds only', () => {
    expect(formatElapsedTime(45)).toBe('00:00:45');
  });

  it('should format minutes and seconds', () => {
    expect(formatElapsedTime(125)).toBe('00:02:05');
  });

  it('should format hours, minutes, and seconds', () => {
    expect(formatElapsedTime(3661)).toBe('01:01:01');
  });

  it('should handle large values', () => {
    // 99 hours, 59 minutes, 59 seconds = 359999 seconds
    expect(formatElapsedTime(359999)).toBe('99:59:59');
  });

  it('should handle exact hour boundaries', () => {
    expect(formatElapsedTime(3600)).toBe('01:00:00');
    expect(formatElapsedTime(7200)).toBe('02:00:00');
  });

  it('should handle exact minute boundaries', () => {
    expect(formatElapsedTime(60)).toBe('00:01:00');
    expect(formatElapsedTime(120)).toBe('00:02:00');
  });

  it('should pad single-digit values with leading zeros', () => {
    expect(formatElapsedTime(1)).toBe('00:00:01');
    expect(formatElapsedTime(61)).toBe('00:01:01');
    expect(formatElapsedTime(3601)).toBe('01:00:01');
  });

  it('should handle 24 hours worth of seconds', () => {
    expect(formatElapsedTime(86400)).toBe('24:00:00');
  });
});
