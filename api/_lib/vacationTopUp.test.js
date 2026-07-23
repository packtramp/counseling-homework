import { describe, it, expect } from 'vitest';
import { effectiveDailyCap, planDayTopUp } from './vacationTopUp.js';

// Vacation auto-complete top-up (2026-07-23): each vacation day fills the item
// to its FULL daily cap, not just 1 — capped Think Lists no longer come home
// from vacation mathematically behind.
describe('effectiveDailyCap', () => {
  it('uncapped homework needs 1/day', () => {
    expect(effectiveDailyCap({})).toBe(1);
    expect(effectiveDailyCap({ dailyCap: undefined })).toBe(1);
    expect(effectiveDailyCap({ dailyCap: 999 })).toBe(1); // 999 = "no cap" sentinel
  });

  it('Think List caps pass through', () => {
    expect(effectiveDailyCap({ dailyCap: 2 })).toBe(2);
    expect(effectiveDailyCap({ dailyCap: 3 })).toBe(3);
  });

  it('bounds absurd values against bad data', () => {
    expect(effectiveDailyCap({ dailyCap: 100 })).toBe(10);
  });
});

describe('planDayTopUp', () => {
  const base = 1_700_000_000_000;

  it('plain homework, empty day: 1 completion, stamped auto', () => {
    const plan = planDayTopUp({}, 0, base);
    expect(plan.addMs).toEqual([base]);
    expect(plan.stampAuto).toBe(true);
  });

  it('plain homework, already done: nothing added', () => {
    const plan = planDayTopUp({}, 1, base);
    expect(plan.addMs).toEqual([]);
    expect(plan.stampAuto).toBe(false);
  });

  it('Think List (cap 3), empty day: 3 DISTINCT timestamps (arrayUnion dedupes identical ones)', () => {
    const plan = planDayTopUp({ dailyCap: 3 }, 0, base);
    expect(plan.addMs).toEqual([base, base + 1000, base + 2000]);
    expect(new Set(plan.addMs).size).toBe(3);
    expect(plan.stampAuto).toBe(true);
  });

  it('Think List, partial real work (1/3): tops up 2 but does NOT stamp auto — real work keeps streak credit', () => {
    const plan = planDayTopUp({ dailyCap: 3 }, 1, base);
    expect(plan.addMs).toHaveLength(2);
    expect(plan.stampAuto).toBe(false);
  });

  it('Think List, day already full (3/3): nothing added', () => {
    const plan = planDayTopUp({ dailyCap: 3 }, 3, base);
    expect(plan.addMs).toEqual([]);
    expect(plan.stampAuto).toBe(false);
  });

  it('overachieved day (4/3): nothing added, no negative weirdness', () => {
    const plan = planDayTopUp({ dailyCap: 3 }, 4, base);
    expect(plan.addMs).toEqual([]);
    expect(plan.stampAuto).toBe(false);
  });
});
