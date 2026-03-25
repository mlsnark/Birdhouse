/**
 * trackLibrary — locally persisted list of named track URLs.
 * Stored in AsyncStorage as JSON.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@birdhouse_track_library';

export async function getLibrary() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function addTrack(name, url) {
  const lib = await getLibrary();
  const track = { id: `${Date.now()}`, name: name.trim(), url: url.trim() };
  await AsyncStorage.setItem(KEY, JSON.stringify([...lib, track]));
  return track;
}

export async function removeTrack(id) {
  const lib = await getLibrary();
  await AsyncStorage.setItem(KEY, JSON.stringify(lib.filter((t) => t.id !== id)));
}
