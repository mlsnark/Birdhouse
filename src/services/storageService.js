/**
 * storageService — upload audio files to Firebase Storage.
 * Returns a public download URL usable as a track URL.
 */
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../config/firebase';

/**
 * Upload a local file URI to Firebase Storage.
 * @param {string} localUri   - URI from expo-document-picker
 * @param {string} filename   - Original filename (used in storage path)
 * @param {function} onProgress - Called with 0–1 progress value
 * @returns {Promise<string>} Firebase Storage download URL
 */
export async function uploadTrack(localUri, filename, onProgress) {
  const response = await fetch(localUri);
  const blob = await response.blob();

  const storageRef = ref(storage, `tracks/${Date.now()}_${filename}`);

  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, blob);

    task.on(
      'state_changed',
      (snapshot) => {
        onProgress?.(snapshot.bytesTransferred / snapshot.totalBytes);
      },
      reject,
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          resolve(url);
        } catch (err) {
          reject(err);
        }
      },
    );
  });
}
