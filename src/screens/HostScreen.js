/**
 * HostScreen
 *
 * Setup phase:
 *   - Host name + optional personal track URL
 *   - Define roles (name + track URL, each pickable from the track library)
 *   - Manage track library (add / delete saved tracks)
 *
 * Lobby phase:
 *   - Shows room code, roles overview (who claimed what), participant ready status
 *   - Host can still manually override any participant's track URL
 *   - "Begin Experience" triggers synchronized playback
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
} from 'react-native';
import { colors, radius } from '../theme';
import {
  generateRoomCode,
  createSession,
  subscribeSession,
  setParticipantTrack,
  initiateStart,
  endSession,
} from '../services/sessionService';
import { getLibrary, addTrack, removeTrack } from '../services/trackLibrary';
import { uploadTrack } from '../services/storageService';
import * as DocumentPicker from 'expo-document-picker';
import { getDeviceId } from '../utils/deviceId';
import clockSync from '../services/clockSync';
import audioPlayer from '../services/audioPlayer';

// ─── Library Picker Modal ────────────────────────────────────────────────────

function LibraryPickerModal({ visible, library, onSelect, onClose, onAddToLibrary }) {
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  async function handleAdd() {
    if (!newName.trim() || !newUrl.trim()) return;
    await onAddToLibrary(newName.trim(), newUrl.trim());
    setNewName('');
    setNewUrl('');
  }

  async function handleUpload() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const file = result.assets[0];
      const filename = file.name ?? `track_${Date.now()}.mp3`;

      setUploading(true);
      setUploadProgress(0);

      const url = await uploadTrack(file.uri, filename, setUploadProgress);

      // Pre-fill name from filename (strip extension)
      const baseName = filename.replace(/\.[^/.]+$/, '');
      setNewUrl(url);
      if (!newName.trim()) setNewName(baseName);
    } catch (err) {
      Alert.alert('Upload failed', err.message ?? 'Could not upload file.');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={modal.safe}>
        <View style={modal.header}>
          <Text style={modal.title}>Track Library</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={modal.closeBtn}>Done</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={modal.scroll} keyboardShouldPersistTaps="handled">
          {/* Add new track */}
          <Text style={modal.sectionLabel}>Add New Track</Text>

          {/* Upload button */}
          <TouchableOpacity
            style={[modal.uploadBtn, uploading && modal.addBtnDisabled]}
            onPress={handleUpload}
            disabled={uploading}
          >
            {uploading ? (
              <View style={modal.uploadingRow}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={modal.uploadBtnText}>
                  Uploading… {Math.round(uploadProgress * 100)}%
                </Text>
              </View>
            ) : (
              <Text style={modal.uploadBtnText}>Upload from Phone</Text>
            )}
          </TouchableOpacity>

          <Text style={modal.orDivider}>— or paste a URL —</Text>

          <TextInput
            style={modal.input}
            placeholder="Track name (e.g. Soprano Part)"
            placeholderTextColor={colors.textDim}
            value={newName}
            onChangeText={setNewName}
          />
          <TextInput
            style={modal.input}
            placeholder="URL (https://…)"
            placeholderTextColor={colors.textDim}
            value={newUrl}
            onChangeText={setNewUrl}
            autoCapitalize="none"
            keyboardType="url"
          />
          <TouchableOpacity
            style={[modal.addBtn, (!newName.trim() || !newUrl.trim()) && modal.addBtnDisabled]}
            onPress={handleAdd}
            disabled={!newName.trim() || !newUrl.trim()}
          >
            <Text style={modal.addBtnText}>+ Save to Library</Text>
          </TouchableOpacity>

          {/* Saved tracks */}
          <Text style={[modal.sectionLabel, { marginTop: 24 }]}>Saved Tracks</Text>
          {library.length === 0 && (
            <Text style={modal.emptyText}>No saved tracks yet.</Text>
          )}
          {library.map((track) => (
            <View key={track.id} style={modal.trackRow}>
              <View style={modal.trackInfo}>
                <Text style={modal.trackName}>{track.name}</Text>
                <Text style={modal.trackUrl} numberOfLines={1}>{track.url}</Text>
              </View>
              <TouchableOpacity style={modal.pickBtn} onPress={() => onSelect(track)}>
                <Text style={modal.pickBtnText}>Pick</Text>
              </TouchableOpacity>
              <TouchableOpacity style={modal.deleteBtn} onPress={() => onAddToLibrary(null, null, track.id)}>
                <Text style={modal.deleteBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function HostScreen({ navigation }) {
  const [phase, setPhase] = useState('setup');
  const [hostName, setHostName] = useState('');
  const [hostTrackUrl, setHostTrackUrl] = useState('');
  const [roles, setRoles] = useState([]); // [{ id, name, trackUrl }]
  const [roomCode, setRoomCode] = useState('');
  const [session, setSession] = useState(null);
  const [starting, setStarting] = useState(false);
  const [trackDrafts, setTrackDrafts] = useState({});
  const [library, setLibrary] = useState([]);
  const [libraryModal, setLibraryModal] = useState({ visible: false, onSelect: null });

  const deviceIdRef = useRef(null);
  const unsubscribeRef = useRef(null);

  useEffect(() => {
    (async () => {
      await clockSync.init();
      await audioPlayer.init();
      deviceIdRef.current = await getDeviceId();
      setLibrary(await getLibrary());
    })();
    return () => {
      if (unsubscribeRef.current) unsubscribeRef.current();
    };
  }, []);

  // Navigate to Playback when session starts
  useEffect(() => {
    if (!session) return;
    if (session.status === 'starting' && session.startAt) {
      const myEntry = session.participants?.[deviceIdRef.current];
      navigation.replace('Playback', {
        roomCode,
        deviceId: deviceIdRef.current,
        trackUrl: myEntry?.trackUrl ?? '',
        startAt: session.startAt,
        isHost: true,
      });
    }
  }, [session?.status, session?.startAt]);

  // ── Library helpers ────────────────────────────────────────────────────────

  function openLibraryPicker(onSelect) {
    setLibraryModal({ visible: true, onSelect });
  }

  async function handleLibraryAction(name, url, deleteId) {
    if (deleteId) {
      await removeTrack(deleteId);
    } else {
      await addTrack(name, url);
    }
    setLibrary(await getLibrary());
  }

  function handleLibrarySelect(track) {
    if (libraryModal.onSelect) libraryModal.onSelect(track);
    setLibraryModal({ visible: false, onSelect: null });
  }

  // ── Roles management ───────────────────────────────────────────────────────

  function addRole() {
    setRoles((r) => [...r, { id: `${Date.now()}`, name: '', trackUrl: '' }]);
  }

  function updateRole(id, patch) {
    setRoles((r) => r.map((role) => (role.id === id ? { ...role, ...patch } : role)));
  }

  function deleteRole(id) {
    setRoles((r) => r.filter((role) => role.id !== id));
  }

  // ── Create session ─────────────────────────────────────────────────────────

  async function handleCreate() {
    if (!hostName.trim()) {
      Alert.alert('Name required', 'Please enter your name.');
      return;
    }

    const incompleteRole = roles.find((r) => !r.name.trim() || !r.trackUrl.trim());
    if (incompleteRole) {
      Alert.alert('Incomplete role', 'Every role needs a name and a track URL.');
      return;
    }

    const code = generateRoomCode();
    const deviceId = deviceIdRef.current;

    try {
      await createSession(code, deviceId, hostName.trim(), hostTrackUrl.trim(), roles);
      setRoomCode(code);
      setTrackDrafts({ [deviceId]: hostTrackUrl.trim() });

      unsubscribeRef.current = subscribeSession(code, (data) => setSession(data));
      setPhase('lobby');
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  }

  // ── Track management (lobby) ───────────────────────────────────────────────

  const handleTrackChange = useCallback((deviceId, url) => {
    setTrackDrafts((d) => ({ ...d, [deviceId]: url }));
  }, []);

  const handleTrackSave = useCallback(async (deviceId) => {
    const url = (trackDrafts[deviceId] ?? '').trim();
    try {
      await setParticipantTrack(roomCode, deviceId, url);
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  }, [roomCode, trackDrafts]);

  // ── Start countdown ────────────────────────────────────────────────────────

  async function handleStart() {
    const participants = session?.participants ?? {};
    const missing = Object.entries(participants).filter(([, p]) => !p.trackUrl?.trim());
    if (missing.length > 0) {
      Alert.alert(
        'Missing tracks',
        `${missing.length} participant(s) have no track URL. Assign tracks before starting.`,
      );
      return;
    }

    const notReady = Object.entries(participants).filter(
      ([id, p]) => id !== deviceIdRef.current && !p.ready,
    );
    if (notReady.length > 0) {
      Alert.alert(
        'Participants not ready',
        `${notReady.length} participant(s) haven't finished loading yet. Start anyway?`,
        [
          { text: 'Wait', style: 'cancel' },
          { text: 'Start Anyway', onPress: doStart },
        ],
      );
      return;
    }

    doStart();
  }

  async function doStart() {
    setStarting(true);
    try {
      await initiateStart(roomCode, 5);
    } catch (err) {
      Alert.alert('Error', err.message);
      setStarting(false);
    }
  }

  // ── Leave / end ────────────────────────────────────────────────────────────

  function handleLeave() {
    Alert.alert('End Session', 'This will disconnect all participants.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Session',
        style: 'destructive',
        onPress: async () => {
          if (unsubscribeRef.current) unsubscribeRef.current();
          await endSession(roomCode).catch(() => {});
          navigation.goBack();
        },
      },
    ]);
  }

  // ── Render: Setup ──────────────────────────────────────────────────────────

  if (phase === 'setup') {
    return (
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.setupScroll} keyboardShouldPersistTaps="handled">

            <Text style={styles.sectionTitle}>Host Setup</Text>
            <Text style={styles.sectionSub}>
              Configure your session, define roles, then share the room code.
            </Text>

            {/* Your info */}
            <Label>Your Name</Label>
            <TextInput
              style={styles.input}
              placeholder="e.g. Alice"
              placeholderTextColor={colors.textDim}
              value={hostName}
              onChangeText={setHostName}
              autoCapitalize="words"
              returnKeyType="next"
            />

            <Label>Your Track URL (optional)</Label>
            <View style={styles.urlRow}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                placeholder="https://…/your-track.mp3"
                placeholderTextColor={colors.textDim}
                value={hostTrackUrl}
                onChangeText={setHostTrackUrl}
                autoCapitalize="none"
                keyboardType="url"
              />
              <TouchableOpacity
                style={styles.libraryBtn}
                onPress={() => openLibraryPicker((t) => setHostTrackUrl(t.url))}
              >
                <Text style={styles.libraryBtnText}>Library</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.hint}>Leave blank if you are only coordinating.</Text>

            {/* Roles */}
            <View style={styles.rolesHeader}>
              <Text style={styles.sectionTitle}>Roles</Text>
              <TouchableOpacity style={styles.addRoleBtn} onPress={addRole}>
                <Text style={styles.addRoleBtnText}>+ Add Role</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.sectionSub}>
              Pre-assign tracks by role. Participants pick their role when joining.
            </Text>

            {roles.length === 0 && (
              <Text style={styles.emptyHint}>
                No roles defined — you'll assign tracks manually after participants join.
              </Text>
            )}

            {roles.map((role) => (
              <View key={role.id} style={styles.roleCard}>
                <View style={styles.roleCardHeader}>
                  <TextInput
                    style={styles.roleNameInput}
                    placeholder="Role name (e.g. Soprano)"
                    placeholderTextColor={colors.textDim}
                    value={role.name}
                    onChangeText={(v) => updateRole(role.id, { name: v })}
                    autoCapitalize="words"
                  />
                  <TouchableOpacity onPress={() => deleteRole(role.id)} style={styles.removeRoleBtn}>
                    <Text style={styles.removeRoleBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.urlRow}>
                  <TextInput
                    style={[styles.roleUrlInput, { flex: 1 }]}
                    placeholder="Track URL…"
                    placeholderTextColor={colors.textDim}
                    value={role.trackUrl}
                    onChangeText={(v) => updateRole(role.id, { trackUrl: v })}
                    autoCapitalize="none"
                    keyboardType="url"
                  />
                  <TouchableOpacity
                    style={styles.libraryBtn}
                    onPress={() => openLibraryPicker((t) => updateRole(role.id, { trackUrl: t.url }))}
                  >
                    <Text style={styles.libraryBtnText}>Library</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            <TouchableOpacity style={styles.primaryBtn} onPress={handleCreate} activeOpacity={0.85}>
              <Text style={styles.primaryBtnText}>Create Session</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>

        <LibraryPickerModal
          visible={libraryModal.visible}
          library={library}
          onSelect={handleLibrarySelect}
          onClose={() => setLibraryModal({ visible: false, onSelect: null })}
          onAddToLibrary={handleLibraryAction}
        />
      </SafeAreaView>
    );
  }

  // ── Render: Lobby ──────────────────────────────────────────────────────────

  const participants = session?.participants ?? {};
  const participantList = Object.entries(participants);
  const readyCount = participantList.filter(([, p]) => p.ready).length;
  const sessionRoles = session?.roles ?? {};
  const hasRoles = Object.keys(sessionRoles).length > 0;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.lobbyScroll}>

          {/* Room code */}
          <View style={styles.codeCard}>
            <Text style={styles.codeLabel}>ROOM CODE</Text>
            <Text style={styles.codeText}>{roomCode}</Text>
            <Text style={styles.codeSub}>Share this code with all participants</Text>
          </View>

          {/* Roles overview */}
          {hasRoles && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Roles</Text>
              {Object.entries(sessionRoles).map(([roleId, role]) => {
                const claimedBy = role.takenBy ? participants[role.takenBy] : null;
                return (
                  <View key={roleId} style={styles.roleStatusCard}>
                    <View style={styles.roleStatusLeft}>
                      <Text style={styles.roleStatusName}>{role.name}</Text>
                      <Text style={styles.roleStatusUrl} numberOfLines={1}>{role.trackUrl}</Text>
                    </View>
                    <View style={styles.roleStatusRight}>
                      {claimedBy ? (
                        <View style={styles.claimedBadge}>
                          <View style={[styles.readyDot, claimedBy.ready && styles.readyDotActive]} />
                          <Text style={styles.claimedName}>{claimedBy.name}</Text>
                        </View>
                      ) : (
                        <Text style={styles.unclaimedText}>open</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Participants */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Participants ({participantList.length})
              {'  '}
              <Text style={styles.readyBadge}>{readyCount}/{participantList.length} ready</Text>
            </Text>

            {participantList.length === 0 && (
              <Text style={styles.emptyHint}>Waiting for participants to join…</Text>
            )}

            {participantList.map(([id, participant]) => {
              const isMe = id === deviceIdRef.current;
              const draft = trackDrafts[id] ?? participant.trackUrl ?? '';
              const saved = participant.trackUrl ?? '';
              const isDirty = draft !== saved;
              const hasRole = !!participant.roleId;

              return (
                <View key={id} style={styles.participantCard}>
                  <View style={styles.participantHeader}>
                    <View>
                      <Text style={styles.participantName}>
                        {participant.name}{isMe ? '  (you)' : ''}
                      </Text>
                      {hasRole && sessionRoles[participant.roleId] && (
                        <Text style={styles.participantRole}>
                          {sessionRoles[participant.roleId].name}
                        </Text>
                      )}
                    </View>
                    <View style={[styles.readyDot, participant.ready && styles.readyDotActive]} />
                  </View>

                  {!hasRole && (
                    <View style={styles.trackRow}>
                      <TextInput
                        style={[styles.trackInput, isDirty && styles.trackInputDirty]}
                        placeholder="Track URL…"
                        placeholderTextColor={colors.textDim}
                        value={draft}
                        onChangeText={(url) => handleTrackChange(id, url)}
                        onBlur={() => handleTrackSave(id)}
                        autoCapitalize="none"
                        keyboardType="url"
                        returnKeyType="done"
                        onSubmitEditing={() => handleTrackSave(id)}
                      />
                      {isDirty && (
                        <TouchableOpacity style={styles.saveBtn} onPress={() => handleTrackSave(id)}>
                          <Text style={styles.saveBtnText}>Save</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}

                  {participant.ready && (
                    <Text style={styles.readyText}>Track loaded</Text>
                  )}
                </View>
              );
            })}
          </View>

          {/* Actions */}
          <TouchableOpacity
            style={[styles.primaryBtn, starting && styles.btnDisabled]}
            onPress={handleStart}
            disabled={starting || participantList.length === 0}
            activeOpacity={0.85}
          >
            {starting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Begin Experience</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.dangerBtn} onPress={handleLeave}>
            <Text style={styles.dangerBtnText}>End Session</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Label({ children }) {
  return <Text style={styles.label}>{children}</Text>;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  setupScroll: { padding: 24, paddingTop: 12, paddingBottom: 40 },
  sectionTitle: { fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: 6 },
  sectionSub: { fontSize: 14, color: colors.textMuted, lineHeight: 20, marginBottom: 20 },
  label: {
    fontSize: 13, fontWeight: '600', color: colors.textMuted,
    marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 14,
    color: colors.text, fontSize: 15, marginBottom: 16,
  },
  hint: { fontSize: 12, color: colors.textDim, marginTop: 4, marginBottom: 24 },

  urlRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  libraryBtn: {
    backgroundColor: colors.primaryDim, borderRadius: radius.sm,
    paddingHorizontal: 12, paddingVertical: 14,
  },
  libraryBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },

  rolesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 6 },
  addRoleBtn: { backgroundColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 8 },
  addRoleBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  emptyHint: { color: colors.textDim, fontSize: 13, fontStyle: 'italic', marginBottom: 16 },

  roleCard: {
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    padding: 12, marginBottom: 10,
  },
  roleCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  roleNameInput: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 15,
  },
  removeRoleBtn: { padding: 6 },
  removeRoleBtnText: { color: colors.danger, fontSize: 18, fontWeight: '700' },
  roleUrlInput: {
    backgroundColor: colors.surface, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 13,
  },

  primaryBtn: {
    backgroundColor: colors.primary, borderRadius: radius.lg,
    paddingVertical: 16, alignItems: 'center', marginTop: 24, marginBottom: 12,
  },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },
  dangerBtn: {
    borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: colors.danger,
  },
  dangerBtnText: { color: colors.danger, fontSize: 15, fontWeight: '600' },

  // Lobby
  lobbyScroll: { padding: 20, paddingBottom: 40 },
  codeCard: {
    backgroundColor: colors.primaryDim, borderRadius: radius.lg,
    padding: 24, alignItems: 'center', marginBottom: 28,
  },
  codeLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.6)', letterSpacing: 2, marginBottom: 8 },
  codeText: { fontSize: 48, fontWeight: '900', color: '#fff', letterSpacing: 8 },
  codeSub: { marginTop: 8, fontSize: 13, color: 'rgba(255,255,255,0.5)' },
  section: { marginBottom: 24 },
  readyBadge: { fontSize: 14, fontWeight: '500', color: colors.accent },

  roleStatusCard: {
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    padding: 12, marginTop: 8,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  roleStatusLeft: { flex: 1, marginRight: 12 },
  roleStatusName: { fontSize: 15, fontWeight: '600', color: colors.text },
  roleStatusUrl: { fontSize: 11, color: colors.textDim, marginTop: 2 },
  roleStatusRight: { alignItems: 'flex-end' },
  claimedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  claimedName: { fontSize: 13, color: colors.text, fontWeight: '500' },
  unclaimedText: { fontSize: 12, color: colors.textDim, fontStyle: 'italic' },

  participantCard: {
    backgroundColor: colors.card, borderRadius: radius.md,
    padding: 14, marginTop: 10,
    borderWidth: 1, borderColor: colors.border,
  },
  participantHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 8,
  },
  participantName: { fontSize: 15, fontWeight: '600', color: colors.text },
  participantRole: { fontSize: 12, color: colors.primary, marginTop: 2 },
  readyDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.textDim },
  readyDotActive: { backgroundColor: colors.accent },
  readyText: { fontSize: 12, color: colors.accent, marginTop: 6 },
  trackRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  trackInput: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 13,
  },
  trackInputDirty: { borderColor: colors.primary },
  saveBtn: { backgroundColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10 },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
});

const modal = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  closeBtn: { fontSize: 16, color: colors.primary, fontWeight: '600' },
  scroll: { padding: 20 },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10,
  },
  input: {
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 12,
    color: colors.text, fontSize: 14, marginBottom: 10,
  },
  uploadBtn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginBottom: 12 },
  uploadBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  uploadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  orDivider: { textAlign: 'center', color: colors.textDim, fontSize: 12, marginBottom: 12 },
  addBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center' },
  addBtnDisabled: { opacity: 0.4 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  emptyText: { color: colors.textDim, fontStyle: 'italic', fontSize: 13 },
  trackRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    padding: 12, marginBottom: 8, gap: 8,
  },
  trackInfo: { flex: 1 },
  trackName: { fontSize: 14, fontWeight: '600', color: colors.text },
  trackUrl: { fontSize: 11, color: colors.textDim, marginTop: 2 },
  pickBtn: { backgroundColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8 },
  pickBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  deleteBtn: { padding: 6 },
  deleteBtnText: { color: colors.danger, fontSize: 16, fontWeight: '700' },
});
