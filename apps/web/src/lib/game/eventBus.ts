// A minimal typed publish/subscribe channel. The session publishes each
// batch of engine events once; presentation layers (harvest flights, the
// action feed) subscribe instead of hooking into the session's internals.

export class EventBus<T> {
  private readonly listeners = new Set<(message: T) => void>();

  /** Subscribe; returns the function that unsubscribes. */
  on(listener: (message: T) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(message: T): void {
    for (const listener of [...this.listeners]) listener(message);
  }
}
