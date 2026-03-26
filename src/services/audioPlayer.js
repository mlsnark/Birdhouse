/**
 * AudioPlayer — singleton that handles pre-loading a track and firing it with
 * high timing precision at a server-synchronized moment.
 *
 * Scheduling strategy (two-phase):
 *  1. If > 200 ms away  →  setTimeout to re-check 150 ms before target.
 *  2. Inside 200 ms     →  5 ms setInterval polling loop.
 *
 * On a loaded sound the gap between calling playAsync() and first audio sample
 * is typically 5–15 ms.  The two-phase loop keeps the call within ~5 ms of the
 * target local timestamp, so total end-to-end jitter is usually < 20 ms.
 *
 * If you need tighter guarantees you can compensate for the known playback
 * start latency by calling schedulePlayback() with startAt - LATENCY_MS.
 */
import { Audio } from 'expo-av';
import clockSync from './clockSync';

// Empirical playback-start latency compensation (ms).
// Tune this for your target device.  0 = no compensation.
const PLAYBACK_LATENCY_COMP_MS = 0;

class AudioPlayerService {
  constructor() {
    this.sound = null;
    this._coarseTimer = null;
    this._fineInterval = null;
    this._isScheduled = false;
  }

  /** Must be called once before loading any tracks. */
  async init() {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: false,
      allowsRecordingIOS: false,
    });
  }

  /**
   * Load (and buffer) a remote or local track.
   * Returns a status object { isLoaded, durationMillis }.
   */
  async loadTrack(uri, onProgress) {
    await this._unloadCurrent();

    const { sound, status } = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: false, volume: 1.0 },
      onProgress ?? null,
    );

    this.sound = sound;
    return status;
  }

  /**
   * Schedule playback to begin at `startAtServer` (a server-clock ms value).
   * The sound must already be loaded via loadTrack().
   */
  schedulePlayback(startAtServer) {
    if (!this.sound) {
      console.warn('[AudioPlayer] schedulePlayback called with no loaded sound');
      return;
    }
    this._clearTimers();
    this._isScheduled = true;

    const localTarget =
      clockSync.toLocalTime(startAtServer) - PLAYBACK_LATENCY_COMP_MS;

    const attempt = () => {
      const remaining = localTarget - Date.now();

      if (remaining <= 0) {
        this._fire();
        return;
      }

      if (remaining > 200) {
        // Coarse phase: wake up 150 ms before the target.
        this._coarseTimer = setTimeout(attempt, remaining - 150);
      } else {
        // Fine phase: poll every 5 ms until we hit the target.
        this._fineInterval = setInterval(() => {
          if (Date.now() >= localTarget) {
            clearInterval(this._fineInterval);
            this._fineInterval = null;
            this._fire();
          }
        }, 5);
      }
    };

    attempt();
  }

  /**
   * For late joiners: load, seek to offsetMs, and play immediately.
   * The sound must already be loaded via loadTrack().
   */
  async playFromOffset(offsetMs) {
    if (!this.sound) {
      console.warn('[AudioPlayer] playFromOffset called with no loaded sound');
      return;
    }
    this._clearTimers();
    this._isScheduled = false;
    try {
      await this.sound.setPositionAsync(Math.max(0, offsetMs));
      await this.sound.playAsync();
    } catch (err) {
      console.error('[AudioPlayer] playFromOffset error', err);
    }
  }

  async _fire() {
    if (!this.sound || !this._isScheduled) return;
    this._isScheduled = false;
    try {
      // Ensure we're at the very start (in case the sound was scrubbed).
      await this.sound.setPositionAsync(0);
      await this.sound.playAsync();
    } catch (err) {
      console.error('[AudioPlayer] playback error', err);
    }
  }

  async stop() {
    this._isScheduled = false;
    this._clearTimers();
    if (this.sound) {
      try {
        await this.sound.stopAsync();
      } catch (_) {}
    }
  }

  _clearTimers() {
    if (this._coarseTimer) {
      clearTimeout(this._coarseTimer);
      this._coarseTimer = null;
    }
    if (this._fineInterval) {
      clearInterval(this._fineInterval);
      this._fineInterval = null;
    }
  }

  async _unloadCurrent() {
    this._clearTimers();
    this._isScheduled = false;
    if (this.sound) {
      try {
        await this.sound.unloadAsync();
      } catch (_) {}
      this.sound = null;
    }
  }

  async destroy() {
    await this._unloadCurrent();
  }
}

export default new AudioPlayerService();
