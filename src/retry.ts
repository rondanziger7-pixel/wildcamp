/** How often a failed tile is requested again, and the first wait in ms (doubling each time). */
export const TILE_RETRIES = 3;
export const TILE_RETRY_MS = 500;

/** The wait before retry number `n` (0-based), or undefined when the tile has been retried enough. */
export function retryDelay(n: number, online: boolean): number | undefined {
  return n < TILE_RETRIES && online ? TILE_RETRY_MS * 2 ** n : undefined;
}
