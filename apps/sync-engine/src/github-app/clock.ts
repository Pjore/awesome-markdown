/**
 * Seam for the current time, allowing tests to inject a fake clock.
 */
export interface Clock {
  now(): Date;
}

/** The default wall-clock implementation. */
export const defaultClock: Clock = {
  now(): Date {
    return new Date();
  },
};
