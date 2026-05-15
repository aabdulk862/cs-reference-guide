import { describe, it, expect } from 'vitest';
import { calculateReadingTime } from './reading-time';

describe('calculateReadingTime', () => {
  it('returns 1 minute for 0 words', () => {
    expect(calculateReadingTime(0)).toBe(1);
  });

  it('returns 1 minute for negative word count', () => {
    expect(calculateReadingTime(-50)).toBe(1);
  });

  it('returns 1 minute for word counts up to 200', () => {
    expect(calculateReadingTime(1)).toBe(1);
    expect(calculateReadingTime(100)).toBe(1);
    expect(calculateReadingTime(200)).toBe(1);
  });

  it('returns 2 minutes for 201 words', () => {
    expect(calculateReadingTime(201)).toBe(2);
  });

  it('returns 2 minutes for 400 words', () => {
    expect(calculateReadingTime(400)).toBe(2);
  });

  it('rounds up to nearest minute', () => {
    expect(calculateReadingTime(401)).toBe(3);
    expect(calculateReadingTime(599)).toBe(3);
    expect(calculateReadingTime(600)).toBe(3);
    expect(calculateReadingTime(601)).toBe(4);
  });

  it('handles large word counts', () => {
    expect(calculateReadingTime(2000)).toBe(10);
    expect(calculateReadingTime(3000)).toBe(15);
  });
});
