/**
 * ClockSync — keeps a running estimate of the offset between this device's
 * clock and Firebase's server clock.
 *
 * Firebase exposes /.info/serverTimeOffset which is continuously updated.
 * The value N means:  serverTime = Date.now() + N
 *
 * Usage:
 *   await clockSync.init();          // call once at app start
 *   clockSync.now()                  // → current server time (ms)
 *   clockSync.toLocalTime(serverMs)  // → equivalent local Date.now() value
 */
import { ref, onValue } from 'firebase/database';
import { db } from '../config/firebase';

class ClockSyncService {
  constructor() {
    this.serverOffset = 0;
    this.initialized = false;
    this._unsubscribe = null;
  }

  /**
   * Subscribes to Firebase's serverTimeOffset and resolves once the first
   * value has arrived.  Keeps updating in the background thereafter.
   */
  init() {
    if (this.initialized) return Promise.resolve(this.serverOffset);

    return new Promise((resolve, reject) => {
      const offsetRef = ref(db, '/.info/serverTimeOffset');
      let settled = false;

      this._unsubscribe = onValue(
        offsetRef,
        (snapshot) => {
          this.serverOffset = snapshot.val() ?? 0;
          this.initialized = true;
          if (!settled) {
            settled = true;
            resolve(this.serverOffset);
          }
        },
        (err) => {
          if (!settled) {
            settled = true;
            reject(err);
          }
        },
      );
    });
  }

  /** Current estimated server time in milliseconds. */
  now() {
    return Date.now() + this.serverOffset;
  }

  /**
   * Convert a server-side timestamp (ms) to the equivalent local Date.now()
   * value so that setTimeout / setInterval durations are correct.
   */
  toLocalTime(serverMs) {
    return serverMs - this.serverOffset;
  }

  destroy() {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    this.initialized = false;
  }
}

export default new ClockSyncService();
