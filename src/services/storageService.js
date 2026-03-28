/**
 * storageService — upload audio and image files to Firebase Storage.
 */
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../config/firebase';

async function uploadFile(localUri, storagePath, onProgress) {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const storageRef = ref(storage, storagePath);

  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, blob);
    task.on(
      'state_changed',
      (snapshot) => onProgress?.(snapshot.bytesTransferred / snapshot.totalBytes),
      reject,
      async () => {
        try {
          resolve(await getDownloadURL(task.snapshot.ref));
        } catch (err) {
          reject(err);
        }
      },
    );
  });
}

/**
 * Upload an audio file. Returns a public download URL.
 * @param {string} localUri
 * @param {string} filename
 * @param {function} onProgress  - called with 0–1
 */
export function uploadTrack(localUri, filename, onProgress) {
  return uploadFile(localUri, `tracks/${Date.now()}_${filename}`, onProgress);
}

/**
 * Upload an experience poster image. Returns a public download URL.
 * @param {string} localUri
 * @param {string} experienceId
 * @param {function} onProgress  - called with 0–1
 */
/**
 * Upload a caption JSON file. Returns a public download URL.
 * @param {string} jsonText  - stringified JSON
 * @param {string} experienceId
 * @param {string} roleId
 */
export async function uploadCaptions(jsonText, experienceId, roleId) {
  const blob = new Blob([jsonText], { type: 'application/json' });
  const storageRef = ref(storage, `captions/${experienceId}_${roleId}_${Date.now()}.json`);
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, blob);
    task.on('state_changed', null, reject, async () => {
      try { resolve(await getDownloadURL(task.snapshot.ref)); }
      catch (err) { reject(err); }
    });
  });
}
