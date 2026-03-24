/**
 * sessionService — Firebase Realtime Database helpers for session management.
 *
 * Database schema:
 *
 *   sessions/{roomCode}/
 *     hostId        : string
 *     status        : "lobby" | "starting" | "ended"
 *     createdAt     : number (server ms)
 *     startAt       : number | null  (server ms, set by host when starting)
 *     participants/
 *       {deviceId}/
 *         name      : string
 *         trackUrl  : string   (set/edited by host)
 *         ready     : boolean  (true once participant has loaded their track)
 *         isHost    : boolean
 */
import {
  ref,
  set,
  get,
  update,
  remove,
  onValue,
  onDisconnect,
  serverTimestamp,
} from 'firebase/database';
import { db } from '../config/firebase';
import clockSync from './clockSync';

// ─── Room code ────────────────────────────────────────────────────────────────

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1

export function generateRoomCode() {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}

// ─── Session lifecycle ────────────────────────────────────────────────────────

/**
 * Create a new session.  The host is also registered as a participant.
 */
export async function createSession(roomCode, hostId, hostName, hostTrackUrl = '') {
  const sessionRef = ref(db, `sessions/${roomCode}`);

  // Abort if room code is already taken.
  const snap = await get(sessionRef);
  if (snap.exists()) throw new Error('Room code already in use. Try again.');

  await set(sessionRef, {
    hostId,
    status: 'lobby',
    createdAt: clockSync.now(),
    startAt: null,
    participants: {
      [hostId]: {
        name: hostName,
        trackUrl: hostTrackUrl,
        ready: false,
        isHost: true,
      },
    },
  });

  // Auto-remove session when host disconnects.
  onDisconnect(sessionRef).remove();

  return roomCode;
}

/**
 * Join an existing session as a participant.
 * Returns the participant's initial data snapshot.
 */
export async function joinSession(roomCode, deviceId, name) {
  const sessionRef = ref(db, `sessions/${roomCode}`);
  const snap = await get(sessionRef);

  if (!snap.exists()) throw new Error('Session not found. Check the room code.');

  const session = snap.val();
  if (session.status !== 'lobby') throw new Error('This session has already started.');

  const participantRef = ref(db, `sessions/${roomCode}/participants/${deviceId}`);
  await set(participantRef, {
    name,
    trackUrl: '',
    ready: false,
    isHost: false,
  });

  // Remove participant on disconnect.
  onDisconnect(participantRef).remove();

  return session;
}

// ─── Host actions ─────────────────────────────────────────────────────────────

/** Host sets/changes the track URL for any participant. */
export function setParticipantTrack(roomCode, deviceId, trackUrl) {
  return update(ref(db, `sessions/${roomCode}/participants/${deviceId}`), {
    trackUrl,
    ready: false, // reset ready when track changes
  });
}

/**
 * Host initiates the countdown.
 * Writes startAt = serverNow + countdownSeconds * 1000.
 */
export async function initiateStart(roomCode, countdownSeconds = 5) {
  const startAt = clockSync.now() + countdownSeconds * 1000;
  await update(ref(db, `sessions/${roomCode}`), {
    status: 'starting',
    startAt,
  });
  return startAt;
}

/** Host ends (or resets) the session. */
export function endSession(roomCode) {
  return remove(ref(db, `sessions/${roomCode}`));
}

// ─── Participant actions ──────────────────────────────────────────────────────

/** Participant marks their track as loaded and ready. */
export function markReady(roomCode, deviceId, isReady) {
  return update(ref(db, `sessions/${roomCode}/participants/${deviceId}`), {
    ready: isReady,
  });
}

// ─── Real-time listeners ──────────────────────────────────────────────────────

/** Subscribe to all session changes. Returns an unsubscribe function. */
export function subscribeSession(roomCode, callback) {
  const sessionRef = ref(db, `sessions/${roomCode}`);
  return onValue(sessionRef, (snap) => {
    callback(snap.exists() ? snap.val() : null);
  });
}
