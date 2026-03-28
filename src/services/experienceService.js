/**
 * experienceService — Firebase CRUD for reusable experiences.
 *
 * Database schema:
 *   experiences/{experienceId}/
 *     title             : string
 *     description       : string
 *     createdBy         : string  (display name)
 *     createdByDeviceId : string  (for edit/delete ownership)
 *     createdAt         : number
 *     imageUrl          : string | null
 *     roles/
 *       {roleId}/
 *         name          : string
 *         trackUrl      : string
 */
import { ref, set, get, update, remove, onValue, push } from 'firebase/database';
import { db } from '../config/firebase';

function rolesToObj(roles = []) {
  const obj = {};
  roles.forEach((r) => {
    obj[r.id] = {
      name: r.name,
      trackUrl: r.trackUrl,
      captionUrl: r.captionUrl ?? null,
      maxParticipants: r.maxParticipants ?? 1,
    };
  });
  return Object.keys(obj).length > 0 ? obj : null;
}

/** Publish a new experience. Returns the new experience ID. */
export async function createExperience({ title, description, createdBy, createdByDeviceId, imageUrl, roles }) {
  const newRef = push(ref(db, 'experiences'));
  await set(newRef, {
    title: title.trim(),
    description: description.trim(),
    createdBy: createdBy.trim(),
    createdByDeviceId,
    createdAt: Date.now(),
    imageUrl: imageUrl || null,
    roles: rolesToObj(roles),
  });
  return newRef.key;
}

/** Subscribe to the full list of experiences, sorted newest first. */
export function subscribeExperiences(callback) {
  return onValue(ref(db, 'experiences'), (snap) => {
    if (!snap.exists()) { callback([]); return; }
    const list = Object.entries(snap.val())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.createdAt - a.createdAt);
    callback(list);
  });
}

/** Fetch a single experience by ID. */
export async function getExperience(id) {
  const snap = await get(ref(db, `experiences/${id}`));
  if (!snap.exists()) throw new Error('Experience not found.');
  return { id, ...snap.val() };
}

/** Subscribe to a single experience by ID. Returns unsubscribe fn. */
export function subscribeExperience(id, callback) {
  return onValue(ref(db, `experiences/${id}`), (snap) => {
    if (!snap.exists()) { callback(null); return; }
    callback({ id, ...snap.val() });
  });
}

/** Update an existing experience (creator only). */
export async function updateExperience(id, { title, description, imageUrl, roles }) {
  await update(ref(db, `experiences/${id}`), {
    title: title.trim(),
    description: description.trim(),
    imageUrl: imageUrl || null,
    roles: rolesToObj(roles),
  });
}

/** Delete an experience. */
export function deleteExperience(id) {
  return remove(ref(db, `experiences/${id}`));
}
