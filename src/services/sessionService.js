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
 *     roles/                          (optional)
 *       {roleId}/
 *         name      : string          (e.g. "Soprano")
 *         trackUrl  : string
 *         takenBy   : string | null   (deviceId of participant who claimed it)
 *     participants/
 *       {deviceId}/
 *         name      : string
 *         trackUrl  : string          (set by host or auto-assigned via role)
 *         ready     : boolean
 *         isHost    : boolean
 *         roleId    : string | null
 */
import {
  ref,
  set,
  get,
  update,
  remove,
  onValue,
  onDisconnect,
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
 * @param {string[]} roles  Array of { id, name, trackUrl } role objects.
 */
export async function createSession(roomCode, hostId, hostName, hostTrackUrl = '', roles = []) {
  const sessionRef = ref(db, `sessions/${roomCode}`);

  const snap = await get(sessionRef);
  if (snap.exists()) throw new Error('Room code already in use. Try again.');

  const rolesObj = {};
  roles.forEach((r) => {
    rolesObj[r.id] = { name: r.name, trackUrl: r.trackUrl, takenBy: null };
  });

  const sessionData = {
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
        roleId: null,
      },
    },
  };

  if (roles.length > 0) {
    sessionData.roles = rolesObj;
  }

  await set(sessionRef, sessionData);
  onDisconnect(sessionRef).remove();

  return roomCode;
}

/**
 * Fetch a session without joining it (used by JoinScreen to preview roles).
 */
export async function fetchSession(roomCode) {
  const snap = await get(ref(db, `sessions/${roomCode}`));
  if (!snap.exists()) throw new Error('Session not found. Check the room code.');
  return snap.val();
}

/**
 * Join an existing session as a participant (no roles).
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
    roleId: null,
  });

  onDisconnect(participantRef).remove();
  return session;
}

/**
 * Join and simultaneously claim a role.
 * Validates the role is still unclaimed before writing.
 */
export async function joinSessionWithRole(roomCode, deviceId, name, roleId) {
  const snap = await get(ref(db, `sessions/${roomCode}`));
  if (!snap.exists()) throw new Error('Session not found.');
  const session = snap.val();
  if (session.status !== 'lobby') throw new Error('This session has already started.');

  const role = session.roles?.[roleId];
  if (!role) throw new Error('Role not found.');
  if (role.takenBy && role.takenBy !== deviceId) {
    throw new Error('That role was just taken. Please pick another.');
  }

  await update(ref(db, `sessions/${roomCode}`), {
    [`participants/${deviceId}/name`]: name,
    [`participants/${deviceId}/trackUrl`]: role.trackUrl,
    [`participants/${deviceId}/ready`]: false,
    [`participants/${deviceId}/isHost`]: false,
    [`participants/${deviceId}/roleId`]: roleId,
    [`roles/${roleId}/takenBy`]: deviceId,
  });

  onDisconnect(ref(db, `sessions/${roomCode}/participants/${deviceId}`)).remove();
  onDisconnect(ref(db, `sessions/${roomCode}/roles/${roleId}/takenBy`)).set(null);

  return session;
}

// ─── Host actions ─────────────────────────────────────────────────────────────

/** Host sets/changes the track URL for any participant. */
export function setParticipantTrack(roomCode, deviceId, trackUrl) {
  return update(ref(db, `sessions/${roomCode}/participants/${deviceId}`), {
    trackUrl,
    ready: false,
  });
}

/**
 * Host initiates the countdown.
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
