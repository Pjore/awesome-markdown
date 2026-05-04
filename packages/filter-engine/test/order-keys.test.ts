import { describe, it, expect } from 'vitest';
import { keyBetween, compareOrderKeys } from '../src/order-keys.js';

// ---------------------------------------------------------------------------
// compareOrderKeys
// ---------------------------------------------------------------------------

describe('compareOrderKeys', () => {
  it('returns 0 for equal keys', () => {
    expect(compareOrderKeys('P', 'P')).toBe(0);
    expect(compareOrderKeys('a0G', 'a0G')).toBe(0);
  });

  it('returns negative when a < b', () => {
    expect(compareOrderKeys('A', 'B')).toBeLessThan(0);
    expect(compareOrderKeys('0', '9')).toBeLessThan(0);
    expect(compareOrderKeys('P', 'PP')).toBeLessThan(0);
  });

  it('returns positive when a > b', () => {
    expect(compareOrderKeys('B', 'A')).toBeGreaterThan(0);
    expect(compareOrderKeys('z', 'a')).toBeGreaterThan(0);
  });

  it('is consistent with JS string sort', () => {
    const keys = ['Z', 'A', 'P', 'B', 'a'];
    const jsSorted = [...keys].sort();
    const customSorted = [...keys].sort(compareOrderKeys);
    expect(customSorted).toEqual(jsSorted);
  });
});

// ---------------------------------------------------------------------------
// keyBetween — edge cases (no bounds)
// ---------------------------------------------------------------------------

