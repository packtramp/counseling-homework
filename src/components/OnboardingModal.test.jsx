import { describe, it, expect } from 'vitest';
import { getNextOnboardingMessage, MESSAGE_COUNT } from './OnboardingModal';

describe('getNextOnboardingMessage', () => {
  const now = new Date('2026-02-17T14:00:00');

  it('returns first message when step is undefined (existing user)', () => {
    const result = getNextOnboardingMessage(undefined, null, now);
    expect(result).not.toBeNull();
    expect(result.index).toBe(0);
    expect(result.message.id).toBe('create-goals');
  });

  it('returns first message when step is null', () => {
    const result = getNextOnboardingMessage(null, null, now);
    expect(result).not.toBeNull();
    expect(result.index).toBe(0);
  });

  it('returns first message when step is 0', () => {
    const result = getNextOnboardingMessage(0, null, now);
    expect(result).not.toBeNull();
    expect(result.index).toBe(0);
    expect(result.message.id).toBe('create-goals');
  });

  it('returns second message when step is 1', () => {
    const result = getNextOnboardingMessage(1, null, now);
    expect(result).not.toBeNull();
    expect(result.index).toBe(1);
    expect(result.message.id).toBe('check-off');
  });

  it('returns null when all messages have been seen', () => {
    const result = getNextOnboardingMessage(MESSAGE_COUNT, null, now);
    expect(result).toBeNull();
  });

  it('returns null when step exceeds message count', () => {
    const result = getNextOnboardingMessage(MESSAGE_COUNT + 5, null, now);
    expect(result).toBeNull();
  });

  it('returns null if already dismissed a message today', () => {
    const lastSeen = new Date('2026-02-17T08:00:00'); // same day as now
    const result = getNextOnboardingMessage(3, lastSeen, now);
    expect(result).toBeNull();
  });

  it('returns message if last dismissal was yesterday', () => {
    const lastSeen = new Date('2026-02-16T22:00:00'); // yesterday
    const result = getNextOnboardingMessage(3, lastSeen, now);
    expect(result).not.toBeNull();
    expect(result.index).toBe(3);
  });

  it('handles Firestore-style toDate() timestamps', () => {
    const lastSeen = { toDate: () => new Date('2026-02-17T08:00:00') }; // today
    const result = getNextOnboardingMessage(2, lastSeen, now);
    expect(result).toBeNull();
  });

  it('handles Firestore-style toDate() from yesterday', () => {
    const lastSeen = { toDate: () => new Date('2026-02-16T22:00:00') }; // yesterday
    const result = getNextOnboardingMessage(2, lastSeen, now);
    expect(result).not.toBeNull();
    expect(result.index).toBe(2);
  });

  it('returns correct message for each step in sequence', () => {
    for (let i = 0; i < MESSAGE_COUNT; i++) {
      const result = getNextOnboardingMessage(i, null, now);
      expect(result).not.toBeNull();
      expect(result.index).toBe(i);
      expect(result.message).toHaveProperty('id');
      expect(result.message).toHaveProperty('title');
      expect(result.message).toHaveProperty('body');
    }
  });

  it('has exactly 8 messages', () => {
    expect(MESSAGE_COUNT).toBe(8);
  });
});
