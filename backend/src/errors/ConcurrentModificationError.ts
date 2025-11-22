/**
 * Custom error thrown when optimistic locking detects a concurrent modification
 * This happens when an event's version has changed between when it was read and when an update was attempted
 */
export class ConcurrentModificationError extends Error {
  constructor(
    public resourceType: string,
    public resourceId: string,
    public expectedVersion: number,
    public actualVersion: number,
    public currentState?: any
  ) {
    super(
      `${resourceType} ${resourceId} was modified by another user. ` +
      `Expected version ${expectedVersion}, but found ${actualVersion}`
    );
    this.name = 'ConcurrentModificationError';

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ConcurrentModificationError);
    }
  }
}