describe('keyBetween — no bounds', () => {
  it('returns a non-empty key when both args are undefined', () => {
    const k = keyBetween();
    expect(typeof k).toBe('string');
    expect(k.length).toBeGreaterThan(0);
  });

  it('the default key is valid (does not end in "0")', () => {
    const k = keyBetween();
    expect(k.endsWith('0')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// keyBetween — single bound
// ---------------------------------------------------------------------------

describe('keyBetween — single bound', () => {
  it('keyBetween(lo, undefined): result > lo', () => {
    const lo = keyBetween(); // e.g. 'P'
    const next = keyBetween(lo, undefined);
    expect(compareOrderKeys(next, lo)).toBeGreaterThan(0);
  });

  it('keyBetween(undefined, hi): result < hi', () => {
    const hi = 'Z';
    const prev = keyBetween(undefined, hi);
    expect(compareOrderKeys(prev, hi)).toBeLessThan(0);
  });

  it('keyBetween(undefined, hi) for hi with large first-char gap', () => {
    const hi = 'z';
    const prev = keyBetween(undefined, hi);
    expect(compareOrderKeys(prev, hi)).toBeLessThan(0);
    expect(prev.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// keyBetween — both bounds
// ---------------------------------------------------------------------------

describe('keyBetween — both bounds', () => {
  it('result is strictly between lo and hi', () => {
    const lo = 'A';
    const hi = 'C';
    const mid = keyBetween(lo, hi);
    expect(compareOrderKeys(mid, lo)).toBeGreaterThan(0);
    expect(compareOrderKeys(mid, hi)).toBeLessThan(0);
  });

  it('adjacent single chars: inserts by extending', () => {
    const lo = 'A';
    const hi = 'B';
    const mid = keyBetween(lo, hi);
    expect(compareOrderKeys(mid, lo)).toBeGreaterThan(0);
    expect(compareOrderKeys(mid, hi)).toBeLessThan(0);
    expect(mid.startsWith('A')).toBe(true); // must extend lo
  });

  it('result does not end in "0"', () => {
    const cases: [string | undefined, string | undefined][] = [
      ['A', 'C'],
      ['A', 'B'],
      [undefined, 'Z'],
      ['P', undefined],
      ['A', 'Z'],
    ];
    for (const [lo, hi] of cases) {
      const k = keyBetween(lo, hi);
      expect(k.endsWith('0')).toBe(false);
    }
  });

  it('throws when lo >= hi', () => {
    expect(() => keyBetween('B', 'A')).toThrow();
    expect(() => keyBetween('Z', 'Z')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// keyBetween — repeated insertions
// ---------------------------------------------------------------------------

describe('keyBetween — repeated insertions before a key', () => {
  it('always produces a strictly-between key after 20 insertions before the same neighbor', () => {
    const hi = 'Z';
    let prev = keyBetween(undefined, hi);
    for (let n = 0; n < 20; n++) {
      const next = keyBetween(undefined, prev);
      expect(compareOrderKeys(next, prev)).toBeLessThan(0);
      expect(compareOrderKeys(next, hi)).toBeLessThan(0);
      expect(next.endsWith('0')).toBe(false);
      prev = next;
    }
  });

  it('always produces a strictly-between key after 20 insertions after the same neighbor', () => {
    const lo = 'A';
    let prev = keyBetween(lo, undefined);
    for (let n = 0; n < 20; n++) {
      const next = keyBetween(prev, undefined);
      expect(compareOrderKeys(next, prev)).toBeGreaterThan(0);
      expect(next.endsWith('0')).toBe(false);
      prev = next;
    }
  });

  it('repeated insertions between the same two neighbors always succeed', () => {
    let lo = 'A';
    let hi = 'B';
    for (let n = 0; n < 15; n++) {
      const mid = keyBetween(lo, hi);
      expect(compareOrderKeys(mid, lo)).toBeGreaterThan(0);
      expect(compareOrderKeys(mid, hi)).toBeLessThan(0);
      expect(mid.endsWith('0')).toBe(false);
      hi = mid; // next insertion: between lo and this new mid
    }
  });
});

// ---------------------------------------------------------------------------
// compareOrderKeys — consistent with keyBetween
// ---------------------------------------------------------------------------

describe('compareOrderKeys — total order consistency', () => {
  it('keys generated by keyBetween are in sorted order when compared', () => {
    // Generate a sequence of keys by always appending after the previous
    const keys: string[] = [];
    let prev: string | undefined;
    for (let i = 0; i < 10; i++) {
      const k = keyBetween(prev, undefined);
      keys.push(k);
      prev = k;
    }
    // They should already be sorted
    const sorted = [...keys].sort(compareOrderKeys);
    expect(sorted).toEqual(keys);
  });

  it('idempotence: re-sorting an already-sorted list is a no-op', () => {
    const lo = 'A';
    const hi = 'z';
    const keys: string[] = [];
    // Generate 7 keys spread across [A, z]
    let cur = lo;
    for (let i = 0; i < 7; i++) {
      const k = keyBetween(cur, hi);
      keys.push(k);
      cur = k;
    }
    const sorted1 = [...keys].sort(compareOrderKeys);
    const sorted2 = [...sorted1].sort(compareOrderKeys);
    expect(sorted2).toEqual(sorted1);
  });

  it('transitivity: if a<b and b<c then a<c', () => {
    const a = keyBetween(undefined, 'P');
    const b = keyBetween(a, 'P');
    const c = 'P';
    expect(compareOrderKeys(a, b)).toBeLessThan(0);
    expect(compareOrderKeys(b, c)).toBeLessThan(0);
    expect(compareOrderKeys(a, c)).toBeLessThan(0);
  });

  it('property-style: seeded deterministic scenario', () => {
    // Generate keys by subdividing the [A, Z] interval in a zigzag pattern
    // to stress-test the ordering invariant.
    const anchors = ['A', 'M', 'Z'];
    const generated: string[] = [];
    for (let i = 0; i < anchors.length - 1; i++) {
      const lo = anchors[i] as string;
      const hi = anchors[i + 1] as string;
      const m1 = keyBetween(lo, hi);
      const m2 = keyBetween(lo, m1);
      const m3 = keyBetween(m1, hi);
      generated.push(m2, m1, m3);
    }
    const withAnchors = [...anchors, ...generated].sort(compareOrderKeys);
    // Verify each pair is in order
    for (let i = 0; i < withAnchors.length - 1; i++) {
      const curr = withAnchors[i]!;
      const next = withAnchors[i + 1]!;
      expect(compareOrderKeys(curr, next)).toBeLessThanOrEqual(0);
    }
  });
});
