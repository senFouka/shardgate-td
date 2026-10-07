/**
 * Payloads for every cross-system event. Systems never import each other;
 * they talk through this map so they stay decoupled.
 *
 * Gameplay events are added with the systems that fire them (Milestone 1).
 */
export interface GameEventMap {
  /** lifetime progress, bests or settings changed */
  'profile:changed': Record<string, never>;
  'audio:muted': { muted: boolean };
  /** the graphics settings in effect changed (by the player or by auto-detection) */
  'graphics:changed': { preset: string; reason: 'player' | 'auto' };
}

type Handler<T> = (payload: T) => void;
type AnyHandler = (payload: unknown) => void;

interface Subscription {
  key: string;
  fn: AnyHandler;
  context: unknown;
  once: boolean;
}

/**
 * Small typed event bus. Ported from Element Warden, where it wrapped
 * Phaser's emitter; the API is unchanged (on / once / off / emit /
 * offContext), only the emitter underneath is our own.
 */
export class TypedEventBus<M extends object> {
  private subs: Subscription[] = [];

  on<K extends keyof M & string>(key: K, fn: Handler<M[K]>, context?: unknown): this {
    this.subs.push({ key, fn: fn as AnyHandler, context, once: false });
    return this;
  }

  once<K extends keyof M & string>(key: K, fn: Handler<M[K]>, context?: unknown): this {
    this.subs.push({ key, fn: fn as AnyHandler, context, once: true });
    return this;
  }

  off<K extends keyof M & string>(key: K, fn: Handler<M[K]>, context?: unknown): this {
    this.subs = this.subs.filter((s) => !(s.key === key && s.fn === fn && s.context === context));
    return this;
  }

  emit<K extends keyof M & string>(key: K, payload: M[K]): void {
    // copy first: handlers may subscribe or unsubscribe while we iterate
    const targets = this.subs.filter((s) => s.key === key);
    if (targets.some((s) => s.once)) this.subs = this.subs.filter((s) => !(s.key === key && s.once));
    for (const s of targets) s.fn.call(s.context, payload);
  }

  /** Drop every listener bound to a context. Call when a view is torn down. */
  offContext(context: unknown): void {
    this.subs = this.subs.filter((s) => s.context !== context);
  }
}

export const gameEvents = new TypedEventBus<GameEventMap>();
