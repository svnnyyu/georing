import { describe, expect, it } from 'vitest';
import { RING_CAP } from '../../src/config.ts';

// Milestone 1 smoke test: proves Vitest runs and can import from src/.
// Real per-module tests (geo, rings, matching, ...) arrive in milestone 3.
describe('project setup', () => {
  it('loads config', () => {
    expect(RING_CAP).toBe(10);
  });
});
