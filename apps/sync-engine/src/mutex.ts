/**
 * Serialises asynchronous tasks so that commit, push, and pull operations
 * never run concurrently against the same git repository.
 */
export class Mutex {
  private pending: Promise<void> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.pending.then(() => fn());
    this.pending = result.then(
      () => {},
      () => {},
    );
    return result;
  }
}
