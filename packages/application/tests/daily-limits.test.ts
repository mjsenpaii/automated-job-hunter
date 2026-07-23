import { describe, it, expect } from 'vitest';
import { checkDailyLimit, checkKillSwitch } from '../src/daily-limits';

describe('daily-limits', () => {
  it('allows application if under limit', () => {
    const result = checkDailyLimit(2);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(3);
  });

  it('rejects application if at or over limit', () => {
    const result = checkDailyLimit(5);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('respects custom limit', () => {
    const result = checkDailyLimit(8, 10);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it('allows action if kill switch is off', () => {
    const result = checkKillSwitch(false);
    expect(result.allowed).toBe(true);
  });

  it('rejects action if kill switch is on', () => {
    const result = checkKillSwitch(true);
    expect(result.allowed).toBe(false);
  });
});
