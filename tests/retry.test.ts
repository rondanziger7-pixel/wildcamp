import { describe, expect, it } from 'vitest';
import { TILE_RETRIES, TILE_RETRY_MS, retryDelay } from '../src/retry';

describe('tile retry schedule', () => {
  it('waits 0.5 s, 1 s, 2 s, then gives up', () => {
    expect([0, 1, 2].map((n) => retryDelay(n, true))).toEqual([TILE_RETRY_MS, 2 * TILE_RETRY_MS, 4 * TILE_RETRY_MS]);
    expect(retryDelay(TILE_RETRIES, true)).toBeUndefined();
    expect(retryDelay(7, true)).toBeUndefined();
  });
  it('does not retry while the device is offline', () => {
    expect(retryDelay(0, false)).toBeUndefined();
  });
});
