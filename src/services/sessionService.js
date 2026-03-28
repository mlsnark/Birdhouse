/**
 * sessionService — Firebase Realtime Database helpers for session management.
 *
 * Database schema:
 *
 *   sessions/{roomCode}/
 *     experienceId  : string | null
 *     title         : string | null  (copied from experience)
 *     hostId        : string
 *     status        : "lobby" | "starting" | "ended"
 *     createdAt     : number (server ms)
 *     startAt       : number | null
 *     roles/
 *       {roleId}/
 *         name      : string
 *         trackUrl  : string
 *         takenBy   : string | null
 *     participants/
 *       {deviceId}/
 *         name      : string
 *         trackUrl  : string
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

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRoomCode() {
  let code = '';
  for (let i = 0; i < 6; i++) code += CHARS[Math.floor(Math.random() * CHARS.length)];
  return code;
}

// ─── Session lifecycle ────────────────────────────────────────────────────────

/**
 * Create a new session. Optionally linked to an experience.
 * @param {Array}  roles          - [{ id, name, trackUrl }]
 * @param {string} experienceId   - optional Firebase experience key
 * @param {string} experienceTitle- optional title copied from experience
 */
export async function createSession(
  roomCode, hostId, hostName, hostTrackUrl = '',
  roles = [], experienceId = null, experienceTitle = null, hostRoleId = null,
) {
  const sessionRef = ref(db, `sessions/${roomCode}`);
  const snap = await get(sessionRef);
  if (snap.exists()) throw new Error('Room code already in use. Try again.');

  const rolesObj = {};
  roles.forEach((r) => {
    rolesObj[r.id] = {
      name: r.name,
      trackUrl: r.trackUrl,
      captionUrl: r.captionUrl ?? null,
      maxParticipants: r.maxParticipants ?? 1,
    };
  });

  const sessionData = {
    hostId,
    status: 'lobby',
    createdAt: clockSync.now(),
    startAt: null,
    experienceId: experienceId || null,
    title: experienceTitle || null,
    participants: {
      [hostId]: {
        name: hostName,
        trackUrl: hostTrackUrl,
        ready: false,
        isHost: true,
        roleId: hostRoleId,
      },
    },
  };

  if (roles.length > 0) sessionData.roles = rolesObj;

  await set(sessionRef, sessionData);
  onDisconnect(sessionRef).remove();
  return roomCode;
}

/** Fetch a session without joining (used to preview roles/experience). */
export async function fetchSession(roomCode) {
  const snap = await get(ref(db, `sessions/${roomCode}`));
  if (!snap.exists()) throw new Error('Session not found. Check the room code.');
  return snap.val();
}

/** Join without roles. */
export async function joinSession(roomCode, deviceId, name) {
  const snap = await get(ref(db, `sessions/${roomCode}`));
  if (!snap.exists()) throw new Error('Session not found. Check the room code.');
  const session = snap.val();
  if (session.status !== 'lobby') throw new Error('This session has already started.');

  const participantRef = ref(db, `sessions/${roomCode}/participants/${deviceId}`);
  await set(participantRef, { name, trackUrl: '', ready: false, isHost: false, roleId: null });
  onDisconnect(participantRef).remove();
  return session;
}

/** Join and select a role. Multiple participants may share the same role. */
export async function joinSessionWithRole(roomCode, deviceId, name, roleId) {
  const snap = await get(ref(db, `sessions/${roomCode}`));
  if (!snap.exists()) throw new Error('Session not found.');
  const session = snap.val();
  if (session.status !== 'lobby') throw new Error('This session has already started.');

  const role = session.roles?.[roleId];
  if (!role) throw new Error('Role not found.');

  // Enforce capacity if maxParticipants is set
  const max = role.maxParticipants ?? 1;
  if (max !== null && max > 0) {
    const taken = Object.values(session.participants ?? {}).filter((p) => p.roleId === roleId).length;
    if (taken >= max) throw new Error(`This role is full (${max} participant${max === 1 ? '' : 's'} max).`);
  }

  await update(ref(db, `sessions/${roomCode}`), {
    [`participants/${deviceId}/name`]: name,
    [`participants/${deviceId}/trackUrl`]: role.trackUrl,
    [`participants/${deviceId}/ready`]: false,
    [`participants/${deviceId}/isHost`]: false,
    [`participants/${deviceId}/roleId`]: roleId,
  });

  onDisconnect(ref(db, `sessions/${roomCode}/participants/${deviceId}`)).remove();
  return session;
}

/** Host reassigns a participant's role (and updates their track URL). */
export async function setParticipantRole(roomCode, deviceId, roleId) {
  const snap = await get(ref(db, `sessions/${roomCode}/roles/${roleId}`));
  const role = snap.val();
  await update(ref(db, `sessions/${roomCode}/participants/${deviceId}`), {
    roleId,
    trackUrl: role?.trackUrl ?? '',
    ready: false,
  });
}

/**
 * Join a session that is already in progress (status === 'starting').
 * Picks up the track URL from the chosen role; does NOT claim takenBy
 * (rules block that once session has started).
 * Returns { session, trackUrl }.
 */
export async function joinLate(roomCode, deviceId, name, roleId) {
  const snap = await get(ref(db, `sessions/${roomCode}`));
  if (!snap.exists()) throw new Error('Session not found. Check the room code.');
  const session = snap.val();
  if (session.status !== 'starting') throw new Error('Session is not currently in progress.');

  const trackUrl = roleId ? (session.roles?.[roleId]?.trackUrl ?? '') : '';

  const participantRef = ref(db, `sessions/${roomCode}/participants/${deviceId}`);
  await set(participantRef, {
    name, trackUrl, ready: false, isHost: false, roleId: roleId ?? null,
  });
  onDisconnect(participantRef).remove();
  return { session, trackUrl };
}

// ─── Host actions ─────────────────────────────────────────────────────────────

export function setParticipantTrack(roomCode, deviceId, trackUrl) {
  return update(ref(db, `sessions/${roomCode}/participants/${deviceId}`), {
    trackUrl,
    ready: false,
  });
}

export async function initiateStart(roomCode, countdownSeconds = 5) {
  const startAt = clockSync.now() + countdownSeconds * 1000;
  await update(ref(db, `sessions/${roomCode}`), { status: 'starting', startAt });
  return startAt;
}

/** Pause playback for all participants. Records server time of pause. */
export async function pauseSession(roomCode) {
  const pausedAt = clockSync.now();
  await update(ref(db, `sessions/${roomCode}`), { status: 'paused', pausedAt });
}

/**
 * Resume playback from where it was paused.
 * Adjusts startAt so each device can compute the correct seek offset.
 */
export async function resumeSession(roomCode) {
  const snap = await get(ref(db, `sessions/${roomCode}`));
  const session = snap.val();
  const pausedPosition = session.pausedAt - session.startAt;
  const newStartAt = clockSync.now() - pausedPosition;
  await update(ref(db, `sessions/${roomCode}`), {
    status: 'starting',
    startAt: newStartAt,
    pausedAt: null,
  });
}

export function endSession(roomCode) {
  return remove(ref(db, `sessions/${roomCode}`));
}

// ─── Participant actions ──────────────────────────────────────────────────────

export function markReady(roomCode, deviceId, isReady) {
  return update(ref(db, `sessions/${roomCode}/participants/${deviceId}`), { ready: isReady });
}

// ─── Listeners ────────────────────────────────────────────────────────────────

export function subscribeSession(roomCode, callback) {
  return onValue(ref(db, `sessions/${roomCode}`), (snap) => {
    callback(snap.exists() ? snap.val() : null);
  });
}
