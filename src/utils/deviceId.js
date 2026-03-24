import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@birdhouse/deviceId';

let cached = null;

/**
 * Returns a stable, locally-generated device identifier.
 * Generated once and persisted in AsyncStorage.
 */
export async function getDeviceId() {
  if (cached) return cached;

  let id = await AsyncStorage.getItem(KEY);
  if (!id) {
    // Simple but collision-resistant enough for a local/LAN session tool.
    id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    await AsyncStorage.setItem(KEY, id);
  }

  cached = id;
  return id;
}
